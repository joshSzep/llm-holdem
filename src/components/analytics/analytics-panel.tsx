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

type InvalidDecisionRow = {
  id: string;
  matchId: string;
  handNumber: number;
  street: string;
  actorSeatIndex: number;
  category: string;
  message: string | null;
  validationError: string | null;
  rawResponse: string;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
  } | null;
};

type AnalyticsPayload = {
  overview: AnalyticsOverview;
  recentMatches: MatchAnalyticsRow[];
  recentInvalidDecisions: InvalidDecisionRow[];
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [exportedJson, setExportedJson] = useState(false);

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

  async function onCategoryChange(nextCategory: string) {
    setCategoryFilter(nextCategory);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analytics?category=${encodeURIComponent(nextCategory)}`, {
        cache: "no-store",
      });

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
  }

  async function copyRawResponse(rowId: string, rawResponse: string) {
    try {
      await navigator.clipboard.writeText(rawResponse);
      setCopiedRowId(rowId);
      setTimeout(() => {
        setCopiedRowId((current) => (current === rowId ? null : current));
      }, 1500);
    } catch {
      setError("Failed to copy raw response.");
    }
  }

  async function copyAllVisibleRawResponses() {
    if (!analytics) {
      return;
    }

    const visible = analytics.recentInvalidDecisions.filter((row) => row.rawResponse.trim().length > 0);
    if (visible.length === 0) {
      setError("No raw responses available to copy.");
      return;
    }

    const payload = visible
      .map((row) => {
        const header = `${row.createdAt} | ${row.matchId} | hand ${row.handNumber} ${row.street} seat ${row.actorSeatIndex + 1} | ${row.category}`;
        return `${header}\n${row.rawResponse}`;
      })
      .join("\n\n-----\n\n");

    try {
      await navigator.clipboard.writeText(payload);
      setCopiedAll(true);
      setTimeout(() => {
        setCopiedAll(false);
      }, 1500);
    } catch {
      setError("Failed to copy raw responses.");
    }
  }

  function exportVisibleInvalidAsJson() {
    if (!analytics) {
      return;
    }

    const visible = analytics.recentInvalidDecisions;
    if (visible.length === 0) {
      setError("No visible invalid decisions to export.");
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      categoryFilter,
      count: visible.length,
      rows: visible,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `invalid-decisions-${categoryFilter}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);

    setExportedJson(true);
    setTimeout(() => {
      setExportedJson(false);
    }, 1500);
  }

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
          onClick={() => {
            if (categoryFilter === "all") {
              void refreshAnalytics();
              return;
            }

            void onCategoryChange(categoryFilter);
          }}
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

          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Recent Invalid Decisions
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="analytics-category" className="text-zinc-400">
                  Category
                </label>
                <select
                  id="analytics-category"
                  value={categoryFilter}
                  onChange={(event) => void onCategoryChange(event.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  <option value="all">all</option>
                  {Object.keys(analytics.overview.invalidByCategory)
                    .sort()
                    .map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => void copyAllVisibleRawResponses()}
                  className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 transition hover:bg-zinc-800"
                >
                  {copiedAll ? "copied all" : "copy visible"}
                </button>
                <button
                  type="button"
                  onClick={exportVisibleInvalidAsJson}
                  className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 transition hover:bg-zinc-800"
                >
                  {exportedJson ? "exported" : "export json"}
                </button>
              </div>
            </div>

            {analytics.recentInvalidDecisions.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">No invalid decisions for this filter.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-zinc-800">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-zinc-900/80 uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Match</th>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">Hand</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Message</th>
                      <th className="px-3 py-2">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentInvalidDecisions.map((row) => (
                      <tr key={row.id} className="border-t border-zinc-800 text-zinc-300">
                        <td className="px-3 py-2 text-zinc-500">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{row.matchId.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          {row.agent ? `${row.agent.name} (${row.agent.provider})` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.handNumber} · {row.street} · seat {row.actorSeatIndex + 1}
                        </td>
                        <td className="px-3 py-2">{row.category}</td>
                        <td className="px-3 py-2">{row.message ?? row.validationError ?? "—"}</td>
                        <td className="px-3 py-2 align-top">
                          {row.rawResponse ? (
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => void copyRawResponse(row.id, row.rawResponse)}
                                className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 transition hover:bg-zinc-800"
                              >
                                {copiedRowId === row.id ? "copied" : "copy"}
                              </button>
                              <details>
                                <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                                  view
                                </summary>
                                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
                                  {row.rawResponse}
                                </pre>
                              </details>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}