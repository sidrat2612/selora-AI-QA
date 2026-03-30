# Contributing to Selora

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable && corepack prepare pnpm@10.7.0 --activate`)
- Docker & Docker Compose
- PostgreSQL 16 (via Docker or local)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/sidrat2612/selora-AI-QA.git
cd selora-AI-QA

# Install dependencies
pnpm install

# Copy environment config
cp .env.local.example .env.local

# Start infrastructure
docker compose up postgres redis minio mailpit -d

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate:dev

# Seed database
pnpm db:seed

# Start all services
pnpm dev
```

### Services

| Service | URL | Description |
|---|---|---|
| Core App | http://localhost:3000 | Tenant-facing SPA |
| Console App | http://localhost:3001 | Platform admin SPA |
| API | http://localhost:4000 | REST API |
| Mailpit | http://localhost:8025 | Email testing UI |
| MinIO Console | http://localhost:9001 | Object storage UI |

### Seed Accounts

| Email | Password | Role |
|---|---|---|
| `admin@selora.local` | `admin123` | Workspace Admin |
| `operator@selora.local` | `operator123` | Operator |
| `viewer@selora.local` | `viewer123` | Viewer |
| `platform@selora.local` | `platform123` | Platform Admin (Console) |

## Project Structure

```
selora/
├── apps/
│   ├── api/                  # NestJS REST API
│   ├── selora-core/          # Tenant React SPA
│   ├── selora-console/       # Admin React SPA
│   ├── worker-execution/     # Playwright test runner
│   ├── worker-ingestion/     # Recording ingestion
│   └── worker-ai-repair/     # AI repair worker
├── packages/
│   ├── database/             # Prisma schema & migrations
│   ├── auth/                 # Authentication
│   ├── queue/                # BullMQ/SQS abstraction
│   ├── storage/              # S3/MinIO abstraction
│   ├── executor/             # Playwright runner
│   └── ...                   # Other shared packages
└── infrastructure/           # Docker & Terraform
```

## Development Workflow

### Branching

- `main` — stable, always passes CI
- Feature branches: `feat/short-description`
- Bug fixes: `fix/short-description`

### Before Submitting a PR

```bash
# Type-check everything
pnpm turbo typecheck

# Lint
pnpm lint

# Format
pnpm format

# Build to catch errors
pnpm turbo build
```

### Database Changes

When modifying the Prisma schema:

```bash
# Create a migration
pnpm --filter @selora/database db:migrate:dev -- --name your_migration_name

# Regenerate the client
pnpm db:generate

# Update seed data if needed
pnpm db:seed
```

### Adding a New Package

1. Create directory under `packages/`
2. Add `package.json` with `@selora/` scope
3. Add to `pnpm-workspace.yaml` if needed
4. Add `typecheck` and `build` scripts
5. Register in `turbo.json` pipeline if it has build dependencies

## Code Style

- **TypeScript** everywhere — no `any` unless absolutely necessary
- **Tailwind CSS 4** with semantic theme tokens (`text-foreground`, `bg-primary`, etc.)
- **shadcn/ui** components — don't reinvent primitives
- **Functional React** — hooks, no class components
- **NestJS conventions** — modules, controllers, services, guards

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add webhook retry mechanism
fix(core): resolve flaky test status badge rendering
docs: update deployment guide for ECS
chore(deps): bump prisma to 6.20
```

## Reporting Issues

Use the [GitHub issue templates](https://github.com/sidrat2612/selora-AI-QA/issues/new/choose):
- **Bug Report** — for unexpected behavior
- **Feature Request** — for new functionality

## Questions?

Open a [GitHub Discussion](https://github.com/sidrat2612/selora-AI-QA/discussions) or file an issue.
