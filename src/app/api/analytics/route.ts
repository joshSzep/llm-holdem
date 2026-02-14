import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

type TokenUsageTotals = {
  input: number;
  output: number;
  total: number;
};

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function extractNumberFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseTokenUsage(tokenUsageJson: string | null): TokenUsageTotals {
  if (!tokenUsageJson) {
    return { input: 0, output: 0, total: 0 };
  }

  try {
    const parsed = JSON.parse(tokenUsageJson) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { input: 0, output: 0, total: 0 };
    }

    const usage = parsed as Record<string, unknown>;
    const input =
      extractNumberFromRecord(usage, ["input_tokens", "inputTokenCount", "promptTokens", "inputTokens"]) ??
      0;
    const output =
      extractNumberFromRecord(usage, [
        "output_tokens",
        "outputTokenCount",
        "completionTokens",
        "outputTokens",
      ]) ?? 0;

    const total =
      extractNumberFromRecord(usage, ["total_tokens", "totalTokenCount", "totalTokens"]) ?? input + output;

    return {
      input,
      output,
      total,
    };
  } catch {
    return { input: 0, output: 0, total: 0 };
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export async function GET() {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const [
    totalMatches,
    completedMatches,
    allActions,
    recentMatches,
  ] = await Promise.all([
    prisma.match.count(),
    prisma.match.count({ where: { status: "completed" } }),
    prisma.matchAction.findMany({
      select: {
        latencyMs: true,
        retried: true,
        validationError: true,
        tokenUsageJson: true,
      },
    }),
    prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        mode: true,
        seed: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        actions: {
          select: {
            latencyMs: true,
            retried: true,
            validationError: true,
            tokenUsageJson: true,
          },
        },
      },
    }),
  ]);

  let retriedActions = 0;
  let invalidActions = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  const latencyValues: number[] = [];

  for (const action of allActions) {
    if (action.retried) {
      retriedActions += 1;
    }

    if (action.validationError) {
      invalidActions += 1;
    }

    if (typeof action.latencyMs === "number") {
      latencyValues.push(action.latencyMs);
    }

    const usage = parseTokenUsage(action.tokenUsageJson);
    totalInputTokens += usage.input;
    totalOutputTokens += usage.output;
    totalTokens += usage.total;
  }

  const totalActions = allActions.length;

  const recent = recentMatches.map((match) => {
    let matchRetries = 0;
    let matchInvalid = 0;
    let matchInputTokens = 0;
    let matchOutputTokens = 0;
    let matchTotalTokens = 0;
    const matchLatencies: number[] = [];

    for (const action of match.actions) {
      if (action.retried) {
        matchRetries += 1;
      }

      if (action.validationError) {
        matchInvalid += 1;
      }

      if (typeof action.latencyMs === "number") {
        matchLatencies.push(action.latencyMs);
      }

      const usage = parseTokenUsage(action.tokenUsageJson);
      matchInputTokens += usage.input;
      matchOutputTokens += usage.output;
      matchTotalTokens += usage.total;
    }

    const actionCount = match.actions.length;

    return {
      id: match.id,
      status: match.status,
      mode: match.mode,
      seed: match.seed,
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      completedAt: match.completedAt,
      actionCount,
      avgLatencyMs: average(matchLatencies),
      p95LatencyMs: percentile(matchLatencies, 95),
      retries: matchRetries,
      invalidActions: matchInvalid,
      retryRate: actionCount > 0 ? matchRetries / actionCount : 0,
      invalidRate: actionCount > 0 ? matchInvalid / actionCount : 0,
      tokenUsage: {
        input: matchInputTokens,
        output: matchOutputTokens,
        total: matchTotalTokens,
      },
    };
  });

  return NextResponse.json({
    overview: {
      totalMatches,
      completedMatches,
      totalActions,
      avgLatencyMs: average(latencyValues),
      p95LatencyMs: percentile(latencyValues, 95),
      retriedActions,
      invalidActions,
      retryRate: totalActions > 0 ? retriedActions / totalActions : 0,
      invalidRate: totalActions > 0 ? invalidActions / totalActions : 0,
      tokenUsage: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalTokens,
      },
    },
    recentMatches: recent,
  });
}