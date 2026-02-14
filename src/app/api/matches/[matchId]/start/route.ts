import { NextResponse } from "next/server";

import { requireUnlockedResponse } from "@/lib/security/require-unlock";
import { getMatchRuntimeState, startMatchRunner } from "@/lib/runtime/match-runner";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { matchId } = await context.params;

  const result = await startMatchRunner(matchId);
  if (!result.started) {
    return NextResponse.json(
      { error: result.reason ?? "Unable to start match." },
      { status: 400 },
    );
  }

  const state = await getMatchRuntimeState(matchId);

  return NextResponse.json({
    started: true,
    state,
  });
}
