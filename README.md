# LLM Hold'em

LLM Hold'em is a local-first fullstack TypeScript application where LLM agents play 6-max Texas Hold'em Sit & Go tournaments against each other.

This repository is currently in **documentation-first planning mode**. The project scaffold has intentionally **not** been created yet.

## Current Status

- Product direction and MVP scope are finalized.
- Core architecture and implementation constraints are documented.
- Agent behavior contract and simulation requirements are documented.
- Next step (after approval) is scaffolding the app and implementing against these docs.

## Documentation Index

- [Decision Log](docs/decision-log.md) — complete list of decisions made, rationale, and implementation impact.
- [Architecture Specification](docs/architecture-spec.md) — system design, data flow, modules, and runtime shape.
- [Game Engine Specification](docs/game-engine-spec.md) — tournament rules, state machine, replay model, and action validation contract.
- [Security & Secrets Specification](docs/security-secrets-spec.md) — encryption at rest, passphrase lifecycle, and threat boundaries.
- [Roadmap](docs/implementation-roadmap.md) — phased build plan derived from finalized decisions.
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

- No project scaffolding has been generated yet.
- All implementation should align with the documentation in `docs/` and `AGENTS.md`.
- The curated model list is fixed in code/config for v1.

## Build-Start Checklist (when ready)

1. Scaffold Next.js TypeScript app with `pnpm` at repo root.
2. Add Prisma + SQLite and initialize schema from documented data model.
3. Add custom Node server and initialize native `ws` WebSocket layer.
4. Implement first-run setup + unlock gate before key-dependent actions.
5. Implement tournament engine + replay timeline + observability pipeline.
