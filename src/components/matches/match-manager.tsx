"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { SupportedProvider } from "@/lib/llm/curated-models";
import { MatchEventsFeed } from "@/components/matches/match-events-feed";

type AgentSummary = {
  id: string;
  name: string;
  provider: SupportedProvider;
  modelId: string;
};

type MatchSeatSummary = {
  seatIndex: number;
  stack: number;
  isEliminated: boolean;
  finishPlace: number | null;
  agent: AgentSummary;
};

type MatchSummary = {
  id: string;
  status: string;
  mode: "auto" | "step";
  seed: string;
  createdAt: string;
  playbackSpeedMs: number;
  seats: MatchSeatSummary[];
};

export function MatchManager() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"auto" | "step">("auto");
  const [seed, setSeed] = useState("");
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(300);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startingMatchId, setStartingMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventMatchFilter, setEventMatchFilter] = useState<string | undefined>(
    undefined,
  );

  const selectedCount = selectedAgentIds.length;
  const canSubmit = selectedCount === 6 && !submitting;

  const seatPreview = useMemo(
    () =>
      selectedAgentIds
        .map((agentId) => agents.find((agent) => agent.id === agentId))
        .filter((agent): agent is AgentSummary => Boolean(agent)),
    [agents, selectedAgentIds],
  );

  useEffect(() => {
    void refreshData();
  }, []);

  async function refreshData() {
    setLoading(true);
    setError(null);

    try {
      const [agentResponse, matchResponse] = await Promise.all([
        fetch("/api/agents", { cache: "no-store" }),
        fetch("/api/matches", { cache: "no-store" }),
      ]);

      if (!agentResponse.ok) {
        const body = (await agentResponse.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load agents.");
      }

      if (!matchResponse.ok) {
        const body = (await matchResponse.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load matches.");
      }

      const agentBody = (await agentResponse.json()) as { agents: AgentSummary[] };
      const matchBody = (await matchResponse.json()) as { matches: MatchSummary[] };

      setAgents(
        agentBody.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          modelId: agent.modelId,
        })),
      );
      setMatches(matchBody.matches);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh data.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) => {
      if (current.includes(agentId)) {
        return current.filter((value) => value !== agentId);
      }

      if (current.length >= 6) {
        return current;
      }

      return [...current, agentId];
    });
  }

  async function onCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          seed: seed.trim() || undefined,
          playbackSpeedMs,
          selectedAgentIds,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to create match.");
      }

      setSelectedAgentIds([]);
      setSeed("");
      await refreshData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create match.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onStartMatch(matchId: string) {
    setError(null);
    setStartingMatchId(matchId);

    try {
      const response = await fetch(`/api/matches/${matchId}/start`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to start match.");
      }

      setEventMatchFilter(matchId);
      await refreshData();
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : "Failed to start match.",
      );
    } finally {
      setStartingMatchId(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Matches</h2>
        <p className="text-sm text-zinc-400">
          Create deterministic 6-max SNG matches from saved agents.
        </p>
      </div>

      <form className="mt-5 space-y-4" onSubmit={onCreateMatch}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-zinc-300" htmlFor="match-mode">
              Mode
            </label>
            <select
              id="match-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as "auto" | "step")}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="auto">Auto</option>
              <option value="step">Step</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-300" htmlFor="match-speed">
              Playback speed (ms/action)
            </label>
            <input
              id="match-speed"
              type="number"
              min={0}
              max={5000}
              value={playbackSpeedMs}
              onChange={(event) => setPlaybackSpeedMs(Number(event.target.value || 0))}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300" htmlFor="match-seed">
            Seed (optional, autogenerated if blank)
          </label>
          <input
            id="match-seed"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            placeholder="e.g. my-seed-2026-02-13"
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-300">
            Select exactly 6 agents ({selectedCount}/6)
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {agents.map((agent) => {
              const checked = selectedAgentIds.includes(agent.id);
              const disabled = !checked && selectedAgentIds.length >= 6;

              return (
                <label
                  key={agent.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    checked
                      ? "border-zinc-400 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900/60"
                  } ${disabled ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleAgent(agent.id)}
                    className="mr-2"
                  />
                  {agent.name}
                  <span className="ml-2 text-xs text-zinc-400">
                    ({agent.provider} · {agent.modelId})
                  </span>
                </label>
              );
            })}
          </div>

          {agents.length < 6 ? (
            <p className="text-xs text-amber-300">
              Create at least 6 agents before starting matches.
            </p>
          ) : null}
        </div>

        {seatPreview.length > 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Seat preview
            </p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {seatPreview.map((agent, index) => (
                <li key={agent.id}>
                  Seat {index + 1}: {agent.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create match"}
          </button>
          <button
            type="button"
            onClick={() => void refreshData()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </form>

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Recent matches
        </h3>

        {loading ? <p className="mt-3 text-sm text-zinc-400">Loading matches...</p> : null}

        {!loading && matches.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No matches created yet.
          </p>
        ) : null}

        <ul className="mt-3 space-y-3">
          {matches.map((match) => (
            <li
              key={match.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{match.id}</p>
                  <p className="text-xs text-zinc-400">
                    {match.mode} · {match.status} · speed {match.playbackSpeedMs}ms
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">seed: {match.seed}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-zinc-500">
                    {new Date(match.createdAt).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEventMatchFilter(match.id)}
                      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
                    >
                      Watch events
                    </button>
                    <button
                      type="button"
                      onClick={() => void onStartMatch(match.id)}
                      disabled={
                        startingMatchId === match.id ||
                        match.status === "running" ||
                        match.status === "completed"
                      }
                      className="rounded-md border border-emerald-900 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-950/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {startingMatchId === match.id ? "Starting..." : "Start"}
                    </button>
                  </div>
                </div>
              </div>
              <ul className="mt-3 grid gap-1 text-xs text-zinc-300 md:grid-cols-2">
                {match.seats.map((seat) => (
                  <li key={`${match.id}-${seat.seatIndex}`}>
                    Seat {seat.seatIndex + 1}: {seat.agent.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <MatchEventsFeed selectedMatchId={eventMatchFilter} />
      </div>
    </section>
  );
}
