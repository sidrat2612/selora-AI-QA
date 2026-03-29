# Selora — Architecture & Tech Stack

## Overview

Selora is a multi-tenant SaaS platform for AI-powered QA automation. It ingests Playwright browser recordings, converts them into canonical test definitions using AI, generates executable Playwright tests, runs them, and automatically repairs failures — all within a governed, auditable pipeline.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          seloraqa.com                                   │
│                                                                         │
│   app.seloraqa.com         api.seloraqa.com        console.seloraqa.com │
│   ┌──────────────┐         ┌──────────────┐        ┌──────────────┐     │
│   │  selora-core │ ◄─────► │   NestJS API │ ◄────► │selora-console│     │
│   │  (React SPA) │         │   (REST)     │        │  (React SPA) │     │
│   └──────────────┘         └──────┬───────┘        └──────────────┘     │
│                                   │                                     │
│                    ┌──────────────┼──────────────┐                      │
│                    ▼              ▼              ▼                      │
│             ┌───────────┐  ┌───────────┐  ┌───────────┐                 │
│             │ Worker:   │  │ Worker:   │  │ Worker:   │                 │
│             │ Ingestion │  │ Execution │  │ AI Repair │                 │
│             └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                 │
│                   │              │              │                       │
│              ┌────▼──────────────▼──────────────▼────┐                  │
│              │          Shared Infrastructure        │                  │
│              │  PostgreSQL · Redis · S3 · BullMQ/SQS │                  │
│              └───────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 6.3.5 | Build tool & dev server |
| React Router | 7.13.0 | Client-side routing |
| TanStack Query | ^5.94.5 | Server state management |
| Tailwind CSS | 4.1.12 | Utility-first styling |
| shadcn/ui + Radix | 25+ primitives | Component library |
| Recharts | 2.15.2 | Dashboard charts |
| Lucide React | 0.487.0 | Icon set |
| Sora + IBM Plex Mono | — | Typography (Google Fonts) |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| NestJS | ^11.0.0 | API framework |
| Prisma ORM | ^6.4.0 | Database ORM & migrations |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Queue broker & caching |
| BullMQ | — | Job queue (local/dev) |
| SQS | — | Job queue (production) |
| bcryptjs | — | Password hashing |
| Nodemailer | — | Transactional email |
| ioredis | — | Redis client |
| cookie-parser | — | Session cookie handling |

### Infrastructure & Tooling

| Technology | Version | Purpose |
|---|---|---|
| pnpm | 10.7.0 | Package manager (workspaces) |
| Turborepo | ^2.4.0 | Monorepo build orchestration |
| TypeScript | ^5.7.0 | Type safety across all packages |
| Docker Compose | — | Local dev stack (10 services) |
| Terraform | — | AWS infrastructure as code |
| Playwright | — | Test execution engine |
| Prettier | ^3.4.0 | Code formatting |

### AWS Infrastructure (Terraform-managed)

| Resource | Purpose |
|---|---|
| App Runner | API service hosting |
| ECS (Fargate) | Worker containers |
| ECR | Container image registry |
| CloudFront | CDN for frontend apps |
| Route 53 | DNS management |
| ACM | TLS certificates |
| S3 | Artifact & static asset storage |
| SQS | Production job queues |
| Secrets Manager | Runtime secrets |
| CloudWatch | Logging & monitoring |
| VPC + Security Groups | Network isolation |
| IAM | Service roles & policies |
| Auto Scaling | ECS service scaling |

---

## Monorepo Structure

```
selora/
├── apps/
│   ├── api/                    # NestJS REST API
│   ├── selora-core/            # Tenant-facing React SPA
│   ├── selora-console/         # Platform admin React SPA
│   ├── worker-execution/       # Playwright test runner worker
│   ├── worker-ingestion/       # Recording ingestion & AI canonicalization worker
│   └── worker-ai-repair/       # Rule-based + LLM repair worker
│
├── packages/
│   ├── database/               # Prisma schema (40 models, 46 enums), migrations, seed
│   ├── domain/                 # Shared TypeScript types & constants
│   ├── auth/                   # Session auth, password hashing, token utilities
│   ├── storage/                # S3-compatible storage abstraction (S3/MinIO)
│   ├── queue/                  # BullMQ + SQS dual-mode queue layer
│   ├── executor/               # Playwright test runner
│   ├── test-generator/         # AI canonical → Playwright code generation
│   ├── test-validator/         # Preflight test validation + regression tests
│   ├── ai-repair/              # AI repair pipeline (rules + LLM)
│   ├── canonical-tests/        # Canonical test schema & parsing
│   ├── recording-ingest/       # Recording file processing
│   ├── cli/                    # @selora/cli (commander.js)
│   ├── audit/                  # Audit event types & helpers
│   └── observability/          # Structured logging, correlation IDs, probes
│
├── infrastructure/
│   ├── docker/                 # Production Dockerfiles
│   ├── terraform/              # AWS IaC (17 .tf files)
│   └── certs/                  # TLS certificates (local dev)
│
├── scripts/                    # Backfill migrations, dev helpers
├── docker-compose.yml          # Full local dev stack
├── turbo.json                  # Build pipeline configuration
└── pnpm-workspace.yaml         # Workspace definition
```

---

## Application Architecture

### API (`apps/api`)

The NestJS API is the central service. It handles all HTTP requests, manages sessions, orchestrates queue jobs, and serves as the gateway between frontends and backend workers.

Key modules:
- **Auth** — Email/password login, session cookies (idle 8h / absolute 24h), bcrypt hashing, SHA-256 token hashing, email verification, password reset
- **Recordings** — Upload, MIME validation, artifact signing, ingestion dispatch
- **Suites** — CRUD with slug routing, default suite, screenshot/execution policies, archive cascade
- **Tests** — Canonical test management, bulk assign/unassign (up to 200), versioning
- **Runs** — Execution dispatch, cancellation, artifact capture (logs, screenshots, traces, video)
- **GitHub** — Publication pipeline with advisory locks, webhook ingestion (HMAC-SHA256), secret rotation, delivery replay
- **TestRail** — Credential validation, case mapping, sync dashboard
- **Observability** — Dashboard metrics, pass rate gauges, run breakdowns
- **Platform** — Tenant management, quotas, usage metering (7 metric types), license enforcement, audit trail
- **Health** — Readiness/liveness probes for Docker and load balancers

Security:
- Rate limiting (Throttler guard) on sensitive endpoints
- CORS locked to production origins
- Required environment validation at startup (throws on missing secrets in production)
- Advisory-lock concurrency control for GitHub publishing

### Frontend Apps

**selora-core** (`app.seloraqa.com`) — Tenant-facing SPA:
- Dashboard with pass rate gauges, run charts, test health metrics
- Suite & test management with full CRUD
- Recording upload & ingestion tracking
- Run execution with real-time status, artifact viewers
- GitHub & TestRail integration management
- Environment, member, and execution settings
- Feedback submission
- React Error Boundary for crash resilience

**selora-console** (`console.seloraqa.com`) — Platform admin SPA:
- Multi-tenant oversight dashboard
- Usage monitoring & quota management
- License & feature flag management
- Retention & lifecycle settings
- Platform-wide audit trail

### Workers

All workers consume jobs from BullMQ (dev) or SQS (production) with structured JSON logging.

| Worker | Responsibility |
|---|---|
| **worker-ingestion** | Processes uploaded recordings → AI canonicalization → test generation → validation |
| **worker-execution** | Runs Playwright tests, captures artifacts, reports results |
| **worker-ai-repair** | Applies rule-based fixes, then LLM-assisted repair (2-attempt max), stores diffs |

### CLI (`@selora/cli`)

Command-line interface for developers:
- `selora init` — Initialize workspace configuration
- `selora run` — Trigger test execution
- `selora repair` — Trigger AI repair
- `selora sync` — Sync test definitions

---

## Data Flow

### Recording → Test Pipeline

```
Recording Upload
       │
       ▼
  MIME Validation
       │
       ▼
  S3 Storage ──────────────────────────────────┐
       │                                        │
       ▼                                        │
  Ingestion Queue                               │
       │                                        │
       ▼                                        │
  Worker: Ingestion                             │
  ├── Parse recording                           │
  ├── AI canonicalization (LLM)                 │
  ├── Store canonical test                      │
  ├── Generate Playwright code                  │
  └── Validate generated test                   │
       │                                        │
       ▼                                        │
  Canonical Test (versioned) ◄─────────────────┘
       │
       ▼
  Auto-publish to GitHub (if enabled)
```

### Execution Pipeline

```
Run Triggered (API / CLI / Schedule)
       │
       ▼
  Source Resolution
  ├── SUITE_DEFAULT (latest validated)
  ├── PINNED_COMMIT (specific git SHA)
  └── BRANCH_HEAD (latest from branch)
       │
       ▼
  Execution Queue
       │
       ▼
  Worker: Execution
  ├── Resolve test source code
  ├── Run Playwright tests
  ├── Capture artifacts (screenshots, traces, video, logs)
  └── Report results + lineage metadata
       │
       ▼
  Results persisted to DB
       │
       ▼
  Dashboard updated
```

### AI Repair Pipeline

```
Test Failure Detected
       │
       ▼
  Repair Queue
       │
       ▼
  Worker: AI Repair
  ├── Attempt 1: Rule-based fix (selector updates, timing adjustments)
  ├── Attempt 2: LLM-assisted repair (if rules fail)
  ├── Store repair diffs with audit trail
  └── Mark outcome (REPAIRED / UNREPAIRABLE)
       │
       ▼
  Auto-publish repaired test to GitHub (if enabled)
```

---

## Authentication & Authorization

### Session Model

- Email/password authentication with bcrypt hashing
- Session cookies with idle timeout (8h) and absolute timeout (24h)
- SHA-256 token hashing for stored sessions
- Email verification flow
- Password reset flow

### Role-Based Access Control

| Role | Scope | Capabilities |
|---|---|---|
| **Platform Admin** | Platform-wide | Tenant management, feature flags, compliance, audit |
| **Tenant Admin** | Workspace | Member management, settings, integrations, lifecycle |
| **Tenant Operator** | Workspace | Author tests, trigger runs, upload recordings |
| **Tenant Viewer** | Workspace | Read-only: dashboards, results, audit trails |

Permissions are computed as boolean flags from the role, enabling fine-grained UI control.

---

## Queue Architecture

Selora uses a dual-mode queue system:

- **Development**: BullMQ over Redis — zero-config local development
- **Production**: AWS SQS — managed, scalable, no Redis dependency

The `@selora/queue` package provides a unified interface. Workers consume from whichever backend is configured via environment variables.

### Job Types

| Queue | Job | Triggered By |
|---|---|---|
| Ingestion | `process-recording` | Recording upload |
| Ingestion | `generate-tests` | Canonicalization complete |
| Execution | `run-test` | Run created via API/CLI |
| AI Repair | `repair-test` | Test failure detected |

---

## Progressive Rollout

Features roll out in three stages per suite:

```
INTERNAL → PILOT → GENERAL
```

**Promotion criteria** (evaluated hourly by cron):
- Pass rate ≥ 80%
- Minimum 3 runs completed
- No recent failures in the last evaluation window

Per-tenant feature flags control access to GitHub publishing, git-backed execution, and TestRail sync independently.

---

## Observability

- **Structured JSON logging** across all services via `@selora/observability`
- **Correlation IDs** propagated through request lifecycle
- **Health probes** (readiness + liveness) on all Docker services
- **CloudWatch** for centralized log aggregation in production
- **Usage metering** tracking 7 metric types per tenant/workspace
- **Audit trail** with actor, entity, metadata, and export capability

---

## Docker Compose Services (Local Development)

| Service | Image / Build | Port | Purpose |
|---|---|---|---|
| postgres | `postgres:16-alpine` | 5432 | Primary database |
| redis | `redis:7-alpine` | 6379 | Queue broker |
| minio | `minio/minio` | 9000/9001 | S3-compatible storage |
| mailpit | `axllent/mailpit` | 8025 | Email testing |
| api | Build: `apps/api` | 4000 | NestJS REST API |
| web | Build: `apps/selora-core` | 3000 | Tenant frontend |
| console | Build: `apps/selora-console` | 3001 | Admin frontend |
| worker-execution | Build: `apps/worker-execution` | — | Test runner worker |
| worker-ingestion | Build: `apps/worker-ingestion` | — | Ingestion worker |
| worker-ai-repair | Build: `apps/worker-ai-repair` | — | AI repair worker |

---

## Database

- **PostgreSQL 16** with Prisma ORM
- **40 models** and **46 enums** covering multi-tenant data, test lifecycle, run artifacts, integrations, and audit
- **5 migrations** applied
- Advisory locks for concurrent operations (GitHub publishing)
- Cascade relationships for data integrity (suite archive → test reassignment → run cancellation)

---

## Environment Configuration

Environment variables are validated at API startup. In production mode, missing required variables cause the service to throw immediately rather than running in a degraded state.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Prod only | Redis/BullMQ connection |
| `WEB_ORIGIN` | Prod only | CORS allowed origins |
| `API_PUBLIC_ORIGIN` | Prod only | Public API URL for webhooks |
| `ENCRYPTION_KEY` | Prod only | Secret encryption at rest |
| `SMTP_HOST` / `SMTP_PORT` | Recommended | Transactional email |
| `S3_BUCKET` / `S3_REGION` | Recommended | Artifact storage |
| `LLM_API_KEY` | Prod only | AI features (canonicalization, repair) |

See `.env.example` and `.env.production.example` for full variable lists.
