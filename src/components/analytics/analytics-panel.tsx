"use client";

import { useCallback, useEffect, useState } from "react";

type AnalyticsOverview = {
  totalMatches: number;
  completedMatches: number;
  totalActions: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  retriedActions: number;
  invalidActions: number;
  invalidByCategory: Record<string, number>;
  retryRate: number;
  invalidRate: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
};

type MatchAnalyticsRow = {
  id: string;
  status: string;
  mode: "auto" | "step";
  createdAt: string;
  completedAt: string | null;
  actionCount: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  retries: number;
  invalidActions: number;
  invalidByCategory: Record<string, number>;
  retryRate: number;
  invalidRate: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
};

type AnalyticsPayload = {
  overview: AnalyticsOverview;
  recentMatches: MatchAnalyticsRow[];
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)} ms`;
}

function formatCategorySummary(input: Record<string, number>): string {
  const entries = Object.entries(input)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([category, count]) => `${category}:${count}`).join(" · ");
}

export function AnalyticsPanel() {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analytics", { cache: "no-store" });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load analytics.");
      }

      const body = (await response.json()) as AnalyticsPayload;
      setAnalytics(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAnalytics();
  }, [refreshAnalytics]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Match Analytics</h2>
          <p className="text-sm text-zinc-400">
            Telemetry summary for latency, retries, invalid decisions, and token usage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAnalytics()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      {loading || !analytics ? (
        <p className="mt-3 text-sm text-zinc-400">Loading analytics...</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <p className="text-zinc-400">Matches</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {analytics.overview.completedMatches}/{analytics.overview.totalMatches}
              </p>
              <p className="text-xs text-zinc-500">completed / total</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <p className="text-zinc-400">Latency</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {formatMs(analytics.overview.avgLatencyMs)}
              </p>
              <p className="text-xs text-zinc-500">avg · p95 {formatMs(analytics.overview.p95LatencyMs)}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <p className="text-zinc-400">Retries / Invalid</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {analytics.overview.retriedActions} / {analytics.overview.invalidActions}
              </p>
              <p className="text-xs text-zinc-500">
                {formatRate(analytics.overview.retryRate)} · {formatRate(analytics.overview.invalidRate)}
              </p>
              <p className="text-xs text-zinc-500">
                {formatCategorySummary(analytics.overview.invalidByCategory)}
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <p className="text-zinc-400">Tokens</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{analytics.overview.tokenUsage.total}</p>
              <p className="text-xs text-zinc-500">
                in {analytics.overview.tokenUsage.input} · out {analytics.overview.tokenUsage.output}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-zinc-900/80 uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                  <th className="px-3 py-2">Latency (avg/p95)</th>
                  <th className="px-3 py-2">Retries</th>
                  <th className="px-3 py-2">Invalid</th>
                  <th className="px-3 py-2">Error Mix</th>
                  <th className="px-3 py-2">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentMatches.map((match) => (
                  <tr key={match.id} className="border-t border-zinc-800 text-zinc-300">
                    <td className="px-3 py-2">{match.id.slice(0, 10)}</td>
                    <td className="px-3 py-2">{match.status}</td>
                    <td className="px-3 py-2">{match.actionCount}</td>
                    <td className="px-3 py-2">
                      {formatMs(match.avgLatencyMs)} / {formatMs(match.p95LatencyMs)}
                    </td>
                    <td className="px-3 py-2">
                      {match.retries} ({formatRate(match.retryRate)})
                    </td>
                    <td className="px-3 py-2">
                      {match.invalidActions} ({formatRate(match.invalidRate)})
                    </td>
                    <td className="px-3 py-2">{formatCategorySummary(match.invalidByCategory)}</td>
                    <td className="px-3 py-2">{match.tokenUsage.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}