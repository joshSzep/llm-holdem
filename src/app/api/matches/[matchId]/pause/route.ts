import { NextResponse } from "next/server";

import { getMatchRuntimeState, pauseMatchRunner } from "@/lib/runtime/match-runner";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { matchId } = await context.params;
  const result = await pauseMatchRunner(matchId);

  if (!result.paused) {
    return NextResponse.json(
      { error: result.reason ?? "Unable to pause match." },
      { status: 400 },
    );
  }

  const state = await getMatchRuntimeState(matchId);

  return NextResponse.json({ paused: true, state });
}
