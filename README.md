# Selora — AI Powered QA Automation Platform

Selora is a vendor-hosted, multi-tenant SaaS platform for web QA automation. It ingests Playwright browser recordings, uses AI to convert them into canonical test definitions, generates executable Playwright tests, validates and repairs generated tests using bounded AI, and provides a full web UI for test management and execution.

Teams record their workflows using Playwright Codegen, and Selora takes it from there: generating tests, validating them, and automatically repairing failures — with full visibility into what was generated, what changed, and why.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, React Router, TanStack Query, shadcn/ui, Tailwind CSS, Recharts |
| **Backend** | NestJS 11, Prisma ORM, PostgreSQL 16 |
| **Workers** | BullMQ job queues, Redis 7 |
| **Storage** | S3-compatible (MinIO for local dev) |
| **Build** | pnpm workspaces, Turborepo (19 build tasks) |
| **Infrastructure** | Docker Compose (full local stack with health checks) |

## Features

### Core Platform
- **Recording-first workflow** — Import Playwright Codegen recordings; AI handles conversion to structured canonical tests
- **AI test generation** — Recordings are converted into versioned, executable Playwright tests with full source traceability
- **Bounded self-healing** — Rule-based + LLM-assisted repair with a 2-attempt max, diff storage, and audit trail
- **Run execution** — On-demand runs with Playwright runner, cancellation support, and artifact capture (logs, screenshots, traces, video)
- **Observability dashboard** — Pass rate gauges, run breakdown charts, execution metrics, and test health overview

### Suite & Test Management
- **Automation suites** — Full CRUD with slug-based routing, default suite per workspace, screenshot policy, and execution policy
- **Business test cases** — Create/import test cases (manual, TestRail, CSV), map to automation scripts, track verdicts per run
- **Bulk operations** — Assign/unassign tests to suites in bulk (up to 200 at once)
- **Archive cascade** — Archiving a suite unassigns tests, disconnects integrations, and cancels queued runs

### GitHub Integration
- **Publication pipeline** — Advisory-lock concurrency, branch/PR push, auto-publish on validation and AI repair
- **Webhook ingress** — HMAC-SHA256 verification, idempotent delivery processing, PR lifecycle state machine
- **Secret rotation** — Non-destructive credential rotation with audit trail
- **Delivery replay** — Replay failed webhook deliveries from the UI
- **Repository allowlist** — Pre-approved repos with CRUD management

### TestRail Integration
- **Credential validation** — Validates instance URL and project access
- **Case mapping editor** — Link canonical tests to TestRail cases, edit/remove mappings, view sync status and errors
- **Sync dashboard** — Sync history, latest run status, failure counts, import test cases from TestRail

### Git-Backed Execution
- **Source resolver** — SUITE_DEFAULT, PINNED_COMMIT, BRANCH_HEAD modes with storage fallback
- **Lineage tracking** — Resolved source mode, git ref, commit SHA, and fallback reasons persisted per run item
- **Source mode selector** — Choose execution source when creating runs; lineage displayed on run detail

### Progressive Rollout
- **Per-suite stages** — INTERNAL → PILOT → GENERAL rollout stages with feature flag toggles
- **Per-tenant flags** — GitHub publishing, git execution, TestRail sync flags on each tenant
- **Auto-promotion** — Hourly cron evaluates suites for promotion based on pass rate (≥80%), run count (≥3), and failure recency

### Platform Governance
- **Four-role model** — PLATFORM_ADMIN, TENANT_ADMIN, TENANT_OPERATOR, TENANT_VIEWER with computed permission flags
- **Audit trail** — Full event audit with actor, entity, metadata, and export capability
- **Usage metering** — 7 metric types tracked per tenant/workspace
- **Quotas** — Hard quota enforcement (runs, concurrent executions, seats, storage)
- **License enforcement** — Feature gating with frontend banners
- **Retention cleanup** — Configurable per-workspace retention with daily cron at 3 AM
- **In-app notifications** — REST API with bell dropdown and 30s polling

## User Roles

| Role | Purpose |
|------|---------|
| **Platform Admin** | Platform-wide operations, tenant oversight, compliance monitoring, feature flag management |
| **Tenant Admin** | Manage team members, configure workspace settings, govern test lifecycle, manage integrations |
| **Tenant Operator** | Author tests, trigger runs, upload recordings, manage day-to-day QA work |
| **Tenant Viewer** | Read-only access to dashboards, test results, and audit trails |

## Project Structure

```
selora/
├── apps/
│   ├── api/                    # NestJS 11 REST API (guards, Prisma, queues)
│   ├── selora-core/            # React 19 tenant app (suites, tests, runs, settings)
│   ├── selora-console/         # React 19 platform admin app (tenants, audit, quotas)
│   ├── worker-execution/       # BullMQ worker — test execution with Playwright
│   ├── worker-ingestion/       # BullMQ worker — recording ingestion & AI canonicalization
│   └── worker-ai-repair/       # BullMQ worker — rule-based + LLM repair
├── packages/
│   ├── database/               # Prisma schema, migrations, seed, client
│   ├── domain/                 # Shared domain types and constants
│   ├── auth/                   # Session auth, password hashing, token utilities
│   ├── storage/                # S3-compatible storage abstraction
│   ├── queue/                  # BullMQ queue definitions and helpers
│   ├── executor/               # Playwright test runner
│   ├── test-generator/         # AI canonical-to-Playwright generation
│   ├── test-validator/         # Preflight test validation
│   ├── ai-repair/              # AI repair pipeline (rule-based + LLM)
│   ├── canonical-tests/        # Canonical test schema and parsing
│   ├── recording-ingest/       # Recording file processing
│   ├── audit/                  # Audit event types and helpers
│   └── observability/          # Structured logging, correlation IDs, probes
├── infrastructure/
│   └── docker/                 # Dockerfiles for all services
├── scripts/                    # Backfill migrations, utilities
├── docs/                       # Architecture, API, planning, runbooks
├── docker-compose.yml          # Full local stack (11 services)
├── turbo.json                  # Turborepo pipeline config
└── pnpm-workspace.yaml         # pnpm workspace definition
```

## Getting Started

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- pnpm 9+
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start infrastructure (postgres, redis, minio, mailpit)
pnpm docker:up

# Run database migrations
pnpm db:migrate:dev

# Seed the database
pnpm db:seed

# Start all apps in dev mode
pnpm dev
```

### Full Docker Stack

```bash
# Build and start all 11 services
docker compose up --build -d

# Check service health
docker compose ps

# View logs
docker compose logs -f api

# Stop everything
docker compose down
```

### Common Commands

```bash
pnpm build              # Build all packages (19 turbo tasks)
pnpm typecheck          # Type check all packages
pnpm lint               # Lint all packages
pnpm test               # Run tests
pnpm format             # Format code with Prettier
pnpm db:studio          # Open Prisma Studio
pnpm regression:web     # Run Playwright regression tests
```

## Architecture

- **Auth**: Email/password with session cookies (idle 8h / absolute 24h), bcrypt, SHA-256 token hashing, email verification, password reset
- **API Design**: RESTful with JSON responses, request correlation IDs, structured error codes, rate limiting
- **Data**: PostgreSQL with Prisma ORM, 30+ enums, cascade relationships, advisory locks for concurrency
- **Queues**: BullMQ over Redis for async processing (ingestion, generation, validation, repair, execution)
- **Storage**: S3-compatible with MinIO for local dev; recordings, generated tests, artifacts, repair diffs
- **Observability**: Structured JSON logging, correlation IDs, readiness/liveness probes, health checks on all Docker services

## Documentation

Detailed documentation lives in the `docs/` directory:

- `docs/STATUS.md` — Current project status and completion inventory
- `docs/planning/roadmap.md` — Phase-by-phase roadmap with item tracking
- `docs/api/` — API surface documentation
- `docs/architecture/` — Auth, session, and system design docs
- `docs/data/` — Prisma schema design and domain modeling
- `docs/runbooks/` — Contributor onboarding, Docker development, release checklists

## License

Proprietary. All rights reserved.

See the `LICENSE` file at the root of this repository for the full license terms.
