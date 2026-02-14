# Implementation Roadmap

This roadmap is now a status-oriented view of what is complete vs what remains.

## Status Snapshot (February 2026)

### Completed Foundation

- Next.js TypeScript app scaffolded at repository root with Tailwind and custom Node server.
- Prisma + SQLite persistence and baseline domain modeling.
- Native websocket event transport for live/replay updates.
- Security unlock flow with encrypted provider key storage.
- Agent CRUD with curated provider/model selection.

### Completed Runtime + Rules Core

- Deterministic match execution from persisted seeds.
- Persisted timeline/events/actions for replay and analysis.
- Strict decision contract with validation/retry/fallback telemetry.
- Side-pot-aware showdown settlement and payout invariants.
- Dead-button handling (3+ handed) and heads-up transition behavior.
- Replay controls (pause/resume/step) and table-state visualization.

### Completed Product Surfaces

- Leaderboard with Elo updates and rating history.
- Analytics overview for latency/retries/invalid actions/token usage.
- Invalid-decision drilldown with category filtering.
- Raw-response inspection/copy/export (JSON + CSV).
- Fallback reason analytics mix.

### Completed Verification Infrastructure

- Formal Vitest runtime suites:
  - settlement invariants,
  - deterministic replay regression,
  - rules integration scenarios.
- Unified verification flow via `pnpm verify:all`.
- CI workflow running verification on push/PR.

## Remaining Roadmap Tracks

## 1) Replay/State Regression Depth

Goal:
- move beyond fingerprint checks to explicit schema + invariant assertions on timeline payloads.

Planned outcomes:
- stronger drift detection against payload evolution,
- clearer failure diagnostics per event class.

## 2) Reliability Policy Configurability

Goal:
- externalize provider timeout/retry/backoff policies into configurable runtime settings.

Planned outcomes:
- per-provider tuning without code edits,
- safer operational controls for local and CI runs.

## 3) Analytics Productization

Goal:
- add trend/time-window analysis and richer pivots (agent/provider/model/fallback reason).

Planned outcomes:
- better comparative diagnostics over time,
- easier model/provider quality analysis.

## 4) Operational Hardening

Goal:
- finalize required checks/branch protection guidance and redaction posture review.

Planned outcomes:
- clearer production-readiness checklist,
- reduced risk around secrets/error exposure.

## 5) Documentation Consolidation

Goal:
- keep `README.md`, architecture docs, and this roadmap synchronized with completed slices.

Planned outcomes:
- lower maintenance overhead,
- clearer handoff status for future contributors.

## Definition of Done (Current MVP Baseline)

The current baseline is considered complete for local MVP when a user can:

- unlock the app and manage encrypted agents,
- run deterministic 6-max SNG matches,
- observe live/replay state transitions,
- inspect leaderboard + analytics + telemetry drilldowns,
- validate core runtime correctness through `pnpm verify:all`.
