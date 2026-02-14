import { NextResponse } from "next/server";

import { getMatchTimeline } from "@/lib/runtime/match-runner";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { matchId } = await context.params;
  const timeline = await getMatchTimeline(matchId);

  return NextResponse.json({
    matchId,
    timeline,
  });
}
