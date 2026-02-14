type UnlockSession = {
  key: Buffer;
  unlockedAt: Date;
};

let activeSession: UnlockSession | null = null;

export function isUnlocked(): boolean {
  return activeSession !== null;
}

export function setUnlockSession(key: Buffer): void {
  activeSession = {
    key,
    unlockedAt: new Date(),
  };
}

export function clearUnlockSession(): void {
  activeSession = null;
}

export function getSessionKey(): Buffer {
  if (!activeSession) {
    throw new Error("Application is locked.");
  }

  return activeSession.key;
}

export function getUnlockMetadata() {
  if (!activeSession) {
    return null;
  }

  return {
    unlockedAt: activeSession.unlockedAt,
  };
}
