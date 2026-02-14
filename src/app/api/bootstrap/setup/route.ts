import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  deriveSessionKey,
  hashPassphrase,
  validatePassphrase,
} from "@/lib/security/passphrase";
import { setUnlockSession } from "@/lib/security/unlock-session";

type SetupRequestBody = {
  passphrase?: string;
  confirmPassphrase?: string;
};

export async function POST(request: Request) {
  const existingSecret = await prisma.appSecret.findUnique({
    where: { id: "singleton" },
  });

  if (existingSecret) {
    return NextResponse.json(
      { error: "Passphrase is already configured." },
      { status: 409 },
    );
  }

  const body = (await request.json()) as SetupRequestBody;
  const passphrase = body.passphrase ?? "";
  const confirmPassphrase = body.confirmPassphrase ?? "";

  if (!passphrase || !confirmPassphrase) {
    return NextResponse.json(
      { error: "Passphrase and confirmation are required." },
      { status: 400 },
    );
  }

  if (passphrase !== confirmPassphrase) {
    return NextResponse.json(
      { error: "Passphrase and confirmation must match." },
      { status: 400 },
    );
  }

  const validationError = validatePassphrase(passphrase);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const hashed = await hashPassphrase(passphrase);

  const secret = await prisma.appSecret.create({
    data: {
      id: "singleton",
      verifierHash: hashed.verifierHash,
      verifierSalt: hashed.verifierSalt,
      kdfConfigJson: hashed.kdfConfigJson,
    },
  });

  const sessionKey = await deriveSessionKey(passphrase, {
    verifierHash: secret.verifierHash,
    verifierSalt: secret.verifierSalt,
    kdfConfigJson: secret.kdfConfigJson,
  });

  setUnlockSession(sessionKey);

  return NextResponse.json({ initialized: true, unlocked: true });
}
