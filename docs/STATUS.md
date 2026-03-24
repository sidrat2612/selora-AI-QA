# Selora — Project Status

> Last updated: 2026-03-25

## Overview

Selora is a vendor-hosted, multi-tenant SaaS platform for web QA automation. It ingests Playwright codegen TypeScript recordings, uses AI to convert them into canonical test definitions, generates executable Playwright tests, validates and repairs generated tests using bounded AI assistance, and provides a web UI for test management and execution.

**Stack:** Vite + React 19 · NestJS 11 · PostgreSQL · Prisma · Redis · BullMQ · MinIO · pnpm + Turborepo

**Apps:** `selora-core` (tenant users) · `selora-console` (platform admins) · `api` · `worker-execution` · `worker-ingestion` · `worker-ai-repair`

**Packages:** `database` · `domain` · `auth` · `storage` · `queue` · `executor` · `test-generator` · `test-validator` · `audit` · `canonical-tests` · `recording-ingest` · `observability`

---

## Current State Summary

### What's built and working

| Area | Status | Details |
|------|--------|---------|
| **Auth & Sessions** | ✅ Complete | Email/password auth, session cookies (idle 8h / absolute 24h), bcrypt, SHA-256 token hashing, email verification, password reset |
| **Four-Role Model** | ✅ Schema + UI enforced | `PLATFORM_ADMIN`, `TENANT_ADMIN`, `TENANT_OPERATOR`, `TENANT_VIEWER` in Prisma enum. Console restricted to PLATFORM_ADMIN. Core blocked for PLATFORM_ADMIN. |
| **Permission Flags** | ✅ Computed | `isSeloraAdmin`, `canManageCompany`, `canManageMembers`, `canManageIntegrations`, `canManageEnvironments`, `canAuthorAutomation`, `canOperateRuns`, `isReadOnly` |
| **Tenant/Workspace CRUD** | ✅ Complete | Tenant lifecycle (active/suspended/archived/soft-delete), workspace CRUD, membership management with invite flow, last-admin protection |
| **Recording Ingestion** | ✅ Complete | Multipart upload, validation, AI-powered canonical conversion (DR-027), BullMQ async processing |
| **Test Catalog** | ✅ Complete | Paginated/filterable test listing, search, status/tag filters, URL-persisted state |
| **Test Generation** | ✅ Complete | AI canonical-to-Playwright generation, versioned artifacts, preflight validation |
| **AI Repair** | ✅ Complete | Rule-based + LLM repair, 2-attempt max, repair history, diff storage, audit trail |
| **Run Execution** | ✅ Complete | Run creation, execution queue, Playwright runner, cancellation, artifact capture (logs/screenshots/traces/video) |
| **Audit & Metering** | ✅ Complete | Audit events with actor/entity, usage metering (7 metrics), audit export |
| **Retention & Cleanup** | ✅ Complete | Configurable per-workspace retention, idempotent cleanup job |
| **Quotas** | ✅ Complete | Hard quota enforcement (runs, concurrent, seats), quota management UI |
| **License Enforcement** | ✅ Complete | Feature gating, env-based license status, frontend banners |
| **Feedback** | ✅ Complete | In-app feedback board, priority/category/status workflow |
| **Environments** | ✅ Complete | Workspace-scoped, secretRef abstraction, runtime injection, environment cloning |
| **Observability** | ✅ Complete | Structured JSON logging, correlation IDs, readiness/liveness probes |
| **Docker** | ✅ Complete | Full local stack (postgres, redis, minio, mailpit, api, web, console, workers), health checks, backup/restore |
| **Automation Suite** | ✅ Complete | `AutomationSuite` model in Prisma. Suite CRUD API + basic UI present. `screenshotPolicy` field on suite detail API. |
| **Business Test Cases** | ✅ Complete | `BusinessTestCase` CRUD (create, list, get, update, archive). `TestCaseScriptMapping` link table. `TestCaseResult` per-run verdict model. Import endpoint for TestRail cases. Frontend pages: test case list, detail, create/edit. |
| **GitHub Integration** | ✅ Complete | Full publication lifecycle with advisory-lock concurrency, branch/PR push, webhook HMAC ingress, auto-publish on validation/repair, branch cleanup on delete. GitHub App OAuth install flow. |
| **TestRail Integration** | ✅ Schema + stubs | `TestRailSuiteIntegration`, `ExternalTestCaseLink` models. API + sync endpoint present. Case import endpoint. |
| **Git Execution** | ✅ Complete | `ExecutionSourceResolverService` handles SUITE_DEFAULT, PINNED_COMMIT, BRANCH_HEAD modes with storage fallback. Lineage fields persisted on `TestRunItem`. |
| **Performance** | ✅ Baselined | All p95 latencies < 200ms on seeded dev dataset. |
| **Retention Cron** | ✅ Complete | `@nestjs/schedule` wired; `RetentionCleanupService` runs daily at 3 AM via `@Cron`. |
| **CSV Import** | ✅ Complete | `POST test-cases/import/csv` with RFC-compliant parser, 500-row limit, `CSV_IMPORT` source enum. |
| **In-App Notifications** | ✅ Complete | `AppNotification` Prisma model, REST endpoints (list, mark-read, mark-all-read), frontend bell dropdown with 30s polling. |
| **Environment DELETE** | ✅ Complete | Soft-delete via DISABLED status, prevents deleting default env or env with active runs. |

### Frontend apps — current route inventory

**Selora Console** (PLATFORM_ADMIN only — governance surfaces):

| Route | Purpose |
|-------|---------|
| `/` | Dashboard |
| `/tenants` | Tenant list |
| `/tenants/:id` | Tenant detail |
| `/audit` | Platform audit logs |
| `/usage` | Usage & quotas |
| `/settings/lifecycle` | Lifecycle settings |
| `/settings/quotas` | Quota management |

**Selora Core** (TENANT_ADMIN, TENANT_OPERATOR, TENANT_VIEWER):

| Route | Purpose |
|-------|---------|
| `/` | Dashboard |
| `/suites` | Suite list |
| `/suites/:id` | Suite detail |
| `/tests` | Test catalog |
| `/tests/:id` | Test detail |
| `/runs` | Run list |
| `/runs/:id` | Run detail |
| `/feedback` | Feedback board |
| `/audit` | Workspace audit |
| `/settings/members` | Workspace members (TENANT_ADMIN) |
| `/settings/execution` | Execution settings |
| `/settings/lifecycle` | Lifecycle settings (TENANT_ADMIN) |
| `/settings/quotas` | Quota view (TENANT_ADMIN) |
| `/settings/retention` | Retention policy (TENANT_ADMIN) |
| `/settings/environments` | Test environments |
| `/suites/:suiteId/test-cases` | Business test case list |
| `/suites/:suiteId/test-cases/new` | Create business test case |
| `/suites/:suiteId/test-cases/:testCaseId` | Test case detail |
| `/suites/:suiteId/test-cases/:testCaseId/edit` | Edit test case |

---

## What's Pending

### 1. Enhancement Phase 1 — COMPLETE

✅ All Phase 2 items implemented:
- **Suite management**: Bulk assignment APIs, default suite backfill migration, archive cascade (unassign tests + disconnect integrations + cancel runs)
- **GitHub integration UI**: Publication status cards, webhook delivery viewer, secret rotation flow, replay controls, repository allowlist CRUD
- **TestRail integration**: Sync dashboard, case mapping editor UI with upsert/remove, enriched external link data
- **Git execution**: Source mode selector on run creation, lineage display tab on RunDetail (resolved source, commit SHA, fallback reason)
- **Per-tenant feature flags**: githubPublishing, gitExecution, testRailSync flags on Tenant model, GET/PATCH API endpoints
- **Progressive rollout automation**: Hourly cron evaluates INTERNAL→PILOT→GENERAL promotion based on pass rate, run count, failure recency
- **Observability dashboard**: Pass rate gauge, run breakdown (passed/failed/in-progress), execution metrics (avg duration, totals)

### 2. Enterprise Auth (Assessed, Deferred)
Recommended order: OIDC SSO → TOTP MFA → WebAuthn MFA → SAML 2.0.

### 3. Hosted Deployment
All work scoped to local Docker. Hosted infrastructure deferred.

---

## Recently Completed (formerly pending)

| Item | Completed | Summary |
|------|-----------|---------|
| Four-Role Backend Auth Alignment | 2026-03-24 | All endpoints audited for `@RequireRoles`, `computePermissions()` aligned, seed includes all 4 roles, enum renamed to TENANT_OPERATOR/TENANT_VIEWER |
| Console API Client Cleanup | 2026-03-24 | Dead suites/tests/runs/feedback/recordings/integration sections removed |
| GitHub Publication Pipeline | 2026-03-24 | Advisory-lock concurrency, retry logic, branch/PR push, auto-publish after validation and AI repair, branch cleanup on integration delete |
| Git Execution Source Resolver | 2026-03-24 | SUITE_DEFAULT/PINNED_COMMIT/BRANCH_HEAD modes with storage fallback, lineage persistence |
| Re-recording Update Path | 2026-03-24 | canonicalTestId in ingestion queue/controller/service/processor for re-recording existing tests |
| GitHub App OAuth Flow | 2026-03-24 | Install URL generation + callback redirect endpoints |
| Retention Cleanup Cron | 2026-03-24 | @nestjs/schedule with daily 3 AM cron |
| CSV Test Case Import | 2026-03-24 | POST import/csv endpoint with RFC parser, 500-row limit |
| In-App Notification System | 2026-03-24 | Prisma model, REST API, frontend bell dropdown with polling |
| Environment DELETE | 2026-03-24 | Soft-delete to DISABLED, default-env and active-run guards |

---

## Sprint History

| Sprint | Name | Status |
|--------|------|--------|
| 0 | Foundations & Architecture Runway | ✅ Complete |
| 1 | SaaS Identity, Tenancy & Base UI Shell | ✅ Complete |
| 1+ | Security Hardening & Test Automation | ✅ Complete |
| 2 | Recording Ingestion & AI-Powered Canonical Test Modeling | ✅ Complete |
| 3 | AI Test Generation & Validation Pipeline | ✅ Complete |
| 4 | AI Repair Loop & Controlled Validation | ✅ Complete |
| 5 | Run Orchestration & Live Execution UI | ✅ Complete |
| 6 | MVP Stabilization & Operator Readiness | ✅ Complete |
| 7 | Beta Expansion — Environments & Run Reliability | ✅ Complete |
| 8 | Beta Polish — Repair Analytics & Quotas | ✅ Complete |
| 9 | Production Hardening — Abuse Controls & DR | ✅ Complete |
| 10 | Local Operations Readiness — Lifecycle & SLOs | ✅ Complete |
| EP1 | Enhancement Phase 1 — Suites & External Integrations | ✅ Complete |

## Open Decisions

~~From [planning/four-role-access-reset.md](planning/four-role-access-reset.md):~~
1. ~~**Enum naming**~~ — ✅ Resolved: renamed to `TENANT_OPERATOR`/`TENANT_VIEWER`
2. ~~**Migration posture**~~ — ✅ Resolved: clean rename via Prisma migration
3. ~~**Company Admin workspace scope**~~ — ✅ Resolved: TENANT_ADMIN manages workspaces in Core
