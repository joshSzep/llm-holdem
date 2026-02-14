# AGENTS.md

## Purpose

This document defines the behavior contract for poker-playing LLM agents in LLM Hold'em. It is the source of truth for how agent decisions are requested, validated, retried, and persisted.

The system is designed for:

- deterministic tournament simulation,
- strict legal-action enforcement,
- rich post-match analysis,
- provider-agnostic execution through LangChain.

## Agent Entity (v1)

Each agent represents one poker player profile with:

- display name,
- provider (`openai`, `anthropic`, `google`),
- model id (selected from curated provider list),
- encrypted provider API key,
- system prompt,
- metadata (created timestamp, updated timestamp).

### Non-goals in v1

- No human player seats.
- No dynamic runtime hyperparameter tuning.
- No per-agent temperature/top_p/max-token configuration.

## Decision Contract

On each decision point, the engine sends the active agent:

- all relevant public game state up to that point,
- the player’s private hole cards,
- legal action set and legal raise bounds,
- tournament context (blind level, stacks, positions, players remaining),
- strict output instructions requiring a structured JSON response.

### Required Output Format

The model must return exactly one JSON object:

```json
{
  "action": "fold | check | call | bet | raise | all_in",
  "amount": 0,
  "tableTalk": "optional short string"
}
```

#### Field semantics

- `action`: required enum.
- `amount`: required for `bet`/`raise`; ignored or `0` otherwise.
- `tableTalk`: optional public short text to display in logs/UI.

### Strict Validation

The engine validates:

1. JSON parse success.
2. `action` in enum.
3. action legality in current state.
4. numeric bounds for amount-based actions.
5. min/max raise rules.
6. stack constraints and all-in semantics.

If invalid:

- retry once with an error explanation that states what was invalid/illegal,
- if retry still invalid, force-fold the agent.

This behavior is fixed for v1.

## Prompting Strategy

Each model call includes:

1. System message = agent’s stored system prompt + output contract appendix.
2. User message = serialized decision context with legal actions and constraints.

The message must never imply hidden information from other players’ hole cards.

## Public Information Boundary

The decision payload may include only:

- visible betting history,
- board cards,
- blind/position information,
- chip stacks and active statuses,
- pot and side pot public structure,
- showdown outcomes of completed hands.

The payload must exclude:

- folded players’ unseen cards,
- undealt cards,
- hidden RNG internals.

## Provider Abstraction

Providers are selected via LangChain adapters with a common internal interface.

Supported providers in v1:

- OpenAI
- Anthropic
- Google

Model options are from a hardcoded curated list in config.

## Raw Output Retention

All raw model responses are persisted in match telemetry for later analysis.

This includes:

- original raw response text,
- parsed JSON decision (if parse succeeded),
- validation outcome,
- retry metadata,
- latency and token usage (when available).

## Determinism and Replay

- The tournament simulation itself is deterministic under a persisted seed.
- LLM output is not guaranteed deterministic unless provider/model settings produce deterministic behavior.
- Replay mode uses recorded timeline events and does not re-query models.

## Error Handling

On provider call failure:

- record error in telemetry,
- apply retry policy only for invalid-action format/legality (not arbitrary transport errors unless explicitly configured),
- fail action with forced fold if the decision cannot be resolved safely.

## Security Requirements

- API keys are encrypted at rest in SQLite.
- Decryption requires startup unlock using master passphrase.
- Plaintext keys exist only in server memory for active execution.

## Future Extension Hooks

Designed extension points:

- swap rating system implementation,
- extend action schema for advanced behaviors,
- add per-agent inference controls,
- add non-LLM player types.
