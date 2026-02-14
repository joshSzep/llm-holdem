import { NextResponse } from "next/server";

import { isUnlocked } from "@/lib/security/unlock-session";

export function requireUnlockedResponse(): NextResponse | null {
  if (!isUnlocked()) {
    return NextResponse.json(
      { error: "Application is locked. Unlock the app first." },
      { status: 423 },
    );
  }

  return null;
}
