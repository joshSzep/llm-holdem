export type MatchEventType =
  | "match.created"
  | "match.started"
  | "match.state"
  | "match.completed";

export type MatchEvent = {
  type: MatchEventType;
  matchId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type MatchEventListener = (event: MatchEvent) => void;

const listeners = new Set<MatchEventListener>();

export function publishMatchEvent(
  event: Omit<MatchEvent, "timestamp"> & { timestamp?: string },
): void {
  const normalizedEvent: MatchEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  for (const listener of listeners) {
    listener(normalizedEvent);
  }
}

export function subscribeMatchEvents(listener: MatchEventListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
