# Selora

**AI-Powered QA Automation Platform**

Selora ingests Playwright browser recordings, uses AI to convert them into structured test definitions, generates executable Playwright tests, and automatically repairs failures — with full visibility into what was generated, what changed, and why.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 6, React Router 7, TanStack Query, shadcn/ui, Tailwind CSS 4, Recharts |
| **Backend** | NestJS 11, Prisma 6, PostgreSQL 16 |
| **Workers** | BullMQ (dev) / SQS (prod), Redis 7 |
| **Storage** | S3-compatible (MinIO for local dev) |
| **Infra** | Docker Compose, Terraform (AWS), CloudFront, App Runner, ECS Fargate |
| **Build** | pnpm 10 workspaces, Turborepo, TypeScript 5.7 |

## Features

- **Recording-first workflow** — Upload Playwright Codegen recordings; AI handles the rest
- **AI test generation** — Recordings → versioned canonical tests → executable Playwright code
- **Bounded self-healing** — Rule-based + LLM repair with 2-attempt max, diff storage, and audit trail
- **Test execution** — On-demand runs with artifact capture (logs, screenshots, traces, video)
- **GitHub integration** — Auto-publish tests, webhook ingestion, PR lifecycle, secret rotation
- **TestRail integration** — Case mapping, sync dashboard, import from TestRail
- **Progressive rollout** — INTERNAL → PILOT → GENERAL stages with auto-promotion
- **Observability dashboard** — Pass rates, run breakdowns, execution metrics, test health
- **Multi-tenant governance** — 4-role RBAC, audit trail, usage metering, quota enforcement
- **CLI** — `@selora/cli` for init, run, repair, and sync commands

## Project Structure

```
selora/
├── apps/
│   ├── api/                    # NestJS REST API
│   ├── selora-core/            # Tenant-facing React SPA (app.seloraqa.com)
│   ├── selora-console/         # Platform admin React SPA (console.seloraqa.com)
│   ├── worker-execution/       # Playwright test runner worker
│   ├── worker-ingestion/       # Recording ingestion & AI canonicalization
│   └── worker-ai-repair/       # Rule-based + LLM repair worker
├── packages/
│   ├── database/               # Prisma schema (40 models, 46 enums), migrations
│   ├── domain/                 # Shared types & constants
│   ├── auth/                   # Session auth, hashing, tokens
│   ├── storage/                # S3/MinIO abstraction
│   ├── queue/                  # BullMQ + SQS dual-mode queues
│   ├── executor/               # Playwright test runner
│   ├── test-generator/         # AI code generation
│   ├── test-validator/         # Preflight validation & regression tests
│   ├── ai-repair/              # AI repair pipeline
│   ├── canonical-tests/        # Canonical test schema & parsing
│   ├── recording-ingest/       # Recording file processing
│   ├── cli/                    # Command-line interface
│   ├── audit/                  # Audit event types
│   └── observability/          # Structured logging & probes
├── infrastructure/
│   ├── docker/                 # Production Dockerfiles
│   └── terraform/              # AWS infrastructure (17 .tf files)
├── docker-compose.yml          # Local dev stack (10 services)
├── turbo.json                  # Build pipeline
└── pnpm-workspace.yaml         # Workspace config
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start infrastructure (Postgres, Redis, MinIO, Mailpit)
pnpm docker:up

# Run database migrations
pnpm db:migrate:dev

# Seed the database
pnpm db:seed

# Start all services in dev mode
pnpm dev
```

### Full Docker Stack

```bash
# Build and start all services
docker compose up --build -d

# Check health
docker compose ps

# View logs
docker compose logs -f api

# Tear down
docker compose down
```

### Common Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |
| `pnpm format` | Format with Prettier |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm regression:web` | Playwright regression tests |

## Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Production | Redis connection for queues |
| `WEB_ORIGIN` | Production | CORS allowed origin |
| `API_PUBLIC_ORIGIN` | Production | Public API URL |
| `ENCRYPTION_KEY` | Production | Secret encryption key |
| `LLM_API_KEY` | Production | AI provider API key |
| `SMTP_HOST` | Recommended | Email server |
| `S3_BUCKET` | Recommended | Artifact storage bucket |

See `.env.production.example` for the full production configuration.

## Documentation

- [Architecture & Tech Stack](docs/ARCHITECTURE.md) — System design, data flows, infrastructure details

## License

Proprietary. All rights reserved.
