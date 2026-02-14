import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { HandEngine } from "../src/lib/runtime/hand-engine";

type SeatState = {
  seatIndex: number;
  stack: number;
  isEliminated: boolean;
};

type Decision = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount: number;
};

type SimulationResult = {
  fingerprint: string;
  transcript: string[];
  completedHands: number;
  remainingSeats: number;
};

function hashToInt(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildCandidates(legal: {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
}): Decision[] {
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
    candidates.push({ action: "bet", amount: legal.minBet });
    if (legal.maxRaiseTo > legal.minBet) {
      candidates.push({ action: "bet", amount: legal.maxRaiseTo });
    }
  }
  if (legal.callAmount > 0 && legal.maxRaiseTo >= legal.minRaiseTo) {
    candidates.push({ action: "raise", amount: legal.minRaiseTo });
    if (legal.maxRaiseTo > legal.minRaiseTo) {
      candidates.push({ action: "raise", amount: legal.maxRaiseTo });
    }
  }

  return candidates.length > 0 ? candidates : [{ action: "check", amount: 0 }];
}

function chooseDeterministicDecision(
  policySeed: string,
  hand: {
    handNumber: number;
    street: string;
    actorSeatIndex: number;
    board: string[];
    legal: {
      canFold: boolean;
      canCheck: boolean;
      callAmount: number;
      minBet: number;
      minRaiseTo: number;
      maxRaiseTo: number;
      canAllIn: boolean;
    };
    seats: Array<{ seatIndex: number; stack: number; folded: boolean; allIn: boolean; contribution: number }>;
    actionsThisHand: Array<{ seatIndex: number; action: string; amount: number }>;
  },
): Decision {
  const candidates = buildCandidates(hand.legal);
  const stateKey = JSON.stringify({
    policySeed,
    handNumber: hand.handNumber,
    street: hand.street,
    actor: hand.actorSeatIndex,
    board: hand.board,
    legal: hand.legal,
    seats: hand.seats,
    actionsThisHand: hand.actionsThisHand,
  });

  const index = hashToInt(stateKey) % candidates.length;
  return candidates[index];
}

function normalizeSeatState(seats: SeatState[]): SeatState[] {
  return [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
}

export function runDeterministicSimulation(matchSeed: string, policySeed: string): SimulationResult {
  const engine = new HandEngine({
    matchSeed,
    startingStack: 2000,
    blindLevels: [
      { smallBlind: 10, bigBlind: 20 },
      { smallBlind: 15, bigBlind: 30 },
      { smallBlind: 20, bigBlind: 40 },
      { smallBlind: 30, bigBlind: 60 },
    ],
    handsPerLevel: 10,
  });

  let seats: SeatState[] = Array.from({ length: 6 }).map((_, seatIndex) => ({
    seatIndex,
    stack: 2000,
    isEliminated: false,
  }));

  const transcript: string[] = [];
  const MAX_HANDS = 60;
  const MAX_STEPS_PER_HAND = 500;

  for (let handNumber = 1; handNumber <= MAX_HANDS; handNumber += 1) {
    let steps = 0;

    while (steps < MAX_STEPS_PER_HAND) {
      steps += 1;
      const step = engine.nextDecision(seats, handNumber);

      if (step.type === "hand_complete") {
        transcript.push(
          `complete|h:${step.hand.handNumber}|board:${step.hand.board.join("")}|w:${JSON.stringify(step.hand.winners)}|p:${JSON.stringify(step.hand.sidePots)}|s:${JSON.stringify(step.hand.updatedStacks)}`,
        );

        seats = normalizeSeatState(
          step.hand.updatedStacks.map((seat) => ({
            seatIndex: seat.seatIndex,
            stack: seat.stack,
            isEliminated: seat.isEliminated,
          })),
        );
        break;
      }

      const decision = chooseDeterministicDecision(policySeed, {
        handNumber: step.hand.handNumber,
        street: step.hand.street,
        actorSeatIndex: step.hand.actorSeatIndex,
        board: step.hand.board,
        legal: step.hand.legal,
        seats: step.hand.seats,
        actionsThisHand: step.hand.actionsThisHand.map((action) => ({
          seatIndex: action.seatIndex,
          action: action.action,
          amount: action.amount,
        })),
      });

      transcript.push(
        `decision|h:${step.hand.handNumber}|st:${step.hand.street}|a:${step.hand.actorSeatIndex}|b:${step.hand.board.join("")}|d:${decision.action}:${decision.amount}`,
      );

      const apply = engine.applyDecision(decision);

      if (apply.handComplete) {
        const resolved = engine.finalizeCurrentHand();
        transcript.push(
          `finalize|h:${resolved.handNumber}|board:${resolved.board.join("")}|w:${JSON.stringify(resolved.winners)}|p:${JSON.stringify(resolved.sidePots)}|s:${JSON.stringify(resolved.updatedStacks)}`,
        );

        seats = normalizeSeatState(
          resolved.updatedStacks.map((seat) => ({
            seatIndex: seat.seatIndex,
            stack: seat.stack,
            isEliminated: seat.isEliminated,
          })),
        );
        break;
      }
    }

    if (steps >= MAX_STEPS_PER_HAND) {
      throw new Error(`Simulation stalled for seed ${matchSeed} on hand ${handNumber}.`);
    }

    const remainingSeats = seats.filter((seat) => !seat.isEliminated && seat.stack > 0).length;
    if (remainingSeats <= 1) {
      const fingerprint = createHash("sha256").update(transcript.join("\n")).digest("hex");
      return {
        fingerprint,
        transcript,
        completedHands: handNumber,
        remainingSeats,
      };
    }
  }

  const fingerprint = createHash("sha256").update(transcript.join("\n")).digest("hex");
  return {
    fingerprint,
    transcript,
    completedHands: MAX_HANDS,
    remainingSeats: seats.filter((seat) => !seat.isEliminated && seat.stack > 0).length,
  };
}

export function assertNoReplayDrift(matchSeed: string, policySeed: string): void {
  const runA = runDeterministicSimulation(matchSeed, policySeed);
  const runB = runDeterministicSimulation(matchSeed, policySeed);

  if (runA.fingerprint !== runB.fingerprint) {
    const max = Math.min(runA.transcript.length, runB.transcript.length);
    let mismatchIndex = -1;
    for (let i = 0; i < max; i += 1) {
      if (runA.transcript[i] !== runB.transcript[i]) {
        mismatchIndex = i;
        break;
      }
    }

    throw new Error(
      mismatchIndex >= 0
        ? `Replay drift detected for seed=${matchSeed} at event ${mismatchIndex}.\nA=${runA.transcript[mismatchIndex]}\nB=${runB.transcript[mismatchIndex]}`
        : `Replay drift detected for seed=${matchSeed}: transcript lengths differ (${runA.transcript.length} vs ${runB.transcript.length}).`,
    );
  }
}

export function runDeterminismVerification() {
  const scenarios: Array<{ matchSeed: string; policySeed: string }> = [
    { matchSeed: "replay-regression-001", policySeed: "policy-a" },
    { matchSeed: "replay-regression-002", policySeed: "policy-a" },
    { matchSeed: "replay-regression-003", policySeed: "policy-b" },
  ];

  for (const scenario of scenarios) {
    assertNoReplayDrift(scenario.matchSeed, scenario.policySeed);
  }
}

export function main() {
  runDeterminismVerification();
  process.stdout.write("deterministic replay verification passed\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}