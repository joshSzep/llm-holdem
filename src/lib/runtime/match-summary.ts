import type { Match, MatchSeat } from "@prisma/client";

type SeatWithAgent = MatchSeat & {
  agent: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
  };
};

type MatchWithSeats = Match & {
  seats: SeatWithAgent[];
};

export function serializeMatchSummary(match: MatchWithSeats) {
  return {
    id: match.id,
    status: match.status,
    mode: match.mode,
    seed: match.seed,
    maxSeats: match.maxSeats,
    startingStack: match.startingStack,
    currentHandNumber: match.currentHandNumber,
    currentLevelIndex: match.currentLevelIndex,
    playbackSpeedMs: match.playbackSpeedMs,
    createdAt: match.createdAt,
    startedAt: match.startedAt,
    completedAt: match.completedAt,
    seats: match.seats.map((seat) => ({
      seatIndex: seat.seatIndex,
      stack: seat.stack,
      isEliminated: seat.isEliminated,
      finishPlace: seat.finishPlace,
      agent: seat.agent,
    })),
  };
}
