type UnlockSession = {
  key: Buffer;
  unlockedAt: Date;
};

type UnlockSessionStore = {
  activeSession: UnlockSession | null;
};

const UNLOCK_SESSION_STORE_KEY = "__LLM_HOLDEM_UNLOCK_SESSION_STORE__";

const globalUnlockStore = globalThis as typeof globalThis & {
  [UNLOCK_SESSION_STORE_KEY]?: UnlockSessionStore;
};

const unlockSessionStore: UnlockSessionStore =
  globalUnlockStore[UNLOCK_SESSION_STORE_KEY] ??
  (globalUnlockStore[UNLOCK_SESSION_STORE_KEY] = { activeSession: null });

export function isUnlocked(): boolean {
  return unlockSessionStore.activeSession !== null;
}

export function setUnlockSession(key: Buffer): void {
  unlockSessionStore.activeSession = {
    key,
    unlockedAt: new Date(),
  };
}

export function clearUnlockSession(): void {
  unlockSessionStore.activeSession = null;
}

export function getSessionKey(): Buffer {
  if (!unlockSessionStore.activeSession) {
    throw new Error("Application is locked.");
  }

  return unlockSessionStore.activeSession.key;
}

export function getUnlockMetadata() {
  if (!unlockSessionStore.activeSession) {
    return null;
  }

  return {
    unlockedAt: unlockSessionStore.activeSession.unlockedAt,
  };
}
