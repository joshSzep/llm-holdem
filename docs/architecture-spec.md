# Architecture Specification

## Purpose

Define the technical architecture for LLM Hold'em v1 based on finalized product decisions.

## 1. High-Level Architecture

Single-process local Node runtime hosting:

- Next.js application (App Router)
- Route Handlers for REST-like API endpoints
- native WebSocket server (`ws`) for live match streaming
- simulation engine workers (in-process task queue)
- Prisma client connected to SQLite database

This is a local-first architecture optimized for development simplicity and deterministic reproducibility.

## 2. Runtime Topology

### 2.1 Process model

One Node process includes:

1. HTTP server for Next.js pages + API routes
2. WebSocket server mounted on same HTTP server
3. Match runner service managing async tournament execution
4. In-memory unlock state for master passphrase key derivation

### 2.2 Why custom server

Native `ws` support with tight lifecycle control and room/channel mapping is easiest via explicit Node server bootstrap (`server.ts`).

## 3. Core Modules

### 3.1 `core/game-engine`

Responsibilities:

- deterministic shuffle and deal from saved seed,
- action order and betting round state machine,
- legal action computation,
- full all-in/side-pot/pot-settlement handling,
- elimination, table continuation, and winner resolution,
- hand and tournament timeline event emission.

### 3.2 `core/agent-runtime`

Responsibilities:

- build decision prompt payload,
- invoke provider via LangChain adapter,
- validate JSON action output,
- execute retry-once policy for invalid actions,
- return resolved legal action or force-fold fallback,
- emit telemetry events.

### 3.3 `core/providers`

Responsibilities:

- provider abstraction contracts,
- OpenAI/Anthropic/Google client wrappers,
- model id validation against curated list,
- standardized response envelope and usage metrics extraction.

### 3.4 `core/security`

Responsibilities:

- master passphrase setup and verifier flow,
- key derivation,
- encryption/decryption helpers,
- startup unlock gate for sensitive operations.

### 3.5 `core/rating`

Responsibilities:

- Elo update on tournament completion based on placements,
- leaderboard aggregation,
- rating history persistence.

### 3.6 `core/observability`

Responsibilities:

- structured event logging,
- persisted metrics snapshots,
- per-match analytics materialization.

## 4. Data Flow (Match Lifecycle)

1. User creates/selects 6 agents.
2. User starts tournament with optional playback speed and deterministic seed.
3. Match runner creates tournament record + initial state.
4. For each action point:
   - engine computes legal actions,
   - agent runtime prompts active LLM,
   - validator resolves action (retry once if needed),
   - engine applies action and emits events,
   - websocket broadcasts incremental updates.
5. On hand completion: settle pots, update stacks, advance button/blinds.
6. On elimination/winner: finalize tournament record, compute Elo updates.
7. Persist full logs and analytics.

## 5. WebSocket Contract (Conceptual)

Each match has a logical room/channel keyed by `matchId`.

Event families:

- `match.started`
- `hand.started`
- `action.requested`
- `action.resolved`
- `state.updated`
- `hand.completed`
- `player.eliminated`
- `blind.level.changed`
- `match.completed`
- `match.paused`
- `match.resumed`

Replay UI consumes timeline snapshots/events and allows backward/forward navigation through already-recorded events.

## 6. API Surface (Route Handlers)

Expected route groups:

- `/api/bootstrap/*` — app init/setup/unlock status
- `/api/agents/*` — CRUD for agents and key management
- `/api/matches/*` — create/start/pause/resume/step and fetch state
- `/api/replay/*` — timeline retrieval/snapshot indexing
- `/api/leaderboard/*` — ranking data and histories
- `/api/analytics/*` — per-match telemetry summaries

## 7. Frontend Surfaces

### 7.1 Setup/Unlock flow

- first-run create passphrase + confirm
- startup unlock screen until unlocked

### 7.2 Agent Creator

- provider dropdown
- model dropdown (curated hardcoded list)
- system prompt editor
- API key input (encrypted before persistence)

### 7.3 Match Control

- create 6-seat table from agents
- start tournament
- controls: run, pause, step forward, step backward (replay-only), speed slider

### 7.4 Live Table View

- board cards, pots, stacks, positions, active player
- action feed with parsed output and optional table talk

### 7.5 History + Replay

- list prior matches
- open timeline and scrub through event index

### 7.6 Leaderboard + Analytics

- Elo ranking table
- per-agent trends
- per-match metrics (latency, retries, invalid actions, token usage)

## 8. Determinism Strategy

Persist per-match seed and use seeded RNG for all game randomness:

- deck shuffling,
- dealer/button initializations,
- any random tie-breakers (if applicable).

Replay mode never recomputes stochastic events from scratch during UI navigation; it reads saved timeline events/snapshots.

## 9. Performance and Safety Constraints

- long-running match execution must not block websocket heartbeat.
- model API errors must degrade safely (retry policy/fold fallback).
- decrypted API keys must remain in memory only and never be logged.
- full raw model responses may contain sensitive text and should be flagged in UI/admin contexts.

## 10. Testing Strategy (v1)

Priority tests:

1. poker rules correctness suite (including side pots and split pots),
2. deterministic seed reproducibility tests,
3. action schema validator + retry behavior tests,
4. encryption/decryption and unlock flow tests,
5. Elo update correctness tests,
6. WebSocket event sequencing tests.

## 11. Migration and Extensibility

Architecture should preserve clean seams for:

- future multi-user auth/tenancy,
- cloud deployment variants,
- alternate rating systems,
- broader model/provider support,
- optional human seat support.
