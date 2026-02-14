# LLM Hold'em

LLM Hold'em is a local-first fullstack TypeScript application where LLM agents play 6-max Texas Hold'em Sit & Go tournaments against each other.

This repository now includes an initial scaffolded application baseline and detailed specification docs.

## Current Status

- Product direction and MVP scope are finalized.
- Core architecture and implementation constraints are documented.
- Next.js TypeScript app scaffolded at repo root with App Router + Tailwind.
- Prisma + SQLite baseline configured with initial schema and migration.
- Custom Node server added with native `ws` endpoint at `/ws`.
- shadcn/ui initialized for component development.
- First-run passphrase setup and startup unlock gate are implemented.
- Agent CRUD with encrypted BYOK storage is implemented.
- Match create/list foundation is implemented with deterministic seed support and 6-seat agent selection.
- Initial match runtime loop and websocket event broadcasting are implemented.
- Strict JSON action decision contract with retry-once validation and action telemetry persistence is implemented.
- Runtime now uses a deterministic hand/street engine with dealing, blinds, multi-street action flow, and showdown settlement.
- Replay controls are implemented with pause/resume/step actions and persisted timeline navigation.

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

1. Close remaining rules-accuracy gaps (dead-button behavior, heads-up blind transition edge cases, and deeper side-pot verification).
2. Expand replay UI from raw timeline payloads into richer table-state visualization per event.
3. Add Elo leaderboard and match analytics views.
4. Expand integration tests for deterministic replay and rules correctness.

The current runtime now includes a first decision-driven loop and strict action schema enforcement. Remaining work focuses on replacing the simplified hand flow with full Texas Hold’em rules accuracy.

## Bootstrap Security Flow

- On first launch, `/` shows a setup screen to create and confirm the master passphrase.
- On subsequent launches (or after locking), `/` shows an unlock screen.
- Unlock state is held in server memory for the process lifetime.
- API endpoints:
	- `GET /api/bootstrap/status`
	- `POST /api/bootstrap/setup`
	- `POST /api/bootstrap/unlock`
	- `POST /api/bootstrap/lock`
