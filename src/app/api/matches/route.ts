import { randomBytes } from "crypto";

import { MatchMode } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { publishMatchEvent } from "@/lib/runtime/match-events";
import { serializeMatchSummary } from "@/lib/runtime/match-summary";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

const createMatchSchema = z.object({
  mode: z.nativeEnum(MatchMode).default(MatchMode.auto),
  selectedAgentIds: z.array(z.string().min(1)).length(6),
  seed: z.string().trim().min(1).max(128).optional(),
  playbackSpeedMs: z.number().int().min(0).max(5000).default(300),
});

const STARTING_STACK = 2000;
const MAX_SEATS = 6;

function buildSeed(inputSeed?: string): string {
  if (inputSeed && inputSeed.trim().length > 0) {
    return inputSeed.trim();
  }

  return randomBytes(16).toString("hex");
}

export async function GET() {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const matches = await prisma.match.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
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

  return NextResponse.json({
    matches: matches.map((match) => serializeMatchSummary(match)),
  });
}

export async function POST(request: Request) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const parsed = createMatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid match payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const uniqueAgentIds = [...new Set(parsed.data.selectedAgentIds)];
  if (uniqueAgentIds.length !== MAX_SEATS) {
    return NextResponse.json(
      { error: "Exactly 6 unique agents are required." },
      { status: 400 },
    );
  }

  const agents = await prisma.agent.findMany({
    where: {
      id: { in: uniqueAgentIds },
    },
    select: { id: true },
  });

  if (agents.length !== MAX_SEATS) {
    return NextResponse.json(
      { error: "One or more selected agents were not found." },
      { status: 400 },
    );
  }

  const seed = buildSeed(parsed.data.seed);

  const match = await prisma.match.create({
    data: {
      mode: parsed.data.mode,
      seed,
      maxSeats: MAX_SEATS,
      startingStack: STARTING_STACK,
      playbackSpeedMs: parsed.data.playbackSpeedMs,
      seats: {
        create: uniqueAgentIds.map((agentId, seatIndex) => ({
          agentId,
          seatIndex,
          stack: STARTING_STACK,
          isEliminated: false,
        })),
      },
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

  const summary = serializeMatchSummary(match);

  publishMatchEvent({
    type: "match.created",
    matchId: match.id,
    payload: {
      summary,
    },
  });

  return NextResponse.json(
    {
      match: summary,
    },
    { status: 201 },
  );
}
