import { NextResponse } from "next/server";

import { clearUnlockSession } from "@/lib/security/unlock-session";

export async function POST() {
  clearUnlockSession();
  return NextResponse.json({ unlocked: false });
}
