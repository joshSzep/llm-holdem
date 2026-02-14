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

type HandProbe = {
  preflopActor: number;
  flopActor: number | null;
  smallBlindSeat: number;
  bigBlindSeat: number;
};

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function nextActiveAfter(tableOrder: number[], fromSeatIndex: number, activeSeats: Set<number>): number {
  const fromIndex = tableOrder.indexOf(fromSeatIndex);
  const start = fromIndex >= 0 ? fromIndex : -1;

  for (let offset = 1; offset <= tableOrder.length; offset += 1) {
    const idx = (start + offset + tableOrder.length) % tableOrder.length;
    const seatIndex = tableOrder[idx];
    if (activeSeats.has(seatIndex)) {
      return seatIndex;
    }
  }

  throw new Error("Unable to resolve next active seat.");
}

function previousActiveBefore(tableOrder: number[], seatIndex: number, activeSeats: Set<number>): number {
  const fromIndex = tableOrder.indexOf(seatIndex);
  if (fromIndex < 0) {
    throw new Error(`Seat ${seatIndex} is not in table order.`);
  }

  for (let offset = 1; offset <= tableOrder.length; offset += 1) {
    const idx = (fromIndex - offset + tableOrder.length) % tableOrder.length;
    const candidate = tableOrder[idx];
    if (activeSeats.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve previous active seat.");
}

function choosePassiveDecision(legal: {
  canCheck: boolean;
  callAmount: number;
  canFold: boolean;
}): Decision {
  if (legal.canCheck) {
    return { action: "check", amount: 0 };
  }

  if (legal.callAmount > 0) {
    return { action: "call", amount: legal.callAmount };
  }

  if (legal.canFold) {
    return { action: "fold", amount: 0 };
  }

  return { action: "check", amount: 0 };
}

function detectBlinds(seats: Array<{ seatIndex: number; contribution: number }>): {
  smallBlindSeat: number;
  bigBlindSeat: number;
} {
  const contributors = seats
    .filter((seat) => seat.contribution > 0)
    .sort((a, b) => a.contribution - b.contribution || a.seatIndex - b.seatIndex);

  if (contributors.length < 2) {
    throw new Error("Expected at least two blind contributors.");
  }

  return {
    smallBlindSeat: contributors[0].seatIndex,
    bigBlindSeat: contributors[contributors.length - 1].seatIndex,
  };
}

function playAndProbeHand(engine: HandEngine, activeSeats: SeatState[], handNumber: number): HandProbe {
  let preflopActor: number | null = null;
  let flopActor: number | null = null;
  let smallBlindSeat: number | null = null;
  let bigBlindSeat: number | null = null;

  let guard = 0;
  while (guard < 500) {
    guard += 1;

    const step = engine.nextDecision(activeSeats, handNumber);
    if (step.type === "hand_complete") {
      break;
    }

    const state = step.hand;

    const isFirstActionOfStreet = !state.actionsThisHand.some(
      (action) => action.street === state.street,
    );

    if (isFirstActionOfStreet) {
      if (state.street === "preflop") {
        preflopActor = state.actorSeatIndex;
        const blinds = detectBlinds(state.seats);
        smallBlindSeat = blinds.smallBlindSeat;
        bigBlindSeat = blinds.bigBlindSeat;
      }

      if (state.street === "flop") {
        flopActor = state.actorSeatIndex;
      }
    }

    const decision = choosePassiveDecision(state.legal);
    const apply = engine.applyDecision(decision);

    if (apply.handComplete) {
      engine.finalizeCurrentHand();
      break;
    }
  }

  if (guard >= 500) {
    throw new Error(`Hand ${handNumber} did not complete.`);
  }

  assertCondition(preflopActor !== null, `Missing preflop actor for hand ${handNumber}.`);
  assertCondition(smallBlindSeat !== null, `Missing small blind seat for hand ${handNumber}.`);
  assertCondition(bigBlindSeat !== null, `Missing big blind seat for hand ${handNumber}.`);

  return {
    preflopActor: preflopActor as number,
    flopActor,
    smallBlindSeat: smallBlindSeat as number,
    bigBlindSeat: bigBlindSeat as number,
  };
}

function runDeadButtonAndHeadsUpTransitionScenario(): void {
  const tableOrder = [0, 1, 3, 5];
  const engine = new HandEngine({
    matchSeed: "rules-integration-dead-button",
    startingStack: 2000,
    blindLevels: [{ smallBlind: 10, bigBlind: 20 }],
    handsPerLevel: 100,
  });

  const seatsByHand: SeatState[][] = [
    tableOrder.map((seatIndex) => ({ seatIndex, stack: 2000, isEliminated: false })),
    [0, 3, 5].map((seatIndex) => ({ seatIndex, stack: 2000, isEliminated: false })),
    [0, 5].map((seatIndex) => ({ seatIndex, stack: 2000, isEliminated: false })),
  ];

  const hand1 = playAndProbeHand(engine, seatsByHand[0], 1);
  const active1 = new Set(seatsByHand[0].map((seat) => seat.seatIndex));
  const inferredButton1 = previousActiveBefore(tableOrder, hand1.smallBlindSeat, active1);

  const hand2 = playAndProbeHand(engine, seatsByHand[1], 2);
  const active2 = new Set(seatsByHand[1].map((seat) => seat.seatIndex));

  const expectedButton2 = nextActiveAfter(tableOrder, inferredButton1, new Set(tableOrder));
  const expectedSb2 = nextActiveAfter(tableOrder, expectedButton2, active2);
  const expectedBb2 = nextActiveAfter(tableOrder, expectedSb2, active2);
  const expectedPreflopActor2 = nextActiveAfter(tableOrder, expectedBb2, active2);

  assertCondition(
    hand2.smallBlindSeat === expectedSb2,
    `Dead-button small blind mismatch on hand 2: expected ${expectedSb2}, got ${hand2.smallBlindSeat}.`,
  );
  assertCondition(
    hand2.bigBlindSeat === expectedBb2,
    `Dead-button big blind mismatch on hand 2: expected ${expectedBb2}, got ${hand2.bigBlindSeat}.`,
  );
  assertCondition(
    hand2.preflopActor === expectedPreflopActor2,
    `Dead-button preflop actor mismatch on hand 2: expected ${expectedPreflopActor2}, got ${hand2.preflopActor}.`,
  );

  const hand3 = playAndProbeHand(engine, seatsByHand[2], 3);
  const active3 = new Set(seatsByHand[2].map((seat) => seat.seatIndex));

  assertCondition(
    hand3.smallBlindSeat !== hand3.bigBlindSeat,
    "Heads-up hand must have distinct small blind and big blind seats.",
  );
  assertCondition(
    hand3.preflopActor === hand3.smallBlindSeat,
    `Heads-up preflop actor must be the small blind/button (expected ${hand3.smallBlindSeat}, got ${hand3.preflopActor}).`,
  );

  const expectedFlopActor3 = nextActiveAfter(tableOrder, hand3.smallBlindSeat, active3);
  assertCondition(
    hand3.flopActor === expectedFlopActor3,
    `Heads-up flop actor mismatch: expected ${expectedFlopActor3}, got ${hand3.flopActor}.`,
  );
}

function runMultiwayOpeningOrderScenario(): void {
  const tableOrder = [0, 2, 4, 7, 9, 11];
  const engine = new HandEngine({
    matchSeed: "rules-integration-opening-order",
    startingStack: 2000,
    blindLevels: [{ smallBlind: 10, bigBlind: 20 }],
    handsPerLevel: 100,
  });

  const seats = tableOrder.map((seatIndex) => ({
    seatIndex,
    stack: 2000,
    isEliminated: false,
  }));

  const probe = playAndProbeHand(engine, seats, 1);
  const active = new Set(seats.map((seat) => seat.seatIndex));
  const expectedPreflopActor = nextActiveAfter(tableOrder, probe.bigBlindSeat, active);
  const expectedFlopActor = probe.smallBlindSeat;

  assertCondition(
    probe.preflopActor === expectedPreflopActor,
    `Multiway preflop actor mismatch: expected ${expectedPreflopActor}, got ${probe.preflopActor}.`,
  );

  assertCondition(
    probe.flopActor === expectedFlopActor,
    `Multiway flop actor mismatch: expected ${expectedFlopActor}, got ${probe.flopActor}.`,
  );
}

function main() {
  runMultiwayOpeningOrderScenario();
  runDeadButtonAndHeadsUpTransitionScenario();
  process.stdout.write("rules integration verification passed\n");
}

main();
