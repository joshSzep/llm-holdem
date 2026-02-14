"use client";

import { useEffect, useMemo, useState } from "react";

type MatchEvent = {
  type: string;
  matchId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export function MatchEventsFeed({ selectedMatchId }: { selectedMatchId?: string }) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = new URL(`${protocol}://${window.location.host}/ws`);

    if (selectedMatchId) {
      url.searchParams.set("matchId", selectedMatchId);
    }

    const socket = new WebSocket(url.toString());

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as MatchEvent;

        if (!parsed.type || !parsed.timestamp) {
          return;
        }

        if (!parsed.type.startsWith("match.")) {
          return;
        }

        setEvents((current) => [parsed, ...current].slice(0, 25));
      } catch {
        // ignore malformed event payloads
      }
    };

    return () => {
      socket.close();
    };
  }, [selectedMatchId]);

  const statusText = useMemo(
    () => (connected ? "Live websocket connected" : "Websocket disconnected"),
    [connected],
  );

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Live match events</h2>
        <span
          className={`text-xs ${connected ? "text-emerald-300" : "text-zinc-500"}`}
        >
          {statusText}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Streaming `match.created`, `match.started`, `match.state`, and `match.completed` events.
      </p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No events yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((event, index) => (
            <li
              key={`${event.timestamp}-${event.type}-${index}`}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                {event.type}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                match: {event.matchId} · {new Date(event.timestamp).toLocaleTimeString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
