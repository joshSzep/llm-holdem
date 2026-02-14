"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LeaderboardRow = {
  agentId: string;
  name: string;
  provider: string;
  modelId: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  top3: number;
  avgPlace: number | null;
};

type AgentStanding = {
  matchId: string;
  place: number;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  createdAt: string;
};

type AgentDetail = {
  agent: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
    createdAt: string;
  };
  rating: number;
  ratingUpdatedAt: string | null;
  standings: AgentStanding[];
};

export function LeaderboardPanel() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refreshLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load leaderboard.");
      }

      const body = (await response.json()) as { rows: LeaderboardRow[] };
      setRows(body.rows);
      setSelectedAgentId((previous) => previous ?? body.rows[0]?.agentId ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load leaderboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentDetail(null);
      return;
    }

    void loadAgentDetail(selectedAgentId);
  }, [selectedAgentId]);

  async function loadAgentDetail(agentId: string) {
    setDetailLoading(true);

    try {
      const response = await fetch(`/api/leaderboard/${agentId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load agent rating history.");
      }

      const body = (await response.json()) as AgentDetail;
      setAgentDetail(body);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Failed to load agent rating history.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  const selectedRow = useMemo(
    () => rows.find((row) => row.agentId === selectedAgentId) ?? null,
    [rows, selectedAgentId],
  );

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Leaderboard (Elo)</h2>
          <p className="text-sm text-zinc-400">
            Multiplayer Elo ratings derived from final tournament placements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshLeaderboard()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      {loading ? (
        <p className="mt-3 text-sm text-zinc-400">Loading leaderboard...</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Matches</th>
                  <th className="px-3 py-2">Wins</th>
                  <th className="px-3 py-2">Top 3</th>
                  <th className="px-3 py-2">Avg Place</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.agentId}
                    className={`cursor-pointer border-t border-zinc-800 ${
                      selectedAgentId === row.agentId
                        ? "bg-zinc-800/60"
                        : "hover:bg-zinc-900/60"
                    }`}
                    onClick={() => setSelectedAgentId(row.agentId)}
                  >
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-zinc-100">{row.name}</p>
                      <p className="text-xs text-zinc-400">
                        {row.provider} · {row.modelId}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-semibold text-zinc-100">
                      {row.rating.toFixed(1)}
                    </td>
                    <td className="px-3 py-2">{row.matchesPlayed}</td>
                    <td className="px-3 py-2">{row.wins}</td>
                    <td className="px-3 py-2">{row.top3}</td>
                    <td className="px-3 py-2">
                      {row.avgPlace !== null ? row.avgPlace.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Rating History
            </h3>

            {!selectedRow ? (
              <p className="mt-3 text-sm text-zinc-500">Select an agent to inspect history.</p>
            ) : detailLoading ? (
              <p className="mt-3 text-sm text-zinc-500">Loading history...</p>
            ) : !agentDetail ? (
              <p className="mt-3 text-sm text-zinc-500">No detail available.</p>
            ) : (
              <>
                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
                  <p>
                    <span className="text-zinc-500">Agent:</span> {agentDetail.agent.name}
                  </p>
                  <p>
                    <span className="text-zinc-500">Current Elo:</span> {agentDetail.rating.toFixed(1)}
                  </p>
                </div>

                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {agentDetail.standings.length === 0 ? (
                    <li className="text-sm text-zinc-500">No completed matches yet.</li>
                  ) : (
                    agentDetail.standings.map((standing) => (
                      <li
                        key={`${standing.matchId}-${standing.createdAt}`}
                        className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs"
                      >
                        <p className="text-zinc-300">
                          match {standing.matchId} · place {standing.place}
                        </p>
                        <p className="mt-1 text-zinc-500">
                          {standing.ratingBefore.toFixed(1)} → {standing.ratingAfter.toFixed(1)} (
                          {standing.delta >= 0 ? "+" : ""}
                          {standing.delta.toFixed(2)})
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
