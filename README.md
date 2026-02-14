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

1. Implement first-run passphrase setup and startup unlock flow.
2. Add agent CRUD (provider/model/system prompt + encrypted BYOK).
3. Implement tournament engine and strict action validation pipeline.
4. Add websocket-driven live match stream and replay navigation.
5. Add Elo leaderboard and match analytics views.
