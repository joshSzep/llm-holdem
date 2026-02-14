import { HandEngine } from "../src/lib/runtime/hand-engine";
import { pathToFileURL } from "node:url";

type SeatState = {
  seatIndex: number;
  stack: number;
  isEliminated: boolean;
};

type Legal = {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
};

type Decision = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount: number;
};

type ResolvedLike = {
  winners: Array<{ seatIndex: number; amountWon: number }>;
  sidePots: Array<{
    potIndex: number;
    amount: number;
    contributionLevel: number;
    participantSeats: number[];
    eligibleSeats: number[];
    winnerSeats: number[];
  }>;
  updatedStacks: Array<{ seatIndex: number; stack: number; isEliminated: boolean }>;
};

function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function totalStacks(seats: SeatState[]): number {
  return seats.reduce((sum, seat) => sum + seat.stack, 0);
}

function chooseDecision(legal: Legal, random: () => number): Decision {
  const candidates: Decision[] = [];

  if (legal.canFold) {
    candidates.push({ action: "fold", amount: 0 });
  }
  if (legal.canCheck) {
    candidates.push({ action: "check", amount: 0 });
  }
  if (legal.callAmount > 0) {
    candidates.push({ action: "call", amount: legal.callAmount });
  }
  if (legal.canAllIn) {
    candidates.push({ action: "all_in", amount: legal.maxRaiseTo });
  }
  if (legal.canCheck && legal.maxRaiseTo >= legal.minBet) {
    const span = Math.max(0, legal.maxRaiseTo - legal.minBet);
    const bet = legal.minBet + Math.floor(random() * (span + 1));
    candidates.push({ action: "bet", amount: bet });
  }
  if (legal.callAmount > 0 && legal.maxRaiseTo >= legal.minRaiseTo) {
    const span = Math.max(0, legal.maxRaiseTo - legal.minRaiseTo);
    const raiseTo = legal.minRaiseTo + Math.floor(random() * (span + 1));
    candidates.push({ action: "raise", amount: raiseTo });
  }

  if (candidates.length === 0) {
    return { action: "check", amount: 0 };
  }

  return candidates[Math.floor(random() * candidates.length)];
}

function assertResolvedHand(
  resolved: ResolvedLike,
  expectedTotalStack: number,
  label: string,
): void {
  const sidePotTotal = resolved.sidePots.reduce((sum, sidePot) => sum + sidePot.amount, 0);
  const winnerTotal = resolved.winners.reduce((sum, winner) => sum + winner.amountWon, 0);

  if (sidePotTotal !== winnerTotal) {
    throw new Error(
      `${label}: side-pot total ${sidePotTotal} does not match winner total ${winnerTotal}.`,
    );
  }

  const payoutBySeat = new Map<number, number>();
  for (const sidePot of resolved.sidePots) {
    if (sidePot.amount < 0) {
      throw new Error(`${label}: negative side-pot amount at pot ${sidePot.potIndex}.`);
    }

    if (sidePot.winnerSeats.length > 0) {
      const base = Math.floor(sidePot.amount / sidePot.winnerSeats.length);
      let remainder = sidePot.amount % sidePot.winnerSeats.length;

      for (const winnerSeat of sidePot.winnerSeats) {
        if (!sidePot.eligibleSeats.includes(winnerSeat)) {
          throw new Error(
            `${label}: winner seat ${winnerSeat} not eligible in side-pot ${sidePot.potIndex}.`,
          );
        }

        const extra = remainder > 0 ? 1 : 0;
        remainder = Math.max(0, remainder - 1);
        payoutBySeat.set(winnerSeat, (payoutBySeat.get(winnerSeat) ?? 0) + base + extra);
      }
    }
  }

  for (const winner of resolved.winners) {
    const fromSidePots = payoutBySeat.get(winner.seatIndex) ?? 0;
    if (fromSidePots !== winner.amountWon) {
      throw new Error(
        `${label}: winner payout mismatch for seat ${winner.seatIndex} (${winner.amountWon} != ${fromSidePots}).`,
      );
    }
  }

  const stackTotal = resolved.updatedStacks.reduce((sum, seat) => sum + seat.stack, 0);
  if (stackTotal !== expectedTotalStack) {
    throw new Error(
      `${label}: stack conservation failed ${stackTotal} != ${expectedTotalStack}.`,
    );
  }
}

export function runRandomizedSimulation(seed: number): void {
  const random = mulberry32(seed);
  const engine = new HandEngine({
    matchSeed: `verify-${seed}`,
    startingStack: 2000,
    blindLevels: [
      { smallBlind: 10, bigBlind: 20 },
      { smallBlind: 20, bigBlind: 40 },
      { smallBlind: 30, bigBlind: 60 },
    ],
    handsPerLevel: 10,
  });

  let seats: SeatState[] = Array.from({ length: 6 }).map((_, index) => ({
    seatIndex: index,
    stack: 2000,
    isEliminated: false,
  }));

  const initialTotal = totalStacks(seats);

  for (let handNumber = 1; handNumber <= 40; handNumber += 1) {
    let guard = 0;

    while (guard < 500) {
      guard += 1;
      const step = engine.nextDecision(seats, handNumber);

      if (step.type === "hand_complete") {
        assertResolvedHand(step.hand, initialTotal, `randomized seed=${seed} hand=${handNumber} complete-step`);
        seats = seats.map((seat) => {
          const updated = step.hand.updatedStacks.find((candidate) => candidate.seatIndex === seat.seatIndex);
          return updated
            ? { seatIndex: seat.seatIndex, stack: updated.stack, isEliminated: updated.isEliminated }
            : seat;
        });
        break;
      }

      const decision = chooseDecision(step.hand.legal as Legal, random);
      const apply = engine.applyDecision(decision);

      if (apply.handComplete) {
        const resolved = engine.finalizeCurrentHand();
        assertResolvedHand(resolved, initialTotal, `randomized seed=${seed} hand=${handNumber} finalize`);
        seats = seats.map((seat) => {
          const updated = resolved.updatedStacks.find((candidate) => candidate.seatIndex === seat.seatIndex);
          return updated
            ? { seatIndex: seat.seatIndex, stack: updated.stack, isEliminated: updated.isEliminated }
            : seat;
        });
        break;
      }
    }

    if (guard >= 500) {
      throw new Error(`Simulation stalled at hand ${handNumber}.`);
    }

    const afterTotal = totalStacks(seats);
    if (afterTotal !== initialTotal) {
      throw new Error(
        `Chip conservation failed in randomized simulation: ${afterTotal} != ${initialTotal} (hand ${handNumber}).`,
      );
    }

    if (seats.filter((seat) => !seat.isEliminated && seat.stack > 0).length <= 1) {
      return;
    }
  }
}

export function runForcedAllInScenario(seed: number): void {
  const engine = new HandEngine({
    matchSeed: `forced-allin-${seed}`,
    startingStack: 2000,
    blindLevels: [{ smallBlind: 10, bigBlind: 20 }],
    handsPerLevel: 100,
  });

  const initialSeats: SeatState[] = [
    { seatIndex: 0, stack: 300, isEliminated: false },
    { seatIndex: 1, stack: 700, isEliminated: false },
    { seatIndex: 2, stack: 1500, isEliminated: false },
    { seatIndex: 3, stack: 1500, isEliminated: false },
  ];

  const initialTotal = totalStacks(initialSeats);
  const seats = [...initialSeats];
  let guard = 0;

  while (guard < 200) {
    guard += 1;
    const step = engine.nextDecision(seats, 1);

    if (step.type === "hand_complete") {
      assertResolvedHand(step.hand, initialTotal, `forced-allin seed=${seed} complete-step`);
      const finalTotal = step.hand.updatedStacks.reduce((sum, seat) => sum + seat.stack, 0);
      if (finalTotal !== initialTotal) {
        throw new Error(
          `Forced all-in scenario broke conservation: ${finalTotal} != ${initialTotal}.`,
        );
      }
      return;
    }

    const action: Decision = step.hand.legal.canAllIn
      ? { action: "all_in", amount: step.hand.legal.maxRaiseTo }
      : step.hand.legal.callAmount > 0
        ? { action: "call", amount: step.hand.legal.callAmount }
        : step.hand.legal.canCheck
          ? { action: "check", amount: 0 }
          : { action: "fold", amount: 0 };

    const apply = engine.applyDecision(action);

    if (apply.handComplete) {
      const resolved = engine.finalizeCurrentHand();
      assertResolvedHand(resolved, initialTotal, `forced-allin seed=${seed} finalize`);
      const finalTotal = resolved.updatedStacks.reduce((sum, seat) => sum + seat.stack, 0);
      if (finalTotal !== initialTotal) {
        throw new Error(
          `Forced all-in finalized hand broke conservation: ${finalTotal} != ${initialTotal}.`,
        );
      }
      return;
    }
  }

  throw new Error("Forced all-in scenario did not resolve.");
}

export function runHandEngineVerification() {
  for (let seed = 1; seed <= 25; seed += 1) {
    runRandomizedSimulation(seed);
    runForcedAllInScenario(seed);
  }
}

export function main() {
  runHandEngineVerification();
  process.stdout.write("hand engine verification passed\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}