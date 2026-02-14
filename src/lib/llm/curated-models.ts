export const CURATED_MODELS = {
  openai: [
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.2-codex",
    "gpt-5.1",
    "gpt-5.1-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
    "gpt-5",
    "gpt-5-pro",
    "gpt-5-codex",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.2-chat-latest",
    "gpt-5.1-chat-latest",
    "gpt-5-chat-latest",
    "chatgpt-4o-latest",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.5-preview",
    "o4-mini",
    "o4-mini-deep-research",
    "o3",
    "o3-mini",
    "o3-pro",
    "o3-deep-research",
    "o1",
    "o1-pro",
    "o1-mini",
    "o1-preview",
  ],
  anthropic: [
    "claude-opus-4-6",
    "claude-opus-4-5-20251101",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-2.0",
    "claude-2.1",
  ],
  google: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-exp",
  ],
} as const;

export type SupportedProvider = keyof typeof CURATED_MODELS;

export function isSupportedProvider(value: string): value is SupportedProvider {
  return value in CURATED_MODELS;
}

export function isCuratedModel(provider: SupportedProvider, modelId: string): boolean {
  return (CURATED_MODELS[provider] as readonly string[]).includes(modelId);
}

export function getDefaultModel(provider: SupportedProvider): string {
  return CURATED_MODELS[provider][0];
}
