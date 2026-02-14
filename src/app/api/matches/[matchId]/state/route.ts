import { NextResponse } from "next/server";

import { requireUnlockedResponse } from "@/lib/security/require-unlock";
import { getMatchRuntimeState } from "@/lib/runtime/match-runner";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { matchId } = await context.params;
  const state = await getMatchRuntimeState(matchId);

  if (!state) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  return NextResponse.json(state);
}
