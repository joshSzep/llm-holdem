import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

const DEFAULT_RATING = 1200;

export async function GET() {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const [agents, ratings, standings] = await Promise.all([
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        provider: true,
        modelId: true,
      },
    }),
    prisma.agentRating.findMany({
      select: {
        agentId: true,
        rating: true,
      },
    }),
    prisma.matchStanding.findMany({
      select: {
        agentId: true,
        place: true,
      },
    }),
  ]);

  const ratingMap = new Map(ratings.map((row) => [row.agentId, row.rating]));
  const standingsByAgent = new Map<string, Array<{ place: number }>>();

  for (const standing of standings) {
    const list = standingsByAgent.get(standing.agentId) ?? [];
    list.push({ place: standing.place });
    standingsByAgent.set(standing.agentId, list);
  }

  const rows = agents
    .map((agent) => {
      const history = standingsByAgent.get(agent.id) ?? [];
      const matchesPlayed = history.length;
      const wins = history.filter((entry) => entry.place === 1).length;
      const top3 = history.filter((entry) => entry.place <= 3).length;
      const avgPlace =
        matchesPlayed > 0
          ? history.reduce((sum, entry) => sum + entry.place, 0) / matchesPlayed
          : null;

      return {
        agentId: agent.id,
        name: agent.name,
        provider: agent.provider,
        modelId: agent.modelId,
        rating: ratingMap.get(agent.id) ?? DEFAULT_RATING,
        matchesPlayed,
        wins,
        top3,
        avgPlace,
      };
    })
    .sort((a, b) => b.rating - a.rating);

  return NextResponse.json({ rows });
}
