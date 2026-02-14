import { Hand } from "pokersolver";

import { shuffleDeckWithSeed, type Card } from "@/lib/runtime/cards";

type SeatSnapshot = {
  seatIndex: number;
  stack: number;
  isEliminated: boolean;
};

type ActionRecord = {
  seatIndex: number;
  action: string;
  amount: number;
  handNumber: number;
  street: Street;
};

type LegalActionSet = {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
};

type StepContext = {
  actionCountInStreet: number;
  handComplete: boolean;
  newStreetStarted: boolean;
};

type Street = "preflop" | "flop" | "turn" | "river";

type PlayerState = {
  seatIndex: number;
  stack: number;
  folded: boolean;
  allIn: boolean;
  totalContribution: number;
  streetContribution: number;
  holeCards: [Card, Card];
  actedThisStreet: boolean;
};

export type HandTickResult = {
  handNumber: number;
  street: Street;
  actorSeatIndex: number;
  legal: LegalActionSet;
  board: Card[];
  seats: Array<{
    seatIndex: number;
    stack: number;
    folded: boolean;
    allIn: boolean;
    contribution: number;
  }>;
  actionsThisHand: ActionRecord[];
};

export type HandRuntimeSnapshot = {
  handNumber: number;
  street: Street;
  board: Card[];
  seats: Array<{
    seatIndex: number;
    stack: number;
    folded: boolean;
    allIn: boolean;
    contribution: number;
  }>;
  actionsThisHand: ActionRecord[];
};

export type AppliedDecision = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount: number;
};

export type ResolvedHand = {
  handNumber: number;
  board: Card[];
  winners: Array<{ seatIndex: number; amountWon: number }>;
  updatedStacks: Array<{ seatIndex: number; stack: number; isEliminated: boolean }>;
};

export type EngineStep =
  | {
      type: "decision";
      hand: HandTickResult;
    }
  | {
      type: "hand_complete";
      hand: ResolvedHand;
    };

type RuntimeHandState = {
  handNumber: number;
  buttonSeatIndex: number;
  street: Street;
  board: Card[];
  deck: Card[];
  players: Map<number, PlayerState>;
  orderByStreet: Record<Street, number[]>;
  actorPointer: number;
  currentBet: number;
  lastRaiseSize: number;
  actions: ActionRecord[];
  streetActionCount: number;
};

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];

export class HandEngine {
  private readonly matchSeed: string;
  private readonly startingStack: number;
  private readonly blindLevels: Array<{ smallBlind: number; bigBlind: number }>;
  private readonly handsPerLevel: number;

  private handState: RuntimeHandState | null = null;
  private buttonSeatIndex = -1;
  private tableSeatOrder: number[] = [];

  constructor(options: {
    matchSeed: string;
    startingStack: number;
    blindLevels: Array<{ smallBlind: number; bigBlind: number }>;
    handsPerLevel: number;
  }) {
    this.matchSeed = options.matchSeed;
    this.startingStack = options.startingStack;
    this.blindLevels = options.blindLevels;
    this.handsPerLevel = options.handsPerLevel;
  }

  private getBlindLevel(handNumber: number) {
    const levelIndex = Math.floor((Math.max(handNumber, 1) - 1) / this.handsPerLevel);
    return this.blindLevels[Math.min(levelIndex, this.blindLevels.length - 1)];
  }

  private ensureTableSeatOrder(activeSeats: SeatSnapshot[]): void {
    const merged = new Set<number>(this.tableSeatOrder);
    for (const seat of activeSeats) {
      merged.add(seat.seatIndex);
    }
    this.tableSeatOrder = [...merged].sort((a, b) => a - b);
  }

  private nextPhysicalSeatIndex(fromSeatIndex: number): number {
    if (this.tableSeatOrder.length === 0) {
      throw new Error("Table seat order is empty.");
    }

    if (fromSeatIndex < 0 || !this.tableSeatOrder.includes(fromSeatIndex)) {
      return this.tableSeatOrder[0];
    }

    const currentIndex = this.tableSeatOrder.indexOf(fromSeatIndex);
    const nextIndex = (currentIndex + 1) % this.tableSeatOrder.length;
    return this.tableSeatOrder[nextIndex];
  }

  private nextActiveSeatIndex(fromSeatIndex: number, activeSeatSet: Set<number>): number {
    if (activeSeatSet.size === 0) {
      throw new Error("No active seats available.");
    }

    let cursor = fromSeatIndex;

    for (let i = 0; i < this.tableSeatOrder.length; i += 1) {
      cursor = this.nextPhysicalSeatIndex(cursor);
      if (activeSeatSet.has(cursor)) {
        return cursor;
      }
    }

    throw new Error("Failed to resolve next active seat.");
  }

  private buildActionOrder(startAfterSeatIndex: number, activeSeatSet: Set<number>): number[] {
    const order: number[] = [];
    let cursor = startAfterSeatIndex;

    for (let i = 0; i < activeSeatSet.size; i += 1) {
      const next = this.nextActiveSeatIndex(cursor, activeSeatSet);
      order.push(next);
      cursor = next;
    }

    return order;
  }

  private orderSeatIndexesClockwiseFrom(
    startAfterSeatIndex: number,
    seatIndexes: number[],
  ): number[] {
    const remaining = new Set(seatIndexes);
    const ordered: number[] = [];
    let cursor = startAfterSeatIndex;

    for (let i = 0; i < this.tableSeatOrder.length && remaining.size > 0; i += 1) {
      cursor = this.nextPhysicalSeatIndex(cursor);
      if (remaining.has(cursor)) {
        ordered.push(cursor);
        remaining.delete(cursor);
      }
    }

    return ordered;
  }

  private initializeHand(activeSeats: SeatSnapshot[], handNumber: number): RuntimeHandState {
    this.ensureTableSeatOrder(activeSeats);

    const sortedSeats = [...activeSeats].sort((a, b) => a.seatIndex - b.seatIndex);
    const activeSeatSet = new Set(sortedSeats.map((seat) => seat.seatIndex));

    const isHeadsUp = sortedSeats.length === 2;

    const buttonSeatIndex = isHeadsUp
      ? this.nextActiveSeatIndex(this.buttonSeatIndex, activeSeatSet)
      : this.nextPhysicalSeatIndex(this.buttonSeatIndex);
    this.buttonSeatIndex = buttonSeatIndex;

    const smallBlindSeatIndex = isHeadsUp
      ? buttonSeatIndex
      : this.nextActiveSeatIndex(buttonSeatIndex, activeSeatSet);
    const bigBlindSeatIndex = this.nextActiveSeatIndex(smallBlindSeatIndex, activeSeatSet);

    const preflopOrder = this.buildActionOrder(bigBlindSeatIndex, activeSeatSet);
    const flopOrder = this.buildActionOrder(buttonSeatIndex, activeSeatSet);

    const deck = shuffleDeckWithSeed(`${this.matchSeed}:${handNumber}`);
    const players = new Map<number, PlayerState>();

    for (const seat of sortedSeats) {
      const cardA = deck.shift();
      const cardB = deck.shift();
      if (!cardA || !cardB) {
        throw new Error("Deck exhausted while dealing hole cards.");
      }

      players.set(seat.seatIndex, {
        seatIndex: seat.seatIndex,
        stack: seat.stack,
        folded: false,
        allIn: false,
        totalContribution: 0,
        streetContribution: 0,
        holeCards: [cardA, cardB],
        actedThisStreet: false,
      });
    }

    const blindLevel = this.getBlindLevel(handNumber);

    this.postBlind(players, smallBlindSeatIndex, blindLevel.smallBlind);
    this.postBlind(players, bigBlindSeatIndex, blindLevel.bigBlind);

    return {
      handNumber,
      buttonSeatIndex,
      street: "preflop",
      board: [],
      deck,
      players,
      orderByStreet: {
        preflop: preflopOrder,
        flop: flopOrder,
        turn: flopOrder,
        river: flopOrder,
      },
      actorPointer: 0,
      currentBet: blindLevel.bigBlind,
      lastRaiseSize: blindLevel.bigBlind,
      actions: [],
      streetActionCount: 0,
    };
  }

  private postBlind(players: Map<number, PlayerState>, seatIndex: number, amount: number) {
    const player = players.get(seatIndex);
    if (!player) {
      return;
    }

    const posted = Math.min(player.stack, amount);
    player.stack -= posted;
    player.totalContribution += posted;
    player.streetContribution += posted;
    player.allIn = player.stack <= 0;
  }

  private getLivePlayers(state: RuntimeHandState): PlayerState[] {
    return [...state.players.values()].filter((player) => !player.folded);
  }

  private getEligiblePlayers(state: RuntimeHandState): PlayerState[] {
    return this.getLivePlayers(state).filter((player) => !player.allIn);
  }

  private computeLegal(state: RuntimeHandState, actor: PlayerState): LegalActionSet {
    const callAmount = Math.max(0, state.currentBet - actor.streetContribution);
    const maxRaiseTo = actor.streetContribution + actor.stack;
    const minRaiseTo = Math.min(maxRaiseTo, state.currentBet + Math.max(state.lastRaiseSize, 1));
    const blind = this.getBlindLevel(state.handNumber).bigBlind;

    return {
      canFold: callAmount > 0,
      canCheck: callAmount === 0,
      callAmount,
      minBet: Math.max(blind, state.lastRaiseSize),
      minRaiseTo,
      maxRaiseTo,
      canAllIn: actor.stack > 0,
    };
  }

  private normalizeActorPointer(state: RuntimeHandState): void {
    const order = state.orderByStreet[state.street];

    for (let i = 0; i < order.length; i += 1) {
      const idx = (state.actorPointer + i) % order.length;
      const player = state.players.get(order[idx]);

      if (!player || player.folded || player.allIn) {
        continue;
      }

      state.actorPointer = idx;
      return;
    }
  }

  private canCloseStreet(state: RuntimeHandState): boolean {
    const active = this.getEligiblePlayers(state);

    if (active.length <= 1) {
      return true;
    }

    const everyoneActed = active.every((player) => player.actedThisStreet);
    const everyoneMatched = active.every(
      (player) => player.streetContribution === state.currentBet || player.allIn,
    );

    return everyoneActed && everyoneMatched;
  }

  private advanceStreet(state: RuntimeHandState): StepContext {
    const currentStreetIndex = STREETS.indexOf(state.street);

    if (currentStreetIndex === STREETS.length - 1) {
      return { actionCountInStreet: 0, handComplete: true, newStreetStarted: false };
    }

    const nextStreet = STREETS[currentStreetIndex + 1];
    state.street = nextStreet;
    state.actorPointer = 0;
    state.currentBet = 0;
    state.lastRaiseSize = this.getBlindLevel(state.handNumber).bigBlind;
    state.streetActionCount = 0;

    for (const player of state.players.values()) {
      player.streetContribution = 0;
      player.actedThisStreet = player.folded || player.allIn;
    }

    if (nextStreet === "flop") {
      const flop = [state.deck.shift(), state.deck.shift(), state.deck.shift()];
      if (flop.some((card) => !card)) {
        throw new Error("Deck exhausted while dealing flop.");
      }
      state.board.push(...(flop as Card[]));
    }

    if (nextStreet === "turn" || nextStreet === "river") {
      const card = state.deck.shift();
      if (!card) {
        throw new Error("Deck exhausted while dealing street card.");
      }
      state.board.push(card);
    }

    return { actionCountInStreet: 0, handComplete: false, newStreetStarted: true };
  }

  private settleHand(state: RuntimeHandState): ResolvedHand {
    const players = [...state.players.values()];
    const contenders = players.filter((player) => !player.folded);
    const totalPot = players.reduce((sum, player) => sum + player.totalContribution, 0);

    if (contenders.length === 1) {
      const winnerSeatIndex = contenders[0].seatIndex;

      return {
        handNumber: state.handNumber,
        board: [...state.board],
        winners: [{ seatIndex: winnerSeatIndex, amountWon: totalPot }],
        updatedStacks: players.map((player) => {
          const won = player.seatIndex === winnerSeatIndex ? totalPot : 0;
          const finalStack = player.stack + won;

          return {
            seatIndex: player.seatIndex,
            stack: finalStack,
            isEliminated: finalStack <= 0,
          };
        }),
      };
    }

    if (contenders.length === 0) {
      return {
        handNumber: state.handNumber,
        board: [...state.board],
        winners: [],
        updatedStacks: players.map((player) => ({
          seatIndex: player.seatIndex,
          stack: player.stack,
          isEliminated: player.stack <= 0,
        })),
      };
    }

    const contributionLevels = [...new Set(players.map((player) => player.totalContribution).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    );

    const winnings = new Map<number, number>();

    const boardCards = state.board;

    let previous = 0;
    for (const level of contributionLevels) {
      const participants = players.filter((player) => player.totalContribution >= level);
      const eligible = contenders.filter((player) => player.totalContribution >= level);
      const potAmount = participants.length * (level - previous);
      previous = level;

      if (potAmount <= 0 || eligible.length === 0) {
        continue;
      }

      const solved = eligible.map((player) => ({
        player,
        hand: Hand.solve([...player.holeCards, ...boardCards]),
      }));

      const winnersHands = Hand.winners(solved.map((entry) => entry.hand));
      const winnerSeats = solved
        .filter((entry) => winnersHands.includes(entry.hand))
        .map((entry) => entry.player.seatIndex);

      const base = Math.floor(potAmount / winnerSeats.length);
      let remainder = potAmount % winnerSeats.length;

      const orderedWinners = this.orderSeatIndexesClockwiseFrom(
        state.buttonSeatIndex,
        winnerSeats,
      );
      for (const seatIndex of orderedWinners) {
        const extra = remainder > 0 ? 1 : 0;
        remainder = Math.max(0, remainder - 1);
        winnings.set(seatIndex, (winnings.get(seatIndex) ?? 0) + base + extra);
      }
    }

    const updatedStacks: Array<{ seatIndex: number; stack: number; isEliminated: boolean }> = [];

    for (const player of players) {
      const won = winnings.get(player.seatIndex) ?? 0;
      const finalStack = player.stack + won;
      updatedStacks.push({
        seatIndex: player.seatIndex,
        stack: finalStack,
        isEliminated: finalStack <= 0,
      });
    }

    return {
      handNumber: state.handNumber,
      board: [...state.board],
      winners: [...winnings.entries()].map(([seatIndex, amountWon]) => ({
        seatIndex,
        amountWon,
      })),
      updatedStacks,
    };
  }

  private moveActor(state: RuntimeHandState): void {
    const order = state.orderByStreet[state.street];
    state.actorPointer = (state.actorPointer + 1) % order.length;
  }

  private runOutBoard(state: RuntimeHandState): void {
    while (state.board.length < 5) {
      const card = state.deck.shift();
      if (!card) {
        throw new Error("Deck exhausted while running out board.");
      }
      state.board.push(card);
    }

    state.street = "river";
  }

  nextDecision(activeSeats: SeatSnapshot[], handNumber: number): EngineStep {
    const alive = activeSeats.filter((seat) => !seat.isEliminated && seat.stack > 0);

    if (alive.length <= 1) {
      const winner = alive[0];
      return {
        type: "hand_complete",
        hand: {
          handNumber,
          board: [],
          winners: winner ? [{ seatIndex: winner.seatIndex, amountWon: 0 }] : [],
          updatedStacks: activeSeats.map((seat) => ({
            seatIndex: seat.seatIndex,
            stack: seat.stack,
            isEliminated: seat.isEliminated,
          })),
        },
      };
    }

    if (!this.handState || this.handState.handNumber !== handNumber) {
      this.handState = this.initializeHand(alive, handNumber);
    }

    const state = this.handState;

    if (this.getEligiblePlayers(state).length === 0) {
      this.runOutBoard(state);
      const resolved = this.settleHand(state);
      this.handState = null;

      return {
        type: "hand_complete",
        hand: resolved,
      };
    }

    this.normalizeActorPointer(state);

    const order = state.orderByStreet[state.street];
    const actorSeatIndex = order[state.actorPointer];
    const actor = state.players.get(actorSeatIndex);

    if (!actor) {
      throw new Error("Could not resolve acting player.");
    }

    const legal = this.computeLegal(state, actor);

    return {
      type: "decision",
      hand: {
        handNumber: state.handNumber,
        street: state.street,
        actorSeatIndex,
        legal,
        board: [...state.board],
        seats: [...state.players.values()].map((player) => ({
          seatIndex: player.seatIndex,
          stack: player.stack,
          folded: player.folded,
          allIn: player.allIn,
          contribution: player.totalContribution,
        })),
        actionsThisHand: [...state.actions],
      },
    };
  }

  applyDecision(decision: AppliedDecision): StepContext {
    if (!this.handState) {
      throw new Error("Hand state is not initialized.");
    }

    const state = this.handState;
    const order = state.orderByStreet[state.street];
    const actorSeatIndex = order[state.actorPointer];
    const actor = state.players.get(actorSeatIndex);

    if (!actor) {
      throw new Error("Could not resolve actor while applying decision.");
    }

    const legal = this.computeLegal(state, actor);

    const toCall = legal.callAmount;

    if (decision.action === "fold") {
      actor.folded = true;
      actor.actedThisStreet = true;
      state.actions.push({
        seatIndex: actorSeatIndex,
        action: "fold",
        amount: 0,
        handNumber: state.handNumber,
        street: state.street,
      });
    } else if (decision.action === "check") {
      actor.actedThisStreet = true;
      state.actions.push({
        seatIndex: actorSeatIndex,
        action: "check",
        amount: 0,
        handNumber: state.handNumber,
        street: state.street,
      });
    } else if (decision.action === "call") {
      const amount = Math.min(actor.stack, toCall);
      actor.stack -= amount;
      actor.totalContribution += amount;
      actor.streetContribution += amount;
      actor.allIn = actor.stack <= 0;
      actor.actedThisStreet = true;
      state.actions.push({
        seatIndex: actorSeatIndex,
        action: "call",
        amount,
        handNumber: state.handNumber,
        street: state.street,
      });
    } else if (decision.action === "bet" || decision.action === "raise") {
      const target = Math.min(decision.amount, actor.streetContribution + actor.stack);
      const delta = Math.max(0, target - actor.streetContribution);

      actor.stack -= delta;
      actor.totalContribution += delta;
      actor.streetContribution = target;
      actor.allIn = actor.stack <= 0;
      actor.actedThisStreet = true;

      const previousBet = state.currentBet;
      state.currentBet = Math.max(state.currentBet, actor.streetContribution);
      state.lastRaiseSize = Math.max(1, state.currentBet - previousBet);

      for (const player of state.players.values()) {
        if (player.seatIndex === actorSeatIndex || player.folded || player.allIn) {
          continue;
        }
        player.actedThisStreet = false;
      }

      state.actions.push({
        seatIndex: actorSeatIndex,
        action: decision.action,
        amount: target,
        handNumber: state.handNumber,
        street: state.street,
      });
    } else {
      const amount = actor.stack;
      actor.stack = 0;
      actor.totalContribution += amount;
      actor.streetContribution += amount;
      actor.allIn = true;
      actor.actedThisStreet = true;
      state.currentBet = Math.max(state.currentBet, actor.streetContribution);
      state.actions.push({
        seatIndex: actorSeatIndex,
        action: "all_in",
        amount,
        handNumber: state.handNumber,
        street: state.street,
      });
    }

    state.streetActionCount += 1;

    const livePlayers = this.getLivePlayers(state);
    if (livePlayers.length <= 1) {
      return { actionCountInStreet: state.streetActionCount, handComplete: true, newStreetStarted: false };
    }

    if (this.canCloseStreet(state)) {
      return this.advanceStreet(state);
    }

    this.moveActor(state);
    return { actionCountInStreet: state.streetActionCount, handComplete: false, newStreetStarted: false };
  }

  finalizeCurrentHand(): ResolvedHand {
    if (!this.handState) {
      throw new Error("No hand state to finalize.");
    }

    const result = this.settleHand(this.handState);
    this.handState = null;
    return result;
  }

  getSnapshot(): HandRuntimeSnapshot | null {
    if (!this.handState) {
      return null;
    }

    return {
      handNumber: this.handState.handNumber,
      street: this.handState.street,
      board: [...this.handState.board],
      seats: [...this.handState.players.values()].map((player) => ({
        seatIndex: player.seatIndex,
        stack: player.stack,
        folded: player.folded,
        allIn: player.allIn,
        contribution: player.totalContribution,
      })),
      actionsThisHand: [...this.handState.actions],
    };
  }

  discardCurrentHand(): void {
    this.handState = null;
  }
}
