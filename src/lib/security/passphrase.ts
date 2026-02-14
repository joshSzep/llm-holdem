import { randomBytes, scrypt, timingSafeEqual } from "crypto";

export const MIN_PASSPHRASE_LENGTH = 12;

export type KdfConfig = {
  algorithm: "scrypt";
  keyLength: number;
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

const defaultKdfConfig: KdfConfig = {
  algorithm: "scrypt",
  keyLength: 32,
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

type HashParams = {
  verifierHash: string;
  verifierSalt: string;
  kdfConfigJson: string;
};

type StoredSecret = {
  verifierHash: string;
  verifierSalt: string;
  kdfConfigJson: string;
};

function parseKdfConfig(input: string): KdfConfig {
  const parsed = JSON.parse(input) as KdfConfig;

  if (parsed.algorithm !== "scrypt") {
    throw new Error("Unsupported KDF algorithm.");
  }

  return parsed;
}

async function deriveKey(
  passphrase: string,
  saltBase64: string,
  config: KdfConfig,
): Promise<Buffer> {
  const salt = Buffer.from(saltBase64, "base64");

  return new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      config.keyLength,
      {
        N: config.N,
        r: config.r,
        p: config.p,
        maxmem: config.maxmem,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

export function validatePassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`;
  }

  return null;
}

export async function hashPassphrase(passphrase: string): Promise<HashParams> {
  const verifierSalt = randomBytes(16).toString("base64");
  const key = await deriveKey(passphrase, verifierSalt, defaultKdfConfig);

  return {
    verifierHash: key.toString("base64"),
    verifierSalt,
    kdfConfigJson: JSON.stringify(defaultKdfConfig),
  };
}

export async function verifyPassphrase(
  passphrase: string,
  secret: StoredSecret,
): Promise<boolean> {
  const config = parseKdfConfig(secret.kdfConfigJson);
  const derived = await deriveKey(passphrase, secret.verifierSalt, config);
  const stored = Buffer.from(secret.verifierHash, "base64");

  if (stored.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(stored, derived);
}

export async function deriveSessionKey(
  passphrase: string,
  secret: StoredSecret,
): Promise<Buffer> {
  const config = parseKdfConfig(secret.kdfConfigJson);
  return deriveKey(passphrase, secret.verifierSalt, config);
}
