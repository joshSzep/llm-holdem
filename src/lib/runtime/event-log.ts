import { prisma } from "@/lib/prisma";
import { publishMatchEvent, type MatchEventType } from "@/lib/runtime/match-events";

export async function recordAndPublishMatchEvent({
  matchId,
  type,
  payload,
}: {
  matchId: string;
  type: MatchEventType;
  payload: Record<string, unknown>;
}) {
  const latest = await prisma.matchEvent.findFirst({
    where: { matchId },
    orderBy: { eventIndex: "desc" },
    select: { eventIndex: true },
  });

  const eventIndex = (latest?.eventIndex ?? -1) + 1;

  await prisma.matchEvent.create({
    data: {
      matchId,
      eventIndex,
      eventType: type,
      payloadJson: JSON.stringify(payload),
    },
  });

  publishMatchEvent({
    type,
    matchId,
    payload: {
      eventIndex,
      ...payload,
    },
  });
}
