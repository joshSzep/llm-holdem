# LLM Hold'em

LLM Hold'em is a local-first fullstack TypeScript application where LLM agents play 6-max Texas Hold'em Sit & Go tournaments against each other.

This repository now includes an initial scaffolded application baseline and detailed specification docs.

## Current Status

### Completed Slices

- Platform baseline: Next.js + TypeScript + Tailwind + custom Node server + native `ws` + Prisma/SQLite.
- Security flow: first-run passphrase setup, startup unlock/lock, encrypted provider key-at-rest storage.
- Agent system: provider/model/system-prompt CRUD with curated provider/model support.
- Match runtime: deterministic seeded SNG execution, persisted timeline/events/actions, pause/resume/step controls.
- Rules accuracy core: multi-street play, showdown settlement, side-pot tier modeling, dead-button handling, heads-up transition handling, odd-chip distribution ordering.
- Replay UX: timeline navigation with table-state rendering and showdown-side-pot visibility.
- Rankings + analytics: Elo leaderboard, rating history, telemetry summaries (latency/retries/invalid actions/token usage), invalid-decision drilldowns, fallback-reason analytics.
- Observability export tools: raw-response inspection/copy, copy-visible set, JSON/CSV export for visible invalid rows.
- Reliability hardening: provider timeout/backoff/retry policy and explicit fallback-reason semantics in action resolution.
- Verification framework: Vitest-based runtime suites (settlement, determinism, rules integration) with structured JSON reports.

### Active Focus

- Consolidating docs/roadmap and tightening production-readiness priorities.

## Documentation Index

- [Decision Log](docs/decision-log.md) — complete list of decisions made, rationale, and implementation impact.
- [Architecture Specification](docs/architecture-spec.md) — system design, data flow, modules, and runtime shape.
- [Game Engine Specification](docs/game-engine-spec.md) — tournament rules, state machine, replay model, and action validation contract.
- [Security & Secrets Specification](docs/security-secrets-spec.md) — encryption at rest, passphrase lifecycle, and threat boundaries.
- [Roadmap](docs/implementation-roadmap.md) — phased build plan derived from finalized decisions.
- [Justfile Commands](docs/justfile.md) — command runner reference for local workflows.
- [Agent Contract](AGENTS.md) — LLM agent I/O, prompt contract, JSON schema, and retry behavior.

## Product Summary

LLM Hold'em v1 is a local-only, single-user platform with:

- Next.js fullstack TypeScript app (single project at repository root)
- Prisma + SQLite persistence
- Native WebSockets (`ws`) through a custom Node server
- 6-max SNG tournament simulation with full rules accuracy
- Deterministic replay via persisted RNG seed
- LLM agent creator using provider/model + system prompt
- BYOK (bring-your-own-key) per agent for OpenAI, Anthropic, and Google
- Encrypted API keys at rest using a local master passphrase
- In-browser first-run passphrase setup and startup unlock flow

## Important Constraints

- All implementation should align with the documentation in `docs/` and `AGENTS.md`.
- The curated model list is fixed in code/config for v1.

## Quick Start

1. Install dependencies:

	```bash
	pnpm install
	```

2. Ensure env exists:

	```bash
	cp -n .env.example .env
	```

3. Apply Prisma migration (first run):

	```bash
	pnpm prisma migrate dev --name init
	```

	This creates a local SQLite file at `prisma/dev.db`. Database files are intentionally gitignored and should not be committed.

4. Run development server (custom Node + Next + ws):

	```bash
	pnpm dev
	```

5. Open app and websocket endpoint:

- App: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

6. Run hand-engine settlement verification:

	```bash
	pnpm verify:engine
	```

	This runs the dedicated Vitest settlement suite for side-pot/showdown invariants and chip conservation.

7. Run deterministic replay regression verification:

	```bash
	pnpm verify:determinism
	```

	This runs the Vitest determinism suite and fails if timeline fingerprints drift between runs.

8. Run full local CI-style verification:

	```bash
	pnpm verify:all
	```

	This runs engine verification, deterministic replay regression, rules-integration verification, lint, and build in one command.

9. Run rules integration verification directly:

	```bash
	pnpm verify:rules
	```

	This runs the Vitest rules suite for multiway opening order, dead-button behavior, and heads-up transitions.

10. CI automation:

	A GitHub Actions workflow at `.github/workflows/verify.yml` runs `pnpm verify:all` on pushes to `main` and on pull requests.

## Using `just`

This repository includes a root `justfile` for common workflows.

1. Install `just` (macOS):

	```bash
	brew install just
	```

2. List available recipes:

	```bash
	just
	```

3. Typical workflow:

	```bash
	just setup
	just dev
	```

See [docs/justfile.md](docs/justfile.md) for full recipe documentation.

## Next Build Steps

1. Deepen replay/state regression assertions (schema stability + critical event invariants).
2. Externalize provider reliability policy (timeouts/retries/backoff) into configurable runtime settings.
3. Extend analytics to trend/time-window and per-agent/provider pivots.
4. Strengthen operational hardening (required checks/branch protection + redaction review).

## Bootstrap Security Flow

- On first launch, `/` shows a setup screen to create and confirm the master passphrase.
- On subsequent launches (or after locking), `/` shows an unlock screen.
- Unlock state is held in server memory for the process lifetime.
- API endpoints:
	- `GET /api/bootstrap/status`
	- `POST /api/bootstrap/setup`
	- `POST /api/bootstrap/unlock`
	- `POST /api/bootstrap/lock`
