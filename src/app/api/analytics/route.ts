import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

type TokenUsageTotals = {
  input: number;
  output: number;
  total: number;
};

function parseValidationErrorCategory(validationError: string | null): string {
  if (!validationError) {
    return "none";
  }

  const match = validationError.match(/^\[([a-z_]+)\]/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return "legacy_unclassified";
}

function parseFallbackReason(requestedActionJson: string | null): string | null {
  if (!requestedActionJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(requestedActionJson) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record.action !== "forced_fallback") {
      return null;
    }

    const reason = record.reason;
    return typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "unknown";
  } catch {
    return null;
  }
}

function stripValidationErrorCategory(validationError: string | null): string | null {
  if (!validationError) {
    return null;
  }

  return validationError.replace(/^\[[a-z_]+\]\s*/i, "").trim();
}

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

export async function GET(request: Request) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const url = new URL(request.url);
  const categoryFilter = url.searchParams.get("category")?.toLowerCase() ?? "all";
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const invalidLimit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  const [
    totalMatches,
    completedMatches,
    allActions,
    recentMatches,
    recentInvalidActions,
  ] = await Promise.all([
    prisma.match.count(),
    prisma.match.count({ where: { status: "completed" } }),
    prisma.matchAction.findMany({
      select: {
        latencyMs: true,
        retried: true,
        validationError: true,
        requestedActionJson: true,
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
            requestedActionJson: true,
            tokenUsageJson: true,
          },
        },
      },
    }),
    prisma.matchAction.findMany({
      where: {
        NOT: {
          validationError: null,
        },
      },
      orderBy: { createdAt: "desc" },
      take: invalidLimit,
      select: {
        id: true,
        matchId: true,
        handNumber: true,
        street: true,
        actorSeatIndex: true,
        validationError: true,
        rawResponse: true,
        createdAt: true,
        agent: {
          select: {
            id: true,
            name: true,
            provider: true,
            modelId: true,
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
  const invalidByCategory: Record<string, number> = {};
  const fallbackByReason: Record<string, number> = {};
  const latencyValues: number[] = [];

  for (const action of allActions) {
    if (action.retried) {
      retriedActions += 1;
    }

    if (action.validationError) {
      invalidActions += 1;
      const category = parseValidationErrorCategory(action.validationError);
      invalidByCategory[category] = (invalidByCategory[category] ?? 0) + 1;
    }

    const fallbackReason = parseFallbackReason(action.requestedActionJson);
    if (fallbackReason) {
      fallbackByReason[fallbackReason] = (fallbackByReason[fallbackReason] ?? 0) + 1;
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
    const matchInvalidByCategory: Record<string, number> = {};
    const matchFallbackByReason: Record<string, number> = {};
    const matchLatencies: number[] = [];

    for (const action of match.actions) {
      if (action.retried) {
        matchRetries += 1;
      }

      if (action.validationError) {
        matchInvalid += 1;
        const category = parseValidationErrorCategory(action.validationError);
        matchInvalidByCategory[category] = (matchInvalidByCategory[category] ?? 0) + 1;
      }

      const fallbackReason = parseFallbackReason(action.requestedActionJson);
      if (fallbackReason) {
        matchFallbackByReason[fallbackReason] = (matchFallbackByReason[fallbackReason] ?? 0) + 1;
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
      invalidByCategory: matchInvalidByCategory,
      fallbackByReason: matchFallbackByReason,
      retryRate: actionCount > 0 ? matchRetries / actionCount : 0,
      invalidRate: actionCount > 0 ? matchInvalid / actionCount : 0,
      tokenUsage: {
        input: matchInputTokens,
        output: matchOutputTokens,
        total: matchTotalTokens,
      },
    };
  });

  const invalidDecisions = recentInvalidActions
    .map((action) => {
      const category = parseValidationErrorCategory(action.validationError);
      return {
        id: action.id,
        matchId: action.matchId,
        handNumber: action.handNumber,
        street: action.street,
        actorSeatIndex: action.actorSeatIndex,
        category,
        message: stripValidationErrorCategory(action.validationError),
        validationError: action.validationError,
        rawResponse: action.rawResponse,
        createdAt: action.createdAt,
        agent: action.agent,
      };
    })
    .filter((action) => categoryFilter === "all" || action.category === categoryFilter);

  return NextResponse.json({
    overview: {
      totalMatches,
      completedMatches,
      totalActions,
      avgLatencyMs: average(latencyValues),
      p95LatencyMs: percentile(latencyValues, 95),
      retriedActions,
      invalidActions,
      invalidByCategory,
      fallbackByReason,
      retryRate: totalActions > 0 ? retriedActions / totalActions : 0,
      invalidRate: totalActions > 0 ? invalidActions / totalActions : 0,
      tokenUsage: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalTokens,
      },
    },
    recentMatches: recent,
    recentInvalidDecisions: invalidDecisions,
  });
}