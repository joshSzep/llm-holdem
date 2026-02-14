# Implementation Roadmap

This roadmap converts finalized decisions into build phases without scaffolding yet.

## Phase 0 — Scaffold and Baseline

Goals:

- create Next.js TypeScript project at repo root using `pnpm`,
- install Tailwind + shadcn/ui,
- configure Prisma + SQLite,
- add custom Node server bootstrap with native `ws`.

Deliverables:

- runnable app shell,
- database connection and initial migration,
- websocket connectivity smoke test.

## Phase 1 — Core Domain and Persistence

Goals:

- define Prisma schema for agents, matches, hands, actions, events, ratings, logs,
- add repositories/services for CRUD and event persistence,
- hardcode curated provider/model config.

Deliverables:

- agent storage and retrieval,
- match metadata records,
- timeline/event persistence primitives.

## Phase 2 — Security and Unlock Flow

Goals:

- implement first-run passphrase setup screen,
- implement startup unlock gate,
- implement encryption/decryption helpers for provider keys,
- enforce unlocked requirement on key-dependent endpoints.

Deliverables:

- locked/unlocked state UX,
- encrypted key CRUD,
- verifier-based startup logic.

## Phase 3 — Agent Runtime and Provider Adapters

Goals:

- build LangChain-backed provider adapters for OpenAI/Anthropic/Google,
- implement agent decision prompt builder,
- implement strict JSON schema validator,
- implement retry-once invalid-action policy.

Deliverables:

- production-ready action-resolution service,
- persisted raw model responses,
- per-action latency/token/retry telemetry.

## Phase 4 — Tournament Engine

Goals:

- implement full 6-max SNG rules engine with correctness focus,
- support side pots, ties/splits, dead button, heads-up transition,
- support fixed blind progression every 10 hands,
- persist deterministic seed and full event timeline.

Deliverables:

- end-to-end tournament simulation,
- reproducible deterministic runs,
- complete event stream for replay.

## Phase 5 — Real-Time UX + Replay Controls

Goals:

- build match table UI,
- wire websocket live updates,
- add run/pause/step controls,
- add replay index navigation (forward/backward),
- add adjustable speed slider.

Deliverables:

- watchable live games,
- replay exploration with backward navigation,
- no rollback branching.

## Phase 6 — Leaderboard and Observability

Goals:

- implement Elo updates from final placements,
- build leaderboard UI,
- expose per-match analytics pages,
- persist structured logs in SQLite.

Deliverables:

- ranking views and rating history,
- analytics metrics for latency/retries/invalid actions/token usage.

## Phase 7 — Validation and Hardening

Goals:

- add targeted tests for rules correctness and determinism,
- add tests for unlock/encryption flow,
- add websocket event-order tests,
- validate no secret leakage in logs/responses.

Deliverables:

- stable local MVP,
- documented known limitations,
- readiness for iterative feature expansion.

## Suggested Initial Work Breakdown (first build week)

1. Scaffold + Prisma + custom server
2. Passphrase setup/unlock + encrypted key storage
3. Agent CRUD + curated model config
4. Skeleton tournament event pipeline
5. WebSocket streaming and basic match viewer

## Definition of Done (MVP)

MVP is complete when a user can:

- set up and unlock the app,
- create six LLM agents with provider/model/system prompt and encrypted keys,
- run a full SNG with full rules accuracy,
- watch live updates over WebSockets,
- pause and replay the timeline backward/forward,
- inspect logs/raw outputs/analytics,
- view Elo leaderboard updates after matches.
