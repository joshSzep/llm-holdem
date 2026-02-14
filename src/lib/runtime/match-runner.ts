import { MatchMode, MatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publishMatchEvent } from "@/lib/runtime/match-events";
import { serializeMatchSummary } from "@/lib/runtime/match-summary";

const activeIntervals = new Map<string, NodeJS.Timeout>();
const inFlightTicks = new Set<string>();

const HANDS_PER_LEVEL = 10;
const MAX_SIM_HANDS = 120;

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

    const nextHand = match.currentHandNumber + 1;
    const nextLevelIndex = Math.floor(nextHand / HANDS_PER_LEVEL);

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: {
        currentHandNumber: nextHand,
        currentLevelIndex: nextLevelIndex,
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
              },
            },
          },
        },
      },
    });

    publishMatchEvent({
      type: "match.state",
      matchId,
      payload: {
        handNumber: updated.currentHandNumber,
        levelIndex: updated.currentLevelIndex,
        status: updated.status,
        summary: serializeMatchSummary(updated),
      },
    });

    if (nextHand >= MAX_SIM_HANDS) {
      const completed = await prisma.match.update({
        where: { id: match.id },
        data: {
          status: MatchStatus.completed,
          completedAt: new Date(),
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
                },
              },
            },
          },
        },
      });

      publishMatchEvent({
        type: "match.completed",
        matchId,
        payload: {
          summary: serializeMatchSummary(completed),
        },
      });

      clearRunner(matchId);
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
            },
          },
        },
      },
    },
  });

  publishMatchEvent({
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
