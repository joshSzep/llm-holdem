import { Provider } from "@prisma/client";

import { decryptAgentApiKeyWithSession } from "@/lib/security/agent-key-crypto";
import { getSessionKey } from "@/lib/security/unlock-session";

export type LegalActionSet = {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
};

export type DecisionContext = {
  matchId: string;
  handNumber: number;
  levelIndex: number;
  smallBlind: number;
  bigBlind: number;
  actorSeatIndex: number;
  seats: Array<{
    seatIndex: number;
    stack: number;
    isEliminated: boolean;
    contribution: number;
  }>;
  actionsThisHand: Array<{
    seatIndex: number;
    action: string;
    amount: number;
  }>;
  legal: LegalActionSet;
};

export type ValidatedDecision = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount: number;
  tableTalk?: string;
};

export type DecisionResolution = {
  decision: ValidatedDecision;
  requestedActionJson: string;
  resolvedActionJson: string;
  rawResponse: string;
  validationError: string | null;
  retried: boolean;
  latencyMs: number;
  tokenUsageJson: string | null;
};

type InvocationResult = {
  rawText: string;
  tokenUsage: unknown;
};

type DecisionErrorCategory =
  | "invalid_json"
  | "invalid_schema"
  | "illegal_action"
  | "provider_timeout"
  | "provider_rate_limit"
  | "provider_transport"
  | "provider_config"
  | "unknown";

type TransportClassification = {
  category: DecisionErrorCategory;
  retryable: boolean;
};

const PROVIDER_TIMEOUT_MS = 20_000;
const MAX_TRANSPORT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

const RESPONSE_CONTRACT = `Return exactly one JSON object with this shape:\n{\n  "action": "fold | check | call | bet | raise | all_in",\n  "amount": 0,\n  "tableTalk": "optional short string"\n}\nNo markdown. No surrounding text.`;

const ACTIONS = new Set(["fold", "check", "call", "bet", "raise", "all_in"]);

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Response was not valid JSON object text.");
}

function validateDecisionPayload(
  candidate: unknown,
  legal: LegalActionSet,
  actorStack: number,
): ValidatedDecision {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Decision must be a JSON object.");
  }

  const actionValue = (candidate as Record<string, unknown>).action;
  if (typeof actionValue !== "string" || !ACTIONS.has(actionValue)) {
    throw new Error("Action must be one of fold/check/call/bet/raise/all_in.");
  }

  const amountRaw = (candidate as Record<string, unknown>).amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? Math.floor(amountRaw)
      : 0;

  const tableTalkRaw = (candidate as Record<string, unknown>).tableTalk;
  const tableTalk = typeof tableTalkRaw === "string" ? tableTalkRaw.slice(0, 140) : undefined;

  switch (actionValue) {
    case "fold": {
      if (!legal.canFold) {
        throw new Error("Fold is illegal in this state.");
      }
      return { action: "fold", amount: 0, tableTalk };
    }
    case "check": {
      if (!legal.canCheck) {
        throw new Error("Check is illegal in this state.");
      }
      return { action: "check", amount: 0, tableTalk };
    }
    case "call": {
      if (legal.callAmount <= 0) {
        throw new Error("Call is illegal because there is no amount to call.");
      }
      return { action: "call", amount: legal.callAmount, tableTalk };
    }
    case "all_in": {
      if (!legal.canAllIn || actorStack <= 0) {
        throw new Error("All-in is illegal in this state.");
      }
      return { action: "all_in", amount: actorStack, tableTalk };
    }
    case "bet": {
      if (!legal.canCheck) {
        throw new Error("Bet is illegal when facing a wager. Use raise/call/fold.");
      }
      if (amount < legal.minBet || amount > legal.maxRaiseTo) {
        throw new Error(`Bet amount must be between ${legal.minBet} and ${legal.maxRaiseTo}.`);
      }
      return { action: "bet", amount, tableTalk };
    }
    case "raise": {
      if (legal.callAmount <= 0) {
        throw new Error("Raise is illegal when there is no current wager.");
      }
      if (amount < legal.minRaiseTo || amount > legal.maxRaiseTo) {
        throw new Error(`Raise amount must be between ${legal.minRaiseTo} and ${legal.maxRaiseTo}.`);
      }
      return { action: "raise", amount, tableTalk };
    }
    default:
      throw new Error("Unsupported action.");
  }
}

async function invokeViaProvider({
  provider,
  modelId,
  apiKey,
  systemPrompt,
  userPrompt,
}: {
  provider: Provider;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<InvocationResult> {
  if (provider === Provider.openai) {
    const mod = await import("@langchain/openai");
    const ChatOpenAI = (mod as unknown as { ChatOpenAI: new (...args: unknown[]) => { invoke: (messages: Array<{ role: string; content: string }>) => Promise<{ content?: unknown; text?: string; response_metadata?: unknown; usage_metadata?: unknown }> } }).ChatOpenAI;
    const llm = new ChatOpenAI({ model: modelId, apiKey, temperature: 0 });
    const result = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const rawText =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join("\n")
          : String(result.text ?? "");

    return {
      rawText,
      tokenUsage: (result as { response_metadata?: unknown; usage_metadata?: unknown }).usage_metadata ?? (result as { response_metadata?: { tokenUsage?: unknown } }).response_metadata?.tokenUsage ?? null,
    };
  }

  if (provider === Provider.anthropic) {
    const mod = await import("@langchain/anthropic");
    const ChatAnthropic = (mod as unknown as { ChatAnthropic: new (...args: unknown[]) => { invoke: (messages: Array<{ role: string; content: string }>) => Promise<{ content?: unknown; response_metadata?: unknown; usage_metadata?: unknown }> } }).ChatAnthropic;
    const llm = new ChatAnthropic({ model: modelId, apiKey, temperature: 0 });
    const result = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const rawText =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content
              .map((part) => {
                if (typeof part === "string") {
                  return part;
                }

                if (part && typeof part === "object" && "text" in part) {
                  return String((part as { text?: unknown }).text ?? "");
                }

                return JSON.stringify(part);
              })
              .join("\n")
          : "";

    return {
      rawText,
      tokenUsage:
        (result as { usage_metadata?: unknown }).usage_metadata ??
        (result as { response_metadata?: { usage?: unknown } }).response_metadata?.usage ??
        null,
    };
  }

  if (provider === Provider.google) {
    const mod = await import("@langchain/google-genai");
    const ChatGoogleGenerativeAI = (mod as unknown as { ChatGoogleGenerativeAI: new (...args: unknown[]) => { invoke: (messages: Array<{ role: string; content: string }>) => Promise<{ content?: unknown; usage_metadata?: unknown; response_metadata?: unknown }> } }).ChatGoogleGenerativeAI;

    const llm = new ChatGoogleGenerativeAI({ model: modelId, apiKey, temperature: 0 });
    const result = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const rawText =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content
              .map((part) => {
                if (typeof part === "string") {
                  return part;
                }
                if (part && typeof part === "object" && "text" in part) {
                  return String((part as { text?: unknown }).text ?? "");
                }
                return JSON.stringify(part);
              })
              .join("\n")
          : "";

    return {
      rawText,
      tokenUsage:
        (result as { usage_metadata?: unknown }).usage_metadata ??
        (result as { response_metadata?: { tokenUsage?: unknown } }).response_metadata?.tokenUsage ??
        null,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

function buildPrompts(
  agent: {
    systemPrompt: string;
  },
  context: DecisionContext,
  retryError?: string,
) {
  const systemPrompt = `${agent.systemPrompt}\n\n${RESPONSE_CONTRACT}`;

  const userPrompt = JSON.stringify(
    {
      instruction: "Choose exactly one legal action.",
      retryError,
      context,
    },
    null,
    2,
  );

  return { systemPrompt, userPrompt };
}

function fallbackDecision(legal: LegalActionSet): ValidatedDecision {
  if (legal.canFold) {
    return { action: "fold", amount: 0 };
  }

  if (legal.canCheck) {
    return { action: "check", amount: 0 };
  }

  if (legal.callAmount > 0) {
    return { action: "call", amount: legal.callAmount };
  }

  return { action: "all_in", amount: legal.maxRaiseTo };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "Unknown decision error.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function classifyTransportError(message: string): TransportClassification {
  const lower = message.toLowerCase();

  if (lower.includes("unsupported provider") || lower.includes("api key")) {
    return { category: "provider_config", retryable: false };
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return { category: "provider_timeout", retryable: true };
  }

  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return { category: "provider_rate_limit", retryable: true };
  }

  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("connection") ||
    lower.includes("service unavailable") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return { category: "provider_transport", retryable: true };
  }

  return { category: "unknown", retryable: false };
}

function timeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      reject(new Error(`Provider call timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
}

async function invokeViaProviderWithReliability(params: {
  provider: Provider;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<InvocationResult> {
  let lastErrorMessage = "Provider call failed.";
  let lastCategory: DecisionErrorCategory = "provider_transport";

  for (let attempt = 1; attempt <= MAX_TRANSPORT_ATTEMPTS; attempt += 1) {
    try {
      const invocation = (await Promise.race([
        invokeViaProvider(params),
        timeoutPromise(PROVIDER_TIMEOUT_MS),
      ])) as InvocationResult;

      return invocation;
    } catch (error) {
      const message = normalizeErrorMessage(error);
      const transport = classifyTransportError(message);

      lastCategory = transport.category;
      lastErrorMessage = message;

      if (!transport.retryable || attempt >= MAX_TRANSPORT_ATTEMPTS) {
        throw new Error(`[${transport.category}] ${message}`);
      }

      const multiplier = transport.category === "provider_rate_limit" ? 2.5 : 1.7;
      const backoffMs = Math.min(4_000, Math.round(BASE_BACKOFF_MS * multiplier ** (attempt - 1)));
      await sleep(backoffMs);
    }
  }

  throw new Error(`[${lastCategory}] ${lastErrorMessage}`);
}

function classifyDecisionError(message: string): DecisionErrorCategory {
  const lower = message.toLowerCase();

  if (
    lower.includes("response was not valid json") ||
    lower.includes("unexpected token") ||
    lower.includes("json")
  ) {
    return "invalid_json";
  }

  if (lower.includes("action must be") || lower.includes("decision must be a json object")) {
    return "invalid_schema";
  }

  if (
    lower.includes("illegal") ||
    lower.includes("must be between") ||
    lower.includes("no amount to call") ||
    lower.includes("unsupported action")
  ) {
    return "illegal_action";
  }

  if (lower.includes("provider_timeout")) {
    return "provider_timeout";
  }

  if (lower.includes("provider_rate_limit")) {
    return "provider_rate_limit";
  }

  if (lower.includes("unsupported provider") || lower.includes("api key")) {
    return "provider_config";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("connection") ||
    lower.includes("service unavailable")
  ) {
    return "provider_transport";
  }

  return "unknown";
}

function formatValidationError(message: string): string {
  const category = classifyDecisionError(message);
  return `[${category}] ${message}`;
}

function buildFallbackResolution({
  legal,
  attempts,
  start,
  reason,
}: {
  legal: LegalActionSet;
  attempts: Array<{ rawText: string; validationError: string | null; tokenUsage: unknown }>;
  start: number;
  reason: string;
}): DecisionResolution {
  const fallback = fallbackDecision(legal);

  return {
    decision: fallback,
    requestedActionJson: JSON.stringify({
      action: "forced_fallback",
      reason,
    }),
    resolvedActionJson: JSON.stringify(fallback),
    rawResponse: attempts.map((entry, index) => `attempt_${index + 1}:\n${entry.rawText}`).join("\n\n"),
    validationError:
      attempts[attempts.length - 1]?.validationError ?? formatValidationError("Invalid action output."),
    retried: attempts.length > 1,
    latencyMs: Date.now() - start,
    tokenUsageJson: JSON.stringify(
      attempts.map((entry, index) => ({ attempt: index + 1, tokenUsage: entry.tokenUsage })),
    ),
  };
}

export async function resolveAgentDecision({
  agent,
  seat,
  context,
}: {
  agent: {
    provider: Provider;
    modelId: string;
    systemPrompt: string;
    encryptedKey: string;
    keySalt: string;
    keyIv: string;
  };
  seat: {
    stack: number;
  };
  context: DecisionContext;
}): Promise<DecisionResolution> {
  const apiKey = decryptAgentApiKeyWithSession(
    {
      encryptedKey: agent.encryptedKey,
      keySalt: agent.keySalt,
      keyIv: agent.keyIv,
    },
    getSessionKey(),
  );

  const attempts: Array<{ rawText: string; validationError: string | null; tokenUsage: unknown }> = [];
  const start = Date.now();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryError = attempt === 1 ? attempts[0]?.validationError ?? undefined : undefined;

    const { systemPrompt, userPrompt } = buildPrompts(agent, context, retryError);

    let invocation: InvocationResult;

    try {
      invocation = await invokeViaProviderWithReliability({
        provider: agent.provider,
        modelId: agent.modelId,
        apiKey,
        systemPrompt,
        userPrompt,
      });
    } catch (error) {
      const message = normalizeErrorMessage(error);
      attempts.push({
        rawText: message,
        validationError: formatValidationError(message),
        tokenUsage: null,
      });

      const category = classifyDecisionError(message);
      if (
        category === "provider_timeout" ||
        category === "provider_rate_limit" ||
        category === "provider_transport" ||
        category === "provider_config"
      ) {
        return buildFallbackResolution({
          legal: context.legal,
          attempts,
          start,
          reason: "transport_exhausted",
        });
      }

      continue;
    }

    try {
      const jsonText = extractJsonObject(invocation.rawText);
      const parsed = JSON.parse(jsonText) as unknown;
      const decision = validateDecisionPayload(parsed, context.legal, seat.stack);

      attempts.push({
        rawText: invocation.rawText,
        validationError: null,
        tokenUsage: invocation.tokenUsage,
      });

      return {
        decision,
        requestedActionJson: JSON.stringify(parsed),
        resolvedActionJson: JSON.stringify(decision),
        rawResponse: attempts.map((entry, index) => `attempt_${index + 1}:\n${entry.rawText}`).join("\n\n"),
        validationError: attempts.find((entry) => entry.validationError)?.validationError ?? null,
        retried: attempt > 0,
        latencyMs: Date.now() - start,
        tokenUsageJson: JSON.stringify(
          attempts.map((entry, index) => ({
            attempt: index + 1,
            tokenUsage: entry.tokenUsage,
          })),
        ),
      };
    } catch (error) {
      const message = normalizeErrorMessage(error);
      attempts.push({
        rawText: invocation.rawText,
        validationError: formatValidationError(message),
        tokenUsage: invocation.tokenUsage,
      });
    }
  }

  return buildFallbackResolution({
    legal: context.legal,
    attempts,
    start,
    reason: "invalid_output_exhausted",
  });
}
