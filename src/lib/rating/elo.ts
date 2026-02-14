import { prisma } from "@/lib/prisma";

const DEFAULT_RATING = 1200;
const K_FACTOR = 24;

type Placement = {
  agentId: string;
  place: number;
};

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function actualScore(placeA: number, placeB: number): number {
  if (placeA < placeB) {
    return 1;
  }

  if (placeA > placeB) {
    return 0;
  }

  return 0.5;
}

function computeDeltas(
  placements: Placement[],
  ratingByAgentId: Map<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();

  for (const placement of placements) {
    deltas.set(placement.agentId, 0);
  }

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];

      const ratingA = ratingByAgentId.get(a.agentId) ?? DEFAULT_RATING;
      const ratingB = ratingByAgentId.get(b.agentId) ?? DEFAULT_RATING;

      const expectedA = expectedScore(ratingA, ratingB);
      const expectedB = expectedScore(ratingB, ratingA);

      const actualA = actualScore(a.place, b.place);
      const actualB = 1 - actualA;

      deltas.set(a.agentId, (deltas.get(a.agentId) ?? 0) + K_FACTOR * (actualA - expectedA));
      deltas.set(b.agentId, (deltas.get(b.agentId) ?? 0) + K_FACTOR * (actualB - expectedB));
    }
  }

  const divisor = Math.max(1, placements.length - 1);
  for (const [agentId, delta] of deltas) {
    deltas.set(agentId, delta / divisor);
  }

  return deltas;
}

export async function applyMatchRatings(matchId: string): Promise<void> {
  const existingStandings = await prisma.matchStanding.count({
    where: { matchId },
  });

  if (existingStandings > 0) {
    return;
  }

  const seats = await prisma.matchSeat.findMany({
    where: {
      matchId,
      finishPlace: { not: null },
    },
    orderBy: { finishPlace: "asc" },
    select: {
      agentId: true,
      finishPlace: true,
    },
  });

  if (seats.length === 0) {
    return;
  }

  const placements: Placement[] = seats
    .filter((seat): seat is { agentId: string; finishPlace: number } => seat.finishPlace !== null)
    .map((seat) => ({
      agentId: seat.agentId,
      place: seat.finishPlace,
    }));

  const uniqueAgentIds = [...new Set(placements.map((placement) => placement.agentId))];

  await prisma.$transaction(
    uniqueAgentIds.map((agentId) =>
      prisma.agentRating.upsert({
        where: { agentId },
        update: {},
        create: {
          agentId,
          rating: DEFAULT_RATING,
        },
      }),
    ),
  );

  const ratings = await prisma.agentRating.findMany({
    where: {
      agentId: { in: uniqueAgentIds },
    },
    select: {
      agentId: true,
      rating: true,
    },
  });

  const ratingByAgentId = new Map<string, number>(
    ratings.map((rating) => [rating.agentId, rating.rating]),
  );

  const deltas = computeDeltas(placements, ratingByAgentId);

  await prisma.$transaction([
    ...placements.map((placement) => {
      const before = ratingByAgentId.get(placement.agentId) ?? DEFAULT_RATING;
      const delta = deltas.get(placement.agentId) ?? 0;
      const after = before + delta;

      return prisma.agentRating.update({
        where: { agentId: placement.agentId },
        data: { rating: after },
      });
    }),
    ...placements.map((placement) => {
      const before = ratingByAgentId.get(placement.agentId) ?? DEFAULT_RATING;
      const delta = deltas.get(placement.agentId) ?? 0;
      const after = before + delta;

      return prisma.matchStanding.create({
        data: {
          matchId,
          agentId: placement.agentId,
          place: placement.place,
          ratingBefore: before,
          ratingAfter: after,
          delta,
        },
      });
    }),
  ]);
}
