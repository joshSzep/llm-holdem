import { MatchMode, MatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { applyMatchRatings } from "@/lib/rating/elo";
import { resolveAgentDecision } from "@/lib/runtime/agent-decision";
import { recordAndPublishMatchEvent } from "@/lib/runtime/event-log";
import { HandEngine } from "@/lib/runtime/hand-engine";
import { serializeMatchSummary } from "@/lib/runtime/match-summary";

const activeIntervals = new Map<string, NodeJS.Timeout>();
const inFlightTicks = new Set<string>();
const engines = new Map<string, HandEngine>();

const HANDS_PER_LEVEL = 10;
const MAX_SIM_HANDS = 120;
const BLIND_LEVELS: Array<{ smallBlind: number; bigBlind: number }> = [
  { smallBlind: 10, bigBlind: 20 },
  { smallBlind: 15, bigBlind: 30 },
  { smallBlind: 20, bigBlind: 40 },
  { smallBlind: 30, bigBlind: 60 },
  { smallBlind: 40, bigBlind: 80 },
  { smallBlind: 50, bigBlind: 100 },
  { smallBlind: 75, bigBlind: 150 },
  { smallBlind: 100, bigBlind: 200 },
  { smallBlind: 150, bigBlind: 300 },
  { smallBlind: 200, bigBlind: 400 },
  { smallBlind: 300, bigBlind: 600 },
  { smallBlind: 400, bigBlind: 800 },
  { smallBlind: 500, bigBlind: 1000 },
  { smallBlind: 700, bigBlind: 1400 },
  { smallBlind: 1000, bigBlind: 2000 },
];

function resolveTickInterval(playbackSpeedMs: number): number {
  return Math.max(100, Math.min(playbackSpeedMs, 5000));
}

export function isMatchRunnerActive(matchId: string): boolean {
  return activeIntervals.has(matchId);
}

function clearRunner(matchId: string): void {
  const interval = activeIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    activeIntervals.delete(matchId);
  }
  inFlightTicks.delete(matchId);
  engines.delete(matchId);
}

function getOrCreateEngine(matchId: string, seed: string, startingStack: number): HandEngine {
  let engine = engines.get(matchId);

  if (!engine) {
    engine = new HandEngine({
      matchSeed: seed,
      startingStack,
      blindLevels: BLIND_LEVELS,
      handsPerLevel: HANDS_PER_LEVEL,
    });

    engines.set(matchId, engine);
  }

  return engine;
}

function buildTableStatePayload(
  snapshot: ReturnType<HandEngine["getSnapshot"]>,
  actorSeatIndex?: number,
  action?: { action: string; amount: number },
) {
  if (!snapshot) {
    return null;
  }

  const pot = snapshot.seats.reduce((sum, seat) => sum + seat.contribution, 0);

  return {
    handNumber: snapshot.handNumber,
    street: snapshot.street,
    board: snapshot.board,
    pot,
    actorSeatIndex,
    action,
    seats: snapshot.seats,
    actionsThisHand: snapshot.actionsThisHand,
  };
}

async function syncStacksFromSnapshot(
  matchId: string,
  snapshot: ReturnType<HandEngine["getSnapshot"]>,
) {
  if (!snapshot) {
    return;
  }

  await prisma.$transaction(
    snapshot.seats.map((seat) =>
      prisma.matchSeat.updateMany({
        where: {
          matchId,
          seatIndex: seat.seatIndex,
        },
        data: {
          stack: seat.stack,
          isEliminated: seat.stack <= 0,
        },
      }),
    ),
  );
}

async function finalizeMatch(matchId: string) {
  const seats = await prisma.matchSeat.findMany({
    where: { matchId },
    orderBy: [{ stack: "desc" }, { seatIndex: "asc" }],
  });

  const updates = seats.map((seat, index) =>
    prisma.matchSeat.update({
      where: { id: seat.id },
      data: { finishPlace: index + 1 },
    }),
  );

  await prisma.$transaction([
    ...updates,
    prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.completed,
        completedAt: new Date(),
      },
    }),
  ]);

  await applyMatchRatings(matchId);

  const completed = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      seats: {
        orderBy: { seatIndex: "asc" },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              provider: true,
              modelId: true,
            },
          },
        },
      },
    },
  });

  if (completed) {
    await recordAndPublishMatchEvent({
      type: "match.completed",
      matchId,
      payload: {
        summary: serializeMatchSummary(completed),
      },
    });
  }

  clearRunner(matchId);
}

async function tickMatch(matchId: string): Promise<void> {
  if (inFlightTicks.has(matchId)) {
    return;
  }

  inFlightTicks.add(matchId);

  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        seats: {
          orderBy: { seatIndex: "asc" },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                provider: true,
                modelId: true,
                systemPrompt: true,
                encryptedKey: true,
                keySalt: true,
                keyIv: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      clearRunner(matchId);
      return;
    }

    if (match.status !== MatchStatus.running) {
      clearRunner(matchId);
      return;
    }

    const activeSeats = match.seats.map((seat) => ({
      seatIndex: seat.seatIndex,
      stack: seat.stack,
      isEliminated: seat.isEliminated,
    }));

    const handNumber = Math.max(1, match.currentHandNumber || 1);
    if (match.currentHandNumber !== handNumber) {
      await prisma.match.update({
        where: { id: match.id },
        data: { currentHandNumber: handNumber },
      });
    }

    const engine = getOrCreateEngine(matchId, match.seed, match.startingStack);
    const step = engine.nextDecision(activeSeats, handNumber);

    if (step.type === "hand_complete") {
      await prisma.$transaction(
        step.hand.updatedStacks.map((seat) =>
          prisma.matchSeat.updateMany({
            where: { matchId, seatIndex: seat.seatIndex },
            data: {
              stack: seat.stack,
              isEliminated: seat.isEliminated,
            },
          }),
        ),
      );

      await finalizeMatch(matchId);
      return;
    }

    await syncStacksFromSnapshot(matchId, engine.getSnapshot());

    const actorSeat = match.seats.find((seat) => seat.seatIndex === step.hand.actorSeatIndex);
    if (!actorSeat) {
      throw new Error("Actor seat not found in match snapshot.");
    }

    const actorRuntimeSeat = step.hand.seats.find(
      (seat) => seat.seatIndex === step.hand.actorSeatIndex,
    );
    if (!actorRuntimeSeat) {
      throw new Error("Actor seat not found in engine snapshot.");
    }

    const level = BLIND_LEVELS[Math.min(match.currentLevelIndex, BLIND_LEVELS.length - 1)];

    const decision = await resolveAgentDecision({
      agent: actorSeat.agent,
      seat: {
        stack: actorRuntimeSeat.stack,
      },
      context: {
        matchId,
        handNumber: step.hand.handNumber,
        levelIndex: match.currentLevelIndex,
        smallBlind: level.smallBlind,
        bigBlind: level.bigBlind,
        actorSeatIndex: step.hand.actorSeatIndex,
        seats: step.hand.seats.map((seat) => ({
          seatIndex: seat.seatIndex,
          stack: seat.stack,
          isEliminated: seat.folded,
          contribution: seat.contribution,
        })),
        actionsThisHand: step.hand.actionsThisHand.map((action) => ({
          seatIndex: action.seatIndex,
          action: action.action,
          amount: action.amount,
        })),
        legal: step.hand.legal,
      },
    });

    const applyResult = engine.applyDecision(decision.decision);

    await prisma.matchAction.create({
      data: {
        matchId,
        handNumber: step.hand.handNumber,
        street: step.hand.street,
        actorSeatIndex: step.hand.actorSeatIndex,
        legalActionsJson: JSON.stringify(step.hand.legal),
        requestedActionJson: decision.requestedActionJson,
        resolvedActionJson: decision.resolvedActionJson,
        rawResponse: decision.rawResponse,
        validationError: decision.validationError,
        retried: decision.retried,
        latencyMs: decision.latencyMs,
        tokenUsageJson: decision.tokenUsageJson,
        agentId: actorSeat.agentId,
      },
    });

    await syncStacksFromSnapshot(matchId, engine.getSnapshot());

    const refreshed = await prisma.match.findUnique({
      where: { id: match.id },
      include: {
        seats: {
          orderBy: { seatIndex: "asc" },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                provider: true,
                modelId: true,
              },
            },
          },
        },
      },
    });

    if (!refreshed) {
      clearRunner(matchId);
      return;
    }

    await recordAndPublishMatchEvent({
      type: "match.state",
      matchId,
      payload: {
        handNumber: step.hand.handNumber,
        levelIndex: refreshed.currentLevelIndex,
        status: refreshed.status,
        actorSeatIndex: step.hand.actorSeatIndex,
        action: decision.decision,
        board: engine.getSnapshot()?.board ?? step.hand.board,
        street: engine.getSnapshot()?.street ?? step.hand.street,
        tableState: buildTableStatePayload(
          engine.getSnapshot(),
          step.hand.actorSeatIndex,
          decision.decision,
        ),
        summary: serializeMatchSummary(refreshed),
      },
    });

    if (applyResult.handComplete) {
      const resolvedHand = engine.finalizeCurrentHand();

      await prisma.$transaction(
        resolvedHand.updatedStacks.map((seat) =>
          prisma.matchSeat.updateMany({
            where: { matchId, seatIndex: seat.seatIndex },
            data: {
              stack: seat.stack,
              isEliminated: seat.isEliminated,
            },
          }),
        ),
      );

      const nextHand = step.hand.handNumber + 1;
      const nextLevelIndex = Math.floor((nextHand - 1) / HANDS_PER_LEVEL);

      await prisma.match.update({
        where: { id: match.id },
        data: {
          currentHandNumber: nextHand,
          currentLevelIndex: nextLevelIndex,
        },
      });

      await recordAndPublishMatchEvent({
        type: "match.state",
        matchId,
        payload: {
          handNumber: resolvedHand.handNumber,
          street: "showdown",
          board: resolvedHand.board,
          winners: resolvedHand.winners,
          tableState: {
            handNumber: resolvedHand.handNumber,
            street: "showdown",
            board: resolvedHand.board,
            pot: resolvedHand.winners.reduce((sum, winner) => sum + winner.amountWon, 0),
            winners: resolvedHand.winners,
          },
        },
      });

      if (nextHand > MAX_SIM_HANDS) {
        await finalizeMatch(matchId);
        return;
      }

      const remainingSeats = await prisma.matchSeat.findMany({
        where: {
          matchId,
          isEliminated: false,
        },
      });

      if (remainingSeats.length <= 1) {
        await finalizeMatch(matchId);
      }
    }
  } finally {
    inFlightTicks.delete(matchId);
  }
}

export async function startMatchRunner(matchId: string): Promise<{
  started: boolean;
  reason?: string;
}> {
  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      seats: {
        orderBy: { seatIndex: "asc" },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              provider: true,
              modelId: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    return { started: false, reason: "Match not found." };
  }

  if (existing.status === MatchStatus.completed || existing.status === MatchStatus.failed) {
    return { started: false, reason: `Match is already ${existing.status}.` };
  }

  const startedAt = existing.startedAt ?? new Date();

  const running = await prisma.match.update({
    where: { id: existing.id },
    data: {
      status: MatchStatus.running,
      startedAt,
    },
    include: {
      seats: {
        orderBy: { seatIndex: "asc" },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              provider: true,
              modelId: true,
                systemPrompt: true,
                encryptedKey: true,
                keySalt: true,
                keyIv: true,
            },
          },
        },
      },
    },
  });

  await recordAndPublishMatchEvent({
    type: "match.started",
    matchId,
    payload: {
      summary: serializeMatchSummary(running),
      resumed: existing.status === MatchStatus.paused,
    },
  });

  if (running.mode === MatchMode.step) {
    await tickMatch(matchId);
    return { started: true };
  }

  if (!activeIntervals.has(matchId)) {
    const interval = setInterval(() => {
      void tickMatch(matchId);
    }, resolveTickInterval(running.playbackSpeedMs));

    activeIntervals.set(matchId, interval);
  }

  return { started: true };
}

export async function pauseMatchRunner(matchId: string): Promise<{
  paused: boolean;
  reason?: string;
}> {
  const existing = await prisma.match.findUnique({ where: { id: matchId } });

  if (!existing) {
    return { paused: false, reason: "Match not found." };
  }

  if (existing.status === MatchStatus.completed || existing.status === MatchStatus.failed) {
    return { paused: false, reason: `Match is already ${existing.status}.` };
  }

  const interval = activeIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    activeIntervals.delete(matchId);
  }

  if (existing.status !== MatchStatus.paused) {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.paused },
    });
  }

  return { paused: true };
}

export async function stepMatchRunner(matchId: string): Promise<{
  stepped: boolean;
  reason?: string;
}> {
  const existing = await prisma.match.findUnique({ where: { id: matchId } });

  if (!existing) {
    return { stepped: false, reason: "Match not found." };
  }

  if (existing.status === MatchStatus.completed || existing.status === MatchStatus.failed) {
    return { stepped: false, reason: `Match is already ${existing.status}.` };
  }

  const interval = activeIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    activeIntervals.delete(matchId);
  }

  if (existing.status !== MatchStatus.running) {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.running,
        startedAt: existing.startedAt ?? new Date(),
      },
    });
  }

  await tickMatch(matchId);

  const after = await prisma.match.findUnique({ where: { id: matchId } });
  if (!after) {
    return { stepped: false, reason: "Match disappeared." };
  }

  if (after.status === MatchStatus.running) {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.paused },
    });
  }

  return { stepped: true };
}

export async function getMatchTimeline(matchId: string) {
  const events = await prisma.matchEvent.findMany({
    where: { matchId },
    orderBy: { eventIndex: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    eventIndex: event.eventIndex,
    eventType: event.eventType,
    payload: JSON.parse(event.payloadJson) as Record<string, unknown>,
    createdAt: event.createdAt,
  }));
}

export async function getMatchRuntimeState(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      seats: {
        orderBy: { seatIndex: "asc" },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              provider: true,
              modelId: true,
                systemPrompt: true,
                encryptedKey: true,
                keySalt: true,
                keyIv: true,
            },
          },
        },
      },
    },
  });

  if (!match) {
    return null;
  }

  return {
    summary: serializeMatchSummary(match),
    runnerActive: isMatchRunnerActive(matchId),
  };
}
