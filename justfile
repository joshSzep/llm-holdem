set shell := ["bash", "-cu"]
set dotenv-load := true

# Show available recipes
@default:
  just --list

# Install dependencies
install:
  pnpm install

# Create .env from template if missing
env:
  cp -n .env.example .env || true

# Generate Prisma client
db-generate:
  pnpm prisma generate

# Run Prisma migration with a configurable name
# Example: just db-migrate init_schema
db-migrate name="init":
  pnpm prisma migrate dev --name {{name}}

# Apply pending migrations (deployment-style)
db-deploy:
  pnpm prisma migrate deploy

# Open Prisma Studio
db-studio:
  pnpm prisma studio

# Reset local database (destructive)
db-reset:
  pnpm prisma migrate reset --force

# Full local bootstrap for first run
setup:
  just install
  just env
  just db-migrate init

# Start local dev server (custom Node + Next + ws)
dev:
  pnpm dev

# Build production bundle
build:
  pnpm build

# Start production server from built app
start:
  pnpm start

# Run linter
lint:
  pnpm lint

# Run quality checks
check:
  just lint
  just build

# Remove local build artifacts
clean:
  rm -rf .next

# Show concise git status
git-status:
  git status --short
