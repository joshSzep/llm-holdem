import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { agentId } = await context.params;

  const [agent, rating, standings] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        provider: true,
        modelId: true,
        createdAt: true,
      },
    }),
    prisma.agentRating.findUnique({
      where: { agentId },
      select: {
        rating: true,
        updatedAt: true,
      },
    }),
    prisma.matchStanding.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      select: {
        matchId: true,
        place: true,
        ratingBefore: true,
        ratingAfter: true,
        delta: true,
        createdAt: true,
      },
      take: 50,
    }),
  ]);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  return NextResponse.json({
    agent,
    rating: rating?.rating ?? 1200,
    ratingUpdatedAt: rating?.updatedAt ?? null,
    standings,
  });
}
