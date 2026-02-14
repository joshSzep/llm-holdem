# Decision Log

This file captures all product and technical decisions finalized before scaffolding.

## 1) Product Scope

### 1.1 MVP level

**Decision:** Full Platform MVP

**Meaning:** v1 includes full user-facing product surfaces (agent management, match execution/viewing, history, leaderboard, and observability), while still local-first and single-user.

**Impact:** architecture should avoid throwaway prototypes and provide clean domain boundaries from day one.

### 1.2 User model

**Decision:** Single-user local app (no auth)

**Meaning:** no account system, no multi-user tenancy, no remote auth providers.

**Impact:** simpler data model and routes; all data belongs to one local operator context.

## 2) Runtime and Stack

### 2.1 Framework

**Decision:** Next.js fullstack TypeScript

### 2.2 Repository layout

**Decision:** Single project at repo root

### 2.3 Package manager

**Decision:** `pnpm`

### 2.4 API layer style

**Decision:** Next.js Route Handlers only

**Impact:** avoid tRPC/OpenAPI setup in v1; keep server APIs directly in `app/api/*`.

### 2.5 UI stack

**Decision:** Tailwind + shadcn/ui

## 3) Data and Persistence

### 3.1 Database

**Decision:** SQLite + Prisma

**Impact:** local file DB; schema-first modeling; simple local portability.

### 3.2 Secret storage

**Decision:** API keys encrypted at rest in SQLite using local master passphrase

### 3.3 Unlock UX

**Decision:** In-browser unlock screen at app startup

### 3.4 First-run passphrase setup

**Decision:** First-run setup screen where user creates + confirms passphrase

**Security note:** store verifier/salt metadata; do not store passphrase.

## 4) Real-Time and Server Runtime

### 4.1 Real-time channel

**Decision:** WebSockets

### 4.2 WS implementation

**Decision:** Native `ws`

### 4.3 Next runtime shape

**Decision:** Custom Node server (`server.ts`) to host Next + ws

### 4.4 Deployment assumption

**Decision:** Local development only

## 5) Poker Format and Rules

### 5.1 Game mode

**Decision:** Single-table tournament only (SNG)

### 5.2 Table size

**Decision:** 6-max

### 5.3 Player types

**Decision:** LLM-only tables

### 5.4 Starting stacks

**Decision:** 2000 chips per seat

### 5.5 Rules fidelity

**Decision:** Full tournament rules accuracy in v1

**Includes:** side pots, all-ins, ties/split pots, dead-button handling, heads-up blind/button transition.

### 5.6 Payout handling

**Decision:** No chips-to-cash payouts in v1 (rankings only)

## 6) Blind Structure

### 6.1 Level mode

**Decision:** Fixed preset

### 6.2 Initial blinds / pacing

**Decision:** 10/20 start, level increase every 10 hands

### 6.3 Progression style

**Decision:** standard doubling-ish progression

**Implication:** use a predefined level list with smooth increments (not strict powers of two).

## 7) Agent Modeling and LLM Interface

### 7.1 Provider model

**Decision:** BYOK per agent via LangChain abstraction

**Providers:** OpenAI, Anthropic, Google

### 7.2 Agent creation controls

**Decision:** Expose only model + system prompt in v1

### 7.3 Model selection UX

**Decision:** Curated dropdown

### 7.4 Curated list storage

**Decision:** Hardcoded list in code/config

### 7.5 Decision output format

**Decision:** Structured JSON action schema

### 7.6 Illegal/invalid action policy

**Decision:** Retry once with explanation, then force-fold if still invalid

### 7.7 Raw output retention

**Decision:** Store full raw model responses for analysis

## 8) Match Execution and Replay UX

### 8.1 Execution mode

**Decision:** Support both auto-run and controlled stepping

### 8.2 Backward stepping behavior

**Decision:** Replay navigation only (no rollback/re-sim divergence)

### 8.3 Viewing speed

**Decision:** Adjustable speed slider

### 8.4 Reproducibility

**Decision:** deterministic/reproducible with saved RNG seed

## 9) Ranking and Analytics

### 9.1 Leaderboard system

**Decision:** Elo rating based on finish positions

### 9.2 Observability scope

**Decision:** middle ground: structured logs persisted in SQLite + per-match analytics UI

**Required analytics:** latency, retries, invalid-action count, token usage.

## 10) Curated Model List (Approved)

The following exact list was approved for v1 curation.

### OpenAI

- gpt-5.2
- gpt-5.2-pro
- gpt-5.2-codex
- gpt-5.1
- gpt-5.1-codex
- gpt-5.1-codex-max
- gpt-5.1-codex-mini
- gpt-5
- gpt-5-pro
- gpt-5-codex
- gpt-5-mini
- gpt-5-nano
- gpt-5.2-chat-latest
- gpt-5.1-chat-latest
- gpt-5-chat-latest
- chatgpt-4o-latest
- gpt-4.1
- gpt-4.1-mini
- gpt-4.1-nano
- gpt-4o
- gpt-4o-mini
- gpt-4.5-preview
- o4-mini
- o4-mini-deep-research
- o3
- o3-mini
- o3-pro
- o3-deep-research
- o1
- o1-pro
- o1-mini
- o1-preview

### Anthropic

- claude-opus-4-6
- claude-opus-4-5-20251101
- claude-opus-4-1-20250805
- claude-opus-4-20250514
- claude-sonnet-4-5
- claude-sonnet-4-5-20250929
- claude-sonnet-4-20250514
- claude-haiku-4-5
- claude-haiku-4-5-20251001
- claude-3-7-sonnet-20250219
- claude-3-5-sonnet-20240620
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-haiku-20240307
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-2.0
- claude-2.1

### Google

- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite
- gemini-2.0-flash
- gemini-2.0-flash-lite
- gemini-2.0-flash-exp

## 11) Deferred Items (Not yet specified)

These are not ambiguities in direction, but implementation details to finalize during build:

- exact blind level numeric list for “standard doubling-ish” progression,
- exact Elo multiplayer update formula (pairwise vs field-based variant),
- concrete telemetry schema granularity beyond minimum required metrics,
- UI layout specifics for match table and analytics dashboard.

These can be chosen during implementation as long as they remain consistent with decisions above.
