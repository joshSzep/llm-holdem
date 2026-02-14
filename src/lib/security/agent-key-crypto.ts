import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const KEY_VERSION = 1;
const ENCRYPTION_INFO = Buffer.from("llm-holdem-agent-key-v1", "utf8");

function deriveAgentKey(sessionKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", sessionKey, salt, ENCRYPTION_INFO, 32),
  );
}

export type EncryptedAgentKeyPayload = {
  encryptedKey: string;
  keySalt: string;
  keyIv: string;
  keyVersion: number;
};

export function encryptAgentApiKey(
  plaintextApiKey: string,
  sessionKey: Buffer,
): EncryptedAgentKeyPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveAgentKey(sessionKey, salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextApiKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([encrypted, authTag]);

  return {
    encryptedKey: packed.toString("base64"),
    keySalt: salt.toString("base64"),
    keyIv: iv.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptAgentApiKeyWithSession(
  payload: {
    encryptedKey: string;
    keySalt: string;
    keyIv: string;
  },
  sessionKey: Buffer,
): string {
  const packed = Buffer.from(payload.encryptedKey, "base64");
  const ciphertext = packed.subarray(0, packed.length - 16);
  const authTag = packed.subarray(packed.length - 16);

  const salt = Buffer.from(payload.keySalt, "base64");
  const iv = Buffer.from(payload.keyIv, "base64");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveAgentKey(sessionKey, salt),
    iv,
  );
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
