import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUnlockMetadata, isUnlocked } from "@/lib/security/unlock-session";

export async function GET() {
  const secret = await prisma.appSecret.findUnique({
    where: { id: "singleton" },
  });

  const metadata = getUnlockMetadata();

  return NextResponse.json({
    initialized: Boolean(secret),
    unlocked: isUnlocked(),
    unlockedAt: metadata?.unlockedAt.toISOString() ?? null,
  });
}
