import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  deriveSessionKey,
  validatePassphrase,
  verifyPassphrase,
} from "@/lib/security/passphrase";
import { isUnlocked, setUnlockSession } from "@/lib/security/unlock-session";

type UnlockRequestBody = {
  passphrase?: string;
};

export async function POST(request: Request) {
  if (isUnlocked()) {
    return NextResponse.json({ initialized: true, unlocked: true });
  }

  const secret = await prisma.appSecret.findUnique({
    where: { id: "singleton" },
  });

  if (!secret) {
    return NextResponse.json(
      { error: "Passphrase has not been configured yet." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as UnlockRequestBody;
  const passphrase = body.passphrase ?? "";

  if (!passphrase) {
    return NextResponse.json({ error: "Passphrase is required." }, { status: 400 });
  }

  const validationError = validatePassphrase(passphrase);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const isValid = await verifyPassphrase(passphrase, {
    verifierHash: secret.verifierHash,
    verifierSalt: secret.verifierSalt,
    kdfConfigJson: secret.kdfConfigJson,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid passphrase." }, { status: 401 });
  }

  const sessionKey = await deriveSessionKey(passphrase, {
    verifierHash: secret.verifierHash,
    verifierSalt: secret.verifierSalt,
    kdfConfigJson: secret.kdfConfigJson,
  });

  setUnlockSession(sessionKey);

  return NextResponse.json({ initialized: true, unlocked: true });
}
