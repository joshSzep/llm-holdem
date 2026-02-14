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

type TimelineEvent = {
  id: string;
  eventIndex: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
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
  const [pausingMatchId, setPausingMatchId] = useState<string | null>(null);
  const [resumingMatchId, setResumingMatchId] = useState<string | null>(null);
  const [steppingMatchId, setSteppingMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventMatchFilter, setEventMatchFilter] = useState<string | undefined>(
    undefined,
  );
  const [timelineMatchId, setTimelineMatchId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineIndex, setTimelineIndex] = useState<number>(-1);

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

  async function refreshTimeline(matchId: string) {
    const response = await fetch(`/api/matches/${matchId}/timeline`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to fetch match timeline.");
    }

    const body = (await response.json()) as {
      matchId: string;
      timeline: TimelineEvent[];
    };

    setTimelineMatchId(body.matchId);
    setTimelineEvents(body.timeline);
    setTimelineIndex(body.timeline.length > 0 ? body.timeline.length - 1 : -1);
  }

  async function onPauseMatch(matchId: string) {
    setError(null);
    setPausingMatchId(matchId);

    try {
      const response = await fetch(`/api/matches/${matchId}/pause`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to pause match.");
      }

      await Promise.all([refreshData(), refreshTimeline(matchId)]);
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Failed to pause match.");
    } finally {
      setPausingMatchId(null);
    }
  }

  async function onResumeMatch(matchId: string) {
    setError(null);
    setResumingMatchId(matchId);

    try {
      const response = await fetch(`/api/matches/${matchId}/resume`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to resume match.");
      }

      await refreshData();
      setEventMatchFilter(matchId);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume match.");
    } finally {
      setResumingMatchId(null);
    }
  }

  async function onStepMatch(matchId: string) {
    setError(null);
    setSteppingMatchId(matchId);

    try {
      const response = await fetch(`/api/matches/${matchId}/step`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to step match.");
      }

      await Promise.all([refreshData(), refreshTimeline(matchId)]);
      setEventMatchFilter(matchId);
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : "Failed to step match.");
    } finally {
      setSteppingMatchId(null);
    }
  }

  const timelineCurrent =
    timelineIndex >= 0 && timelineIndex < timelineEvents.length
      ? timelineEvents[timelineIndex]
      : null;

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
                      onClick={() => {
                        setEventMatchFilter(match.id);
                        void refreshTimeline(match.id);
                      }}
                      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
                    >
                      Replay
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
                    <button
                      type="button"
                      onClick={() => void onPauseMatch(match.id)}
                      disabled={pausingMatchId === match.id || match.status !== "running"}
                      className="rounded-md border border-amber-900 px-2.5 py-1 text-xs text-amber-300 transition hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pausingMatchId === match.id ? "Pausing..." : "Pause"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResumeMatch(match.id)}
                      disabled={resumingMatchId === match.id || match.status === "running" || match.status === "completed"}
                      className="rounded-md border border-sky-900 px-2.5 py-1 text-xs text-sky-300 transition hover:bg-sky-950/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resumingMatchId === match.id ? "Resuming..." : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onStepMatch(match.id)}
                      disabled={steppingMatchId === match.id || match.status === "completed"}
                      className="rounded-md border border-violet-900 px-2.5 py-1 text-xs text-violet-300 transition hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {steppingMatchId === match.id ? "Stepping..." : "Step"}
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

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Replay timeline</h2>
          <p className="text-xs text-zinc-500">
            {timelineMatchId ? `match ${timelineMatchId}` : "Select Replay on a match"}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTimelineIndex((index) => Math.max(-1, index - 1))}
            disabled={timelineIndex <= -1}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Step backward
          </button>
          <button
            type="button"
            onClick={() =>
              setTimelineIndex((index) =>
                Math.min(timelineEvents.length - 1, index + 1),
              )
            }
            disabled={timelineEvents.length === 0 || timelineIndex >= timelineEvents.length - 1}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Step forward
          </button>
          <button
            type="button"
            onClick={() =>
              setTimelineIndex(timelineEvents.length > 0 ? timelineEvents.length - 1 : -1)
            }
            disabled={timelineEvents.length === 0}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Jump live
          </button>
        </div>

        {timelineCurrent ? (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              {timelineCurrent.eventType}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              event #{timelineCurrent.eventIndex} · {new Date(timelineCurrent.createdAt).toLocaleString()}
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-300">
              {JSON.stringify(timelineCurrent.payload, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No timeline event selected.</p>
        )}
      </div>
    </section>
  );
}
