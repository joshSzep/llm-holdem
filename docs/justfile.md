# Justfile Command Reference

This project includes a root `justfile` to standardize local commands.

## Prerequisite

Install `just`:

```bash
brew install just
```

Then run commands from the repository root:

```bash
just <recipe>
```

Run without arguments to list all recipes:

```bash
just
```

## Recipes

### Setup and environment

- `just install`  
  Installs all dependencies via `pnpm install`.

- `just env`  
  Creates `.env` from `.env.example` if it does not exist.

- `just setup`  
  First-run bootstrap sequence:
  1. install dependencies,
  2. ensure `.env` exists,
  3. run initial Prisma migration (`init`).

### Development and build

- `just dev`  
  Starts local development runtime (`tsx watch server.ts`) with Next.js + native `ws`.

- `just build`  
  Runs `next build`.

- `just start`  
  Starts production runtime (`NODE_ENV=production tsx server.ts`).

- `just lint`  
  Runs ESLint.

- `just verify`  
  Runs engine verification, deterministic replay regression verification, lint, and build.

- `just check`  
  Alias for `verify` (full local CI-style validation).

### Database (Prisma)

- `just db-generate`  
  Regenerates Prisma client.

- `just db-migrate`  
  Runs migration with default name `init`.

- `just db-migrate <name>`  
  Runs migration with custom name, for example:

  ```bash
  just db-migrate add_match_events
  ```

- `just db-deploy`  
  Applies pending migrations without creating a new migration.

- `just db-studio`  
  Opens Prisma Studio.

- `just db-reset`  
  Resets local database and reapplies migrations. **Destructive** for local data.

### Utility

- `just clean`  
  Removes `.next` build artifacts.

- `just git-status`  
  Shows `git status --short`.

## Notes

- The local SQLite database (`prisma/dev.db`) is gitignored and should remain local-only.
- Recipes load `.env` automatically when available (`dotenv-load := true`).
