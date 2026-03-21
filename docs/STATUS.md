# Selora — Project Status

> Last updated: 2026-03-21

## Overview

Selora is a vendor-hosted, multi-tenant SaaS platform for web QA automation. It ingests Playwright codegen TypeScript recordings, uses AI to convert them into executable Playwright tests, validates and repairs generated tests using bounded AI assistance, stores generated scripts as versioned artifacts for future runs, and lets users select and run automation from a web UI.

**Stack:** Next.js 15 · NestJS 11 · PostgreSQL · Prisma · Redis · BullMQ · MinIO · pnpm + Turborepo

**Team model:** 2-week sprints · 1 full-stack · 1 backend/platform · 1 QA/automation · 1 product/design (part-time)

---

## Sprint Progress

| Sprint | Name | Status | Notes |
|--------|------|--------|-------|
| 0 | Foundations & Architecture Runway | **Done** | Monorepo, Docker Compose, Prisma schema, API contracts, docs |
| 1 | SaaS Identity, Tenancy & Base UI Shell | **Done** | Auth, workspaces, memberships, environments, retention, web shell |
| 1+ | Security Hardening & Test Automation | **Done** | Session TTL fix, role escalation fix, token race fix, throttling, automated regression tests, CI pipeline, runtime warning cleanup |
| 2 | Recording Ingestion & AI-Powered Canonical Test Modeling | **Done** | Recording upload, AI canonicalization, test catalog, pagination, URL-backed filters, worker split |
| 3 | AI Test Generation & Validation Pipeline | **Done** | Versioned generation, validation queue, worker-backed browser validation, detail UI, failure artifacts |
| 4 | AI Repair Loop & Controlled Validation | **Done** | Rule-based repair, repair queue, attempt history UI/API, diff storage, bounded repair tests complete; live external LLM-provider verification remains optional follow-up |
| 5 | Run Orchestration & Live Execution UI | **Done** | Run creation, execution queueing, execution worker, run cancellation, authenticated artifact access, polling run UI, integration coverage |
| 6 | MVP Stabilization & Operator Readiness | **Done** | Audit trail UI, usage metering API, retention enforcement, readiness health check, multi-tenant isolation tests, Docker healthchecks |
| 7–8 | Beta Expansion | **Done** | Sprint 8 completed: repair analytics, hard quota enforcement, broader file support evaluation, feedback capture, performance baseline, and error-handling review |
| 9–10 | Production Hardening | **Done** | Sprint 9 local-Docker scope is complete, and Sprint 10 local-operations readiness is now complete: tenant lifecycle controls, exports, local SLO definitions, runbook completion, and a Docker release checklist |
| EP1 1–6 | Enhancement Phase 1 — Suite Domain & External Integrations | **Done** | AutomationSuite domain, GitHub publication with PR lifecycle & webhook reconciliation, TestRail linkage & sync, execution-source resolution with Git fallback, rollout stage gating, operator rollout controls UI, audit CSV export |

---

## Detailed Sprint Status

### Sprint 0 — Foundations & Architecture Runway ✅

All exit criteria met.

| Deliverable | Status | Key Files |
|---|---|---|
| Monorepo scaffolding (pnpm + Turborepo) | Done | `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` |
| 17 app/package workspaces | Done | `apps/{api,web,worker-execution,worker-ai-repair}`, `packages/{domain,auth,database,storage,queue,recording-ingest,canonical-tests,test-generator,test-validator,ai-repair,executor,audit,observability}` |
| Docker Compose topology | Done | `docker-compose.yml` — postgres, redis, minio, mailpit, api, web, workers |
| Prisma schema (all MVP entities) | Done | `packages/database/prisma/schema.prisma` — 27 models, 15 enums |
| DB seed script | Done | `packages/database/prisma/seed.ts` |
| API contracts documented | Done | `docs/api/mvp-api-surface.md`, `docs/api/openapi-starter.md` |
| Architecture docs | Done | `docs/architecture/{decision-register,final-architecture-brief,auth-session-design,ai-repair-policy}.md` |
| Sprint plans (0–10) | Done | `docs/planning/sprint-{0..10}.md` |
| Runbooks | Done | `docs/runbooks/{contributor-onboarding,docker-development,incident-response,retention-and-cleanup,secrets-and-environments,backup-and-recovery,local-operations,docker-release-checklist}.md` |

### Sprint 1 — SaaS Identity, Tenancy & Base UI Shell ✅

All exit criteria met. Authenticated users can access only their tenant/workspace data through the web shell and APIs.

**Backend — Auth & Session**

| Deliverable | Status | Location |
|---|---|---|
| Login (`POST /auth/login`) | Done | `apps/api/src/auth/auth.controller.ts` · `auth.service.ts` |
| Logout (`POST /auth/logout`) | Done | Same |
| Session (`GET /auth/session`) | Done | Same |
| Email verification (`POST /auth/verify-email`) | Done | Same |
| Forgot password (`POST /auth/forgot-password`) | Done | Same |
| Reset password (`POST /auth/reset-password`) | Done | Same |
| Session cookie with idle + absolute TTL | Done | `auth.service.ts` — idle 8h, absolute 24h, clamped |
| bcrypt password hashing (12 rounds) | Done | `auth.service.ts` |
| SHA-256 opaque token hashing | Done | `auth.service.ts` |
| Password version tracking | Done | `auth.service.ts` — increment on reset, checked on session auth |
| Session auth guard | Done | `apps/api/src/auth/session-auth.guard.ts` |
| Roles guard | Done | `apps/api/src/auth/roles.guard.ts` |
| Tenant access guard | Done | `apps/api/src/auth/tenant-access.guard.ts` |
| Workspace access guard | Done | `apps/api/src/auth/workspace-access.guard.ts` |
| Audit service | Done | `apps/api/src/audit/audit.service.ts` |
| Mailer service (Mailpit in dev) | Done | `apps/api/src/mail/mailer.service.ts` |

**Backend — Workspace Management**

| Deliverable | Status | Location |
|---|---|---|
| List workspaces (`GET /tenants/:tenantId/workspaces`) | Done | `apps/api/src/workspaces/workspaces.controller.ts` · `workspaces.service.ts` |
| Create workspace (`POST /tenants/:tenantId/workspaces`) | Done | Same |
| Workspace details (`GET /workspaces/:workspaceId`) | Done | Same |
| List memberships | Done | Same |
| Create membership (invite flow) | Done | Same |
| Update membership (role change) | Done | Same |
| Delete membership (revoke) | Done | Same |
| List environments | Done | Same |
| Create environment | Done | Same |
| Update environment | Done | Same |
| Get retention settings | Done | Same |
| Update retention settings | Done | Same |
| Slug uniqueness per tenant | Done | `workspaces.service.ts` |
| Default environment toggle | Done | `workspaces.service.ts` |
| Last-admin protection | Done | `workspaces.service.ts` |

**Frontend — Web Shell**

| Deliverable | Status | Location |
|---|---|---|
| Login page | Done | `apps/web/src/app/login/page.tsx` · `login-form.tsx` |
| Forgot password page | Done | `apps/web/src/app/forgot-password/page.tsx` · `forgot-password-form.tsx` |
| Reset password page | Done | `apps/web/src/app/reset-password/page.tsx` · `reset-password-form.tsx` |
| Email verification page | Done | `apps/web/src/app/verify-email/page.tsx` · `verify-email-form.tsx` |
| Workspace shell layout | Done | `apps/web/src/app/app/[workspaceId]/layout.tsx` |
| Dashboard page (placeholder) | Done | `apps/web/src/app/app/[workspaceId]/dashboard/page.tsx` |
| Tests page (placeholder) | Done | `apps/web/src/app/app/[workspaceId]/tests/page.tsx` |
| Runs page (placeholder) | Done | `apps/web/src/app/app/[workspaceId]/runs/page.tsx` |
| Audit page (placeholder) | Done | `apps/web/src/app/app/[workspaceId]/audit/page.tsx` |
| Settings pages (general, members, environments, retention) | Done | `apps/web/src/app/app/[workspaceId]/settings/` |
| Workspace switcher | Done | `apps/web/src/components/workspace-switcher.tsx` |
| Members settings client | Done | `apps/web/src/components/members-settings-client.tsx` |
| Environments settings client | Done | `apps/web/src/components/environments-settings-client.tsx` |
| Retention settings client | Done | `apps/web/src/components/retention-settings-client.tsx` |
| Server-side session helper | Done | `apps/web/src/lib/server-session.ts` |
| API helper + types | Done | `apps/web/src/lib/api.ts` · `apps/web/src/lib/types.ts` |

### Sprint 1+ — Security Hardening & Test Automation ✅

Post-Sprint 1 security review and hardening pass.

**Security Fixes**

| Issue | Severity | Fix | Location |
|---|---|---|---|
| Session idle refresh bypassed absolute TTL | High | Clamp idle refresh against `createdAt + SESSION_TTL` | `auth.service.ts` L97–104 |
| Workspace operators could escalate to TENANT_ADMIN/PLATFORM_ADMIN | Critical | `assertMembershipRoleAssignable()` with role ceiling enforcement | `workspaces.service.ts` L465–501 |
| Verification/reset tokens vulnerable to concurrent reuse | High | Atomic `updateMany` with `usedAt: null` guard inside `$transaction` | `auth.service.ts` L218–239, L315–340 |
| No auth endpoint throttling | Medium | `@nestjs/throttler` — login 5/min, verify 5/15min, forgot 3/15min, reset 5/15min | `auth.controller.ts` L19–90, `app.module.ts` L22–28 |

**Infrastructure Improvements**

| Deliverable | Status | Location |
|---|---|---|
| Shared API bootstrap (runtime + test) | Done | `apps/api/src/bootstrap.ts` |
| Request context via Express middleware (not Nest wildcard) | Done | `apps/api/src/common/request-context.middleware.ts` |
| Legacy wildcard route warning eliminated | Done | `apps/api/src/app.module.ts` |
| Favicon asset + Next.js metadata | Done | `apps/web/public/favicon.svg`, `apps/web/src/app/icon.svg`, `apps/web/src/app/layout.tsx` |
| Auth form `type` + `autoComplete` attributes | Done | `login-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx` |

**Automated Testing**

| Deliverable | Status | Location |
|---|---|---|
| Security regression test suite (4 tests) | Done | `apps/api/test/security-regressions.test.cjs` |
| — Operator cannot escalate membership | Passing | |
| — Email verification tokens single-use | Passing | |
| — Password reset tokens single-use | Passing | |
| — Login throttled after repeated failures | Passing | |
| API test script | Done | `apps/api/package.json` → `pnpm build && node --test` |
| CI pipeline (GitHub Actions) | Done | `.github/workflows/ci.yml` — lint, typecheck, migrations, API tests |

### Sprint 2 — Recording Ingestion & AI-Powered Canonical Test Modeling ✅

All exit criteria met. Recordings can be uploaded, AI-analyzed into canonical tests, and browsed in a paginated/filterable catalog with URL-persisted state.

**Shared Packages (created)**

| Package | Purpose | Key Exports |
|---|---|---|
| `@selora/canonical-tests` | Schema types & validation | `CanonicalTestDefinition`, `validateCanonicalTestDefinition()`, `CANONICAL_SCHEMA_VERSION` |
| `@selora/recording-ingest` | Upload validation, sanitization, AI/heuristic analysis | `validateRecordingUpload()`, `sanitizeRecordingContent()`, `analyzeRecordingToCanonical()` |
| `@selora/storage` | S3/local dual-driver object storage | `putStoredObject()`, `readStoredText()`, `buildStorageKey()`, `getStorageConfig()` |
| `@selora/queue` | BullMQ queue definitions & connection helpers | `QUEUE_NAMES`, `RecordingIngestionJobData`, `getQueueMode()`, `getRedisConnection()` |

**Backend — Recording & Test API**

| Deliverable | Status | Location |
|---|---|---|
| List recordings (paginated, filterable) | Done | `apps/api/src/recordings/recordings.controller.ts` · `recordings.service.ts` |
| Get recording detail | Done | Same |
| Upload recording (multipart + validation) | Done | Same |
| List canonical tests (paginated, filterable by status/tag/search) | Done | Same |
| Get canonical test detail | Done | Same |
| Inline ingestion processor (QUEUE_MODE=inline) | Done | `apps/api/src/recordings/recording-ingestion.processor.ts` |
| BullMQ queue facade (enqueue only from API) | Done | `apps/api/src/recordings/recording-ingestion.queue.ts` |
| Module registration | Done | `apps/api/src/app.module.ts` |

**Workers**

| Deliverable | Status | Location |
|---|---|---|
| Dedicated ingestion worker (BullMQ consumer) | Done | `apps/worker-ingestion/src/main.ts` |
| Execution worker (stripped to execution-only) | Done | `apps/worker-execution/src/main.ts` |
| Worker-ingestion Dockerfile | Done | `infrastructure/docker/worker-ingestion.Dockerfile` |
| Docker Compose service for worker-ingestion | Done | `docker-compose.yml` |

**Frontend — Test Catalog UI**

| Deliverable | Status | Location |
|---|---|---|
| Recording upload form | Done | `apps/web/src/components/recording-catalog-client.tsx` |
| Recording queue list with live polling | Done | Same |
| Canonical test catalog | Done | Same |
| Search, status filter, tag filter, page size controls | Done | Same |
| Pagination (Previous/Next) with range display | Done | Same |
| URL-backed search params (server parse + client sync) | Done | `apps/web/src/app/app/[workspaceId]/tests/page.tsx` · `recording-catalog-client.tsx` |
| Server-side paginated fetch helpers | Done | `apps/web/src/lib/server-session.ts` |
| Paginated result + recording/test types | Done | `apps/web/src/lib/types.ts` |

**Integration Tests**

| Deliverable | Status | Location |
|---|---|---|
| Upload + async canonicalization test | Passing | `apps/api/test/recordings.integration.test.cjs` |
| Pagination & filter test | Passing | Same |
| Invalid upload rejection test | Passing | Same |
| + 4 Sprint 1+ security regression tests | Passing | `apps/api/test/security-regressions.test.cjs` |

**Docs & Infrastructure**

| Deliverable | Status | Location |
|---|---|---|
| Docker development runbook (worker-ingestion section) | Done | `docs/runbooks/docker-development.md` |
| Architecture docs updated for AI pipeline | Done | `docs/architecture/decision-register.md`, `final-architecture-brief.md`, `ai-repair-policy.md` |
| Sprint planning docs updated | Done | `docs/planning/sprint-2.md`, `sprint-3.md`, `sprint-5.md` |

### Sprint 3 — AI Test Generation & Validation Pipeline ✅

All exit criteria met. Canonical tests can be converted into stored Playwright artifacts, validated through a queue-backed workflow, and reviewed from a dedicated detail UI with version selection and failure artifact access.

**Shared Packages**

| Package | Purpose | Key Exports |
|---|---|---|
| `@selora/test-generator` | AI/template Playwright generation from canonical models | `generatePlaywrightTest()`, `sanitizeCanonicalDefinition()`, `TEST_GENERATOR_VERSION` |
| `@selora/test-validator` | Preflight + Playwright browser validation | `validateGeneratedPlaywrightTest()`, `runPlaywrightValidation()`, `cleanupValidationWorkspace()` |

**Backend — Generation & Validation API**

| Deliverable | Status | Location |
|---|---|---|
| Generate Playwright artifact endpoint | Done | `apps/api/src/recordings/recordings.controller.ts` · `recordings.service.ts` |
| Generated artifact detail endpoint | Done | Same |
| Validation artifact download endpoint | Done | Same |
| Versioned `GeneratedTestArtifact` persistence | Done | `recordings.service.ts` · `packages/database/prisma/schema.prisma` |
| Inline validation processor fallback | Done | `apps/api/src/recordings/test-validation.processor.ts` |
| Validation queue facade | Done | `apps/api/src/recordings/test-validation.queue.ts` |

**Workers**

| Deliverable | Status | Location |
|---|---|---|
| Queue-backed validation consumer | Done | `apps/worker-execution/src/main.ts` |
| Browser validation with Playwright test runner | Done | `@selora/test-validator` via `worker-execution` |
| Screenshot/trace artifact persistence on failure | Done | `worker-execution/src/main.ts` |
| Execution worker Docker image updated for validation deps | Done | `infrastructure/docker/worker-execution.Dockerfile` |

**Frontend — Generation & Validation UI**

| Deliverable | Status | Location |
|---|---|---|
| Catalog-level Generate / Regenerate action | Done | `apps/web/src/components/recording-catalog-client.tsx` |
| Dedicated test detail page | Done | `apps/web/src/app/app/[workspaceId]/tests/[testId]/page.tsx` |
| Generated code viewer | Done | `apps/web/src/components/generated-test-detail-client.tsx` |
| Artifact version selector | Done | Same |
| Validation failure summary display | Done | Same |
| Screenshot/trace download links | Done | Same |

**Data Model**

| Deliverable | Status | Location |
|---|---|---|
| Generated artifact validation metadata | Done | `packages/database/prisma/schema.prisma` |
| Generated artifact to `Artifact` relation | Done | Same |
| Prisma migration for validation state | Done | `packages/database/prisma/migrations/20260319184000_sprint3_validation_state/migration.sql` |

**Integration & Verification**

| Deliverable | Status | Location |
|---|---|---|
| Generation + validation API integration test | Passing | `apps/api/test/recordings.integration.test.cjs` |
| Queue/storage/database/api/web/worker typechecks | Passing | workspace builds on 2026-03-19 |

### Sprint 4 — AI Repair Loop & Controlled Validation ✅

All exit criteria met. Validation failures drive bounded AI repair attempts with stored diffs. Rule-based and LLM-assisted repair modes are implemented, with repair history exposed through both API and UI. Live external LLM-provider verification remains an optional follow-up.

**Shared Packages**

| Package | Purpose | Key Exports |
|---|---|---|
| `@selora/ai-repair` | Rule-based and LLM-assisted repair orchestration | `repairGeneratedTest()`, `REPAIR_POLICY`, `RepairOutcome` |

**Backend — Repair API**

| Deliverable | Status | Location |
|---|---|---|
| Repair attempts endpoint (`GET /tests/:testId/repair-attempts`) | Done | `apps/api/src/recordings/recordings.controller.ts` · `recordings.service.ts` |
| AI repair queue facade | Done | `apps/api/src/recordings/ai-repair.queue.ts` |
| AI repair inline processor | Done | `apps/api/src/recordings/ai-repair.processor.ts` |

**Workers**

| Deliverable | Status | Location |
|---|---|---|
| AI repair worker | Done | `apps/worker-ai-repair/` |
| Repair diff artifact persistence | Done | `@selora/ai-repair` · `apps/worker-ai-repair/` |
| Bounded retry (max 2 attempts per artifact) | Done | `@selora/ai-repair` policy enforcement |

**Frontend — Repair History UI**

| Deliverable | Status | Location |
|---|---|---|
| Repair attempts list on test detail page | Done | `apps/web/src/app/app/[workspaceId]/tests/[testId]/page.tsx` |
| Diff summary and patch text display | Done | Same |
| Human review escalation state | Done | Same |

**Integration & Verification**

| Deliverable | Status | Location |
|---|---|---|
| Repair attempts API integration test | Passing | `apps/api/test/recordings.integration.test.cjs` |
| `@selora/ai-repair` unit tests | Passing | `packages/ai-repair/test/` |

### Sprint 5 — Run Orchestration & Live Execution UI ✅

All exit criteria met. Operators can select validated tests, launch runs against workspace environments, monitor execution progress via polling, cancel active runs, and access per-item execution artifacts.

**Shared Packages**

| Package | Purpose | Key Exports |
|---|---|---|
| `@selora/executor` | Shared execution orchestration (inline and BullMQ) | `processExecutionJob()` |
| `@selora/queue` | TestExecutionJobData type, queue names | `TestExecutionJobData`, `QUEUE_NAMES.TEST_EXECUTION` |
| `@selora/storage` | Artifact key building, buffer/text read | `buildArtifactKey()`, `readStoredBuffer()` |

**Backend — Run API**

| Deliverable | Status | Location |
|---|---|---|
| List runs (paginated, filterable by status/date) | Done | `apps/api/src/recordings/recordings.controller.ts` · `recordings.service.ts` |
| Get run detail | Done | Same |
| List run items | Done | Same |
| Create run (`POST /runs`) | Done | Same |
| Cancel run (`POST /runs/:runId/cancel`) | Done | Same |
| Download run artifact (`GET /runs/:runId/items/:itemId/artifacts/:artifactId/download`) | Done | Same |
| Execution queue service (BullMQ + inline mode) | Done | `apps/api/src/recordings/test-execution.queue.ts` |
| Execution inline processor | Done | `apps/api/src/recordings/test-execution.processor.ts` |

**Executor Package**

| Deliverable | Status | Location |
|---|---|---|
| `processExecutionJob()` — shared entry point | Done | `packages/executor/src/index.ts` |
| Run item started/finalized state machine | Done | Same |
| Cancellation-aware finalization | Done | Same |
| Execution log artifact persistence | Done | Same |
| Screenshot/trace/video artifact persistence | Done | Same |
| `deriveRunStatus()` — aggregate run status from item counts | Done | Same |
| `classifyExecutionStatus()` — PASSED/FAILED/TIMED_OUT mapping | Done | Same |
| Runtime secret resolution from environment variables | Done | Same |

**Workers**

| Deliverable | Status | Location |
|---|---|---|
| BullMQ execution consumer | Done | `apps/worker-execution/src/main.ts` |
| Playwright browser execution via `@selora/test-validator` | Done | Same via `@selora/executor` |

**Frontend — Runs UI**

| Deliverable | Status | Location |
|---|---|---|
| Run launcher (environment picker, test selector, start button) | Done | `apps/web/src/components/runs-client.tsx` |
| Run history list with status filter | Done | Same |
| Auto-refresh polling for active runs (2.5s interval) | Done | Same |
| Run detail panel with progress/pass/fail/duration cards | Done | Same |
| Per-item artifact list with preview and download | Done | Same |
| Artifact preview modal (text + image) | Done | Same |
| Cancel run button for active runs | Done | Same |
| Object URL lifecycle management (no memory leaks) | Done | Same |
| Runs page with server-side data loading | Done | `apps/web/src/app/app/[workspaceId]/runs/page.tsx` |

**Integration & Verification**

| Deliverable | Status | Location |
|---|---|---|
| Run creation + execution + log capture test | Passing | `apps/api/test/recordings.integration.test.cjs` |
| Run rejection for ineligible tests | Passing | Same |
| Run cancellation test | Passing | Same |
| Authenticated artifact download test | Passing | Same |

### Sprint 6 — MVP Stabilization & Operator Readiness ✅

All exit criteria met. Audit trail, usage metering, retention enforcement, readiness health check, multi-tenant isolation tests, and Docker healthchecks all implemented and verified.

**Backend — Audit API**

| Deliverable | Status | Location |
|---|---|---|
| Paginated audit event listing with filters (eventType, entityType, actorUserId, date range) | Done | `apps/api/src/audit/audit.service.ts` |
| Distinct event types endpoint | Done | Same |
| Audit REST controller (workspace-scoped, OPERATOR+ guard) | Done | `apps/api/src/audit/audit.controller.ts` |

**Backend — Usage Metering**

| Deliverable | Status | Location |
|---|---|---|
| Usage metric recording service | Done | `apps/api/src/usage/usage-meter.service.ts` |
| Workspace-level usage aggregation (groupBy metricType) | Done | Same |
| Tenant-level usage aggregation | Done | Same |
| Usage REST controller (workspace + tenant endpoints) | Done | `apps/api/src/usage/usage.controller.ts` |

**Backend — Retention Enforcement**

| Deliverable | Status | Location |
|---|---|---|
| Retention cleanup service (iterates all workspace settings, deletes expired artifacts + audit events) | Done | `apps/api/src/retention/retention-cleanup.service.ts` |
| Storage object deletion (S3 + local) | Done | `packages/storage/src/index.ts` (`deleteStoredObject`) |
| Manual cleanup trigger endpoint (PLATFORM_ADMIN only) | Done | `apps/api/src/retention/retention-cleanup.controller.ts` |

**Backend — Observability**

| Deliverable | Status | Location |
|---|---|---|
| Readiness health endpoint (DB + Redis connectivity) | Done | `apps/api/src/health.controller.ts` (`GET /health/ready`) |

**Frontend — Audit Trail UI**

| Deliverable | Status | Location |
|---|---|---|
| Audit trail client component (filter, paginate, expand metadata) | Done | `apps/web/src/components/audit-trail-client.tsx` |
| Audit trail server page (SSR with initial data) | Done | `apps/web/src/app/app/[workspaceId]/audit/page.tsx` |
| Server-side fetch helpers (getAuditEvents, getAuditEventTypes) | Done | `apps/web/src/lib/server-session.ts` |
| AuditEventSummary type | Done | `apps/web/src/lib/types.ts` |

**Infrastructure — Docker Hardening**

| Deliverable | Status | Location |
|---|---|---|
| Docker healthcheck for API (readiness endpoint) | Done | `docker-compose.yml` (api service) |
| Docker healthcheck for Web | Done | `docker-compose.yml` (web service) |
| Conditional service dependencies (api depends_on healthy infra, web depends_on healthy api) | Done | `docker-compose.yml` |

**Integration & Verification**

| Deliverable | Status | Location |
|---|---|---|
| Cross-tenant workspace access denied | Passing | `apps/api/test/isolation.integration.test.cjs` |
| Cross-tenant workspace listing denied | Passing | Same |
| Cross-tenant audit event access denied | Passing | Same |
| Cross-tenant usage access denied | Passing | Same |
| Isolation admin can access own workspace | Passing | Same |
| Isolation admin denied access to other tenant | Passing | Same |

### Sprint 7 — Beta Expansion: Environment Hardening, Run Reliability & Artifact Viewers ✅

All exit criteria met. Environment cloning and encrypted secret storage, configurable timeouts/retries, concurrent execution limits, searchable/comparable run history, and improved artifact viewers are implemented and verified.

**Backend — Environment & Secret Handling Improvements**

| Deliverable | Status | Location |
|---|---|---|
| Environment fields: testTimeoutMs, runTimeoutMs, maxRetries (schema + migration) | Done | `packages/database/prisma/schema.prisma` |
| Encrypted secret storage for environment secretValue | Done | `apps/api/src/workspaces/workspaces.service.ts`, `packages/executor/src/index.ts` |
| Secret access audit logging at execution time | Done | `packages/executor/src/index.ts` |
| readEnvironmentBody parses new timeout/retry fields | Done | `apps/api/src/workspaces/workspaces.service.ts` |
| Environment clone endpoint (POST .../environments/:id/clone) | Done | `apps/api/src/workspaces/workspaces.controller.ts` |
| Clone service method (copies config, requires new secretRef) | Done | `apps/api/src/workspaces/workspaces.service.ts` |
| Workspace concurrency limit setting (concurrentExecutionLimit on Workspace model) | Done | `packages/database/prisma/schema.prisma` |
| Update workspace settings endpoint (PATCH .../settings) | Done | `apps/api/src/workspaces/workspaces.controller.ts` |

**Backend — Run Reliability**

| Deliverable | Status | Location |
|---|---|---|
| Concurrent execution limit enforcement in createRun | Done | `apps/api/src/recordings/recordings.service.ts` |
| Configurable test timeout from environment.testTimeoutMs (replaces env var) | Done | `packages/executor/src/index.ts` |
| Run-level timeout enforcement | Done | `packages/executor/src/index.ts` |
| Retry logic in executor (up to environment.maxRetries attempts) | Done | `packages/executor/src/index.ts` |
| Retry count tracking on TestRunItem | Done | `packages/executor/src/index.ts` |

**Backend — Run Search & Comparison**

| Deliverable | Status | Location |
|---|---|---|
| Enhanced listRuns: search by test name, triggeredBy filter, sortBy (createdAt/status/duration) | Done | `apps/api/src/recordings/recordings.service.ts` |
| Run comparison endpoint (GET .../runs/compare?runIdA=&runIdB=) | Done | `apps/api/src/recordings/recordings.controller.ts` |
| Per-test item status diff with changed flag | Done | `apps/api/src/recordings/recordings.service.ts` |

**Frontend — Improved Artifact Viewers**

| Deliverable | Status | Location |
|---|---|---|
| Runs client: search filters, compare selection, comparison table | Done | `apps/web/src/components/runs-client.tsx` |
| Log viewer component (search, line navigation, color-coded levels, line numbers) | Done | `apps/web/src/components/log-viewer.tsx` |
| Screenshot gallery component (thumbnail grid, full-size view, keyboard nav) | Done | `apps/web/src/components/screenshot-gallery.tsx` |
| Environment settings UI: encrypted secret input, timeout/retry controls, clone flow | Done | `apps/web/src/components/environments-settings-client.tsx` |
| Updated web types (Environment.testTimeoutMs/runTimeoutMs/maxRetries, Workspace.concurrentExecutionLimit) | Done | `apps/web/src/lib/types.ts` |

**Integration & Verification**

| Check | Result |
|---|---|
| All 21 integration tests | 21 pass, 0 fail |
| @selora/database build | Green |
| @selora/domain build | Green |
| @selora/executor build | Green |
| @selora/api build (nest build) | Green |
| @selora/web build (next build) | Green |

### Sprint 8 — Beta Expansion: Repair Analytics & Hard Quotas ✅

Repair visibility and hard quota enforcement are now implemented and verified. Workspace dashboards now surface repair outcome analytics, while tenant-scoped quotas can be viewed and adjusted from the web UI and are enforced on uploads, run creation, and seat growth.

**Backend — Repair Analytics & Quotas**

| Deliverable | Status | Location |
|---|---|---|
| Repair analytics endpoint (`GET /workspaces/:workspaceId/repair-analytics`) | Done | `apps/api/src/recordings/recordings.controller.ts`, `apps/api/src/recordings/recordings.service.ts` |
| Repair trend/status/mode aggregations | Done | `apps/api/src/recordings/recordings.service.ts` |
| `TenantQuota` schema + migration | Done | `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260320033951_sprint8_tenant_quotas/` |
| Tenant quota endpoints (`GET/PATCH /tenants/:tenantId/quotas`) | Done | `apps/api/src/usage/quota.controller.ts`, `apps/api/src/usage/quota.service.ts` |
| Hard quota enforcement for run count + concurrent executions | Done | `apps/api/src/recordings/recordings.service.ts`, `apps/api/src/usage/quota.service.ts` |
| Hard quota enforcement for recording uploads | Done | `apps/api/src/recordings/recordings.service.ts`, `apps/api/src/usage/quota.service.ts` |
| Hard quota enforcement for seat invitations | Done | `apps/api/src/workspaces/workspaces.service.ts`, `apps/api/src/usage/quota.service.ts` |

**Frontend — Dashboard & Quota Management**

| Deliverable | Status | Location |
|---|---|---|
| Repair analytics dashboard page | Done | `apps/web/src/app/app/[workspaceId]/dashboard/page.tsx` |
| Quota settings page with usage bars and editable limits | Done | `apps/web/src/app/app/[workspaceId]/settings/quotas/page.tsx`, `apps/web/src/components/quota-settings-client.tsx` |
| Tenant quota types + server fetch helpers | Done | `apps/web/src/lib/types.ts`, `apps/web/src/lib/server-session.ts` |

**Broader Playwright File Support**

| Deliverable | Status | Location |
|---|---|---|
| File support evaluation report for multi-page, fixture, helper, and parametrized patterns | Done | `docs/reports/playwright-file-support-evaluation.md` |
| Named page variable validation and heuristic parser support | Done | `packages/recording-ingest/src/index.ts` |
| Regression coverage for supported and deferred patterns | Done | `packages/recording-ingest/test/index.test.cjs` |
| Decision register entry for supported beta boundary | Done | `docs/architecture/decision-register.md` |

**Beta Stabilization**

| Deliverable | Status | Location |
|---|---|---|
| Structured queue service-unavailable errors for inline/BullMQ queue facades | Done | `apps/api/src/common/http-errors.ts`, `apps/api/src/recordings/recording-ingestion.queue.ts`, `apps/api/src/recordings/test-validation.queue.ts`, `apps/api/src/recordings/test-execution.queue.ts`, `apps/api/src/recordings/ai-repair.queue.ts` |
| In-app beta feedback capture and prioritization workflow | Done | `apps/api/src/feedback/feedback.controller.ts`, `apps/api/src/feedback/feedback.service.ts`, `apps/web/src/app/app/[workspaceId]/feedback/page.tsx`, `apps/web/src/components/feedback-client.tsx` |
| Performance baseline script and report | Done | `apps/api/scripts/sprint8-performance-baseline.cjs`, `docs/reports/sprint-8-performance-baseline.md` |
| Beta feedback prioritization report | Done | `docs/reports/beta-feedback-priorities.md` |

**Integration & Verification**

| Check | Result |
|---|---|
| All 29 API integration tests | 29 pass, 0 fail |
| @selora/api build (nest build) | Green |
| @selora/web build (next build) | Green |
| @selora/recording-ingest test | 3 pass, 0 fail |
| Sprint 8 performance baseline | Completed; all measured p95 latencies below 200ms |

### Sprint 9–10 — Production Hardening: Local Operations Readiness ✅

Sprint 9 and Sprint 10 are complete for the currently approved local-Docker scope. This closes the local hardening slice without overstating hosted readiness.

**Backend — Tenant Lifecycle & Exportability**

| Deliverable | Status | Location |
|---|---|---|
| Tenant lifecycle summary endpoint (`GET /tenants/:tenantId`) | Done | `apps/api/src/tenants/tenants.controller.ts`, `apps/api/src/tenants/tenants.service.ts` |
| Tenant lifecycle update endpoint (`PATCH /tenants/:tenantId`) | Done | Same |
| Tenant export endpoint (`GET /tenants/:tenantId/export`) | Done | Same |
| Tenant lifecycle metadata schema + migration | Done | `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260320112000_sprint10_tenant_lifecycle/` |
| Suspended and soft-delete-pending tenant write blocking | Done | `apps/api/src/auth/tenant-access.guard.ts`, `apps/api/src/auth/workspace-access.guard.ts` |
| Lifecycle audit events | Done | `apps/api/src/tenants/tenants.service.ts` |

**Frontend — Tenant Lifecycle Administration**

| Deliverable | Status | Location |
|---|---|---|
| Shared settings tabs navigation | Done | `apps/web/src/components/settings-tabs.tsx` |
| Tenant lifecycle settings page | Done | `apps/web/src/app/app/[workspaceId]/settings/lifecycle/page.tsx` |
| Tenant lifecycle admin client | Done | `apps/web/src/components/tenant-lifecycle-client.tsx` |
| Tenant lifecycle types and server fetch helper | Done | `apps/web/src/lib/types.ts`, `apps/web/src/lib/server-session.ts` |

**Operational Readiness Docs**

| Deliverable | Status | Location |
|---|---|---|
| Local ops readiness report with SLOs, error budgets, and enterprise-auth assessment | Done | `docs/reports/sprint-10-local-ops-readiness.md` |
| Local operations runbook | Done | `docs/runbooks/local-operations.md` |
| Docker release checklist | Done | `docs/runbooks/docker-release-checklist.md` |
| Docker development guide cross-links | Done | `docs/runbooks/docker-development.md` |
| Incident response cross-links | Done | `docs/runbooks/incident-response.md` |

**Integration & Verification**

| Check | Result |
|---|---|
| `pnpm db:generate` | Green |
| `pnpm db:migrate:deploy` | Green |
| `pnpm --filter @selora/api test` | 36 pass, 0 fail |
| `pnpm --filter @selora/web build` | Green |

---

## Validation State

| Check | Result | Date |
|---|---|---|
| `pnpm --filter @selora/queue build` | Green | 2026-03-19 |
| `pnpm --filter @selora/test-validator build` | Green | 2026-03-19 |
| `pnpm --filter @selora/domain build` | Green | 2026-03-19 |
| `pnpm --filter @selora/executor build` | Green | 2026-03-19 |
| `pnpm --filter @selora/ai-repair build` + test | Green | 2026-03-19 |
| `pnpm --filter @selora/api exec tsc --noEmit` | Green | 2026-03-19 |
| `pnpm --filter @selora/web exec tsc --noEmit` | Green | 2026-03-19 |
| `pnpm --filter @selora/worker-execution exec tsc --noEmit` | Green | 2026-03-19 |
| `pnpm --filter @selora/api build` | Green | 2026-03-20 |
| `pnpm --filter @selora/web build` | Green | 2026-03-20 |
| `pnpm --filter @selora/api test` (27 tests) | 27 pass, 0 fail | 2026-03-20 |
| `pnpm --filter @selora/recording-ingest test` | 3 pass, 0 fail | 2026-03-20 |
| `pnpm --filter @selora/api performance:baseline` | Green | 2026-03-20 |
| `pnpm --filter @selora/api test` (29 tests) | 29 pass, 0 fail | 2026-03-20 |
| `pnpm db:generate` | Green | 2026-03-20 |
| `pnpm db:migrate:deploy` | Green | 2026-03-20 |
| `pnpm --filter @selora/api test` (36 tests) | 36 pass, 0 fail | 2026-03-20 |
| `docker compose config` | Valid | 2026-03-19 |
| Manual smoke test (login, workspace, invite, verify, reset, environment, retention, logout) | Passed | 2026-03-19 |

---

## Architecture Decisions Register

All 28 locked architecture decisions are documented in `docs/architecture/decision-register.md`. Key ones:

1. Vendor-hosted control plane first; hybrid runner path preserved.
2. Custom email/password auth in MVP; enterprise auth later.
3. Shared runner pool with per-job isolation.
4. Playwright codegen TypeScript inputs only in MVP.
5. AI analyzes recordings into canonical tests and generates Playwright scripts.
6. AI repair during validation only, max 2 attempts, generated files only.
7. Generated test scripts are stored as versioned artifacts and reused for execution.
8. Artifacts are sensitive by default.
9. Polling for live updates in MVP.
10. Tenant onboarding is manual/operator-assisted.

---

## Database Schema

27 models defined in `packages/database/prisma/schema.prisma`:

| Category | Models |
|---|---|
| Auth & Identity | `Tenant`, `Workspace`, `User`, `UserSession`, `EmailVerificationToken`, `PasswordResetToken`, `Membership` |
| Environment | `Environment` |
| Recording & Test | `RecordingAsset`, `CanonicalTest`, `GeneratedTestArtifact` |
| Execution | `TestRun`, `TestRunItem` |
| Artifacts | `Artifact` |
| Audit | `AuditEvent` |
| AI Repair | `AIRepairAttempt` |
| Operations | `UsageMeter`, `TenantQuota`, `BetaFeedback`, `RetentionSetting` |

`GeneratedTestArtifact` is the persistent storage model for AI-generated Playwright scripts. Each generated script is stored with a `storageKey`, `checksum`, and incrementing `version`, and future runs execute against the stored artifact rather than regenerating code on demand.

---

## API Surface (implemented endpoints)

### Auth (`/api/v1/auth`)
| Method | Path | Guard | Throttle |
|---|---|---|---|
| POST | `/login` | Public | 5/min |
| POST | `/logout` | Session | 20/min |
| GET | `/session` | Session | 20/min |
| POST | `/verify-email` | Public | 5/15min |
| POST | `/forgot-password` | Public | 3/15min |
| POST | `/reset-password` | Public | 5/15min |

### Workspaces (`/api/v1`)
| Method | Path | Guard |
|---|---|---|
| GET | `/tenants/:tenantId/workspaces` | Session + Tenant |
| POST | `/tenants/:tenantId/workspaces` | Session + Tenant + Admin |
| GET | `/workspaces/:workspaceId` | Session + Workspace |
| GET | `/workspaces/:workspaceId/memberships` | Session + Workspace |
| POST | `/workspaces/:workspaceId/memberships` | Session + Workspace + Operator+ |
| PATCH | `/workspaces/:workspaceId/memberships/:id` | Session + Workspace + Operator+ |
| DELETE | `/workspaces/:workspaceId/memberships/:id` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/environments` | Session + Workspace |
| POST | `/workspaces/:workspaceId/environments` | Session + Workspace + Operator+ |
| PATCH | `/workspaces/:workspaceId/environments/:id` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/settings/retention` | Session + Workspace |
| PATCH | `/workspaces/:workspaceId/settings/retention` | Session + Workspace + Operator+ |

### Health
| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/health` | Public |
| GET | `/api/v1/health/ready` | Public |

### Recordings & Tests (`/api/v1/workspaces/:workspaceId`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/recordings` | Session + Workspace |
| GET | `/workspaces/:workspaceId/recordings/:recordingId` | Session + Workspace |
| POST | `/workspaces/:workspaceId/recordings` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/tests` | Session + Workspace |
| GET | `/workspaces/:workspaceId/tests/:testId` | Session + Workspace |
| GET | `/workspaces/:workspaceId/tests/:testId/repair-attempts` | Session + Workspace |
| GET | `/workspaces/:workspaceId/repair-analytics` | Session + Workspace |
| POST | `/workspaces/:workspaceId/tests/:testId/generate` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/tests/:testId/generated-artifacts/:artifactId` | Session + Workspace |
| GET | `/workspaces/:workspaceId/tests/:testId/generated-artifacts/:artifactId/artifacts/:validationArtifactId/download` | Session + Workspace |

### Runs (`/api/v1/workspaces/:workspaceId`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/runs` | Session + Workspace |
| GET | `/workspaces/:workspaceId/runs/:runId` | Session + Workspace |
| GET | `/workspaces/:workspaceId/runs/:runId/items` | Session + Workspace |
| POST | `/workspaces/:workspaceId/runs` | Session + Workspace + Operator+ |
| POST | `/workspaces/:workspaceId/runs/:runId/cancel` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/runs/:runId/items/:itemId/artifacts/:artifactId/download` | Session + Workspace |

### Audit (`/api/v1/workspaces/:workspaceId`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/audit-events` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/audit-events/event-types` | Session + Workspace + Operator+ |
| GET | `/workspaces/:workspaceId/audit-events/export` | Session + Workspace + Operator+ |

### Suites (`/api/v1/workspaces/:workspaceId`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/suites` | Session + Workspace |
| GET | `/workspaces/:workspaceId/suites/:suiteId` | Session + Workspace |
| POST | `/workspaces/:workspaceId/suites` | Session + Workspace + Operator+ |
| PATCH | `/workspaces/:workspaceId/suites/:suiteId` | Session + Workspace + Operator+ |

### GitHub Integration (`/api/v1/workspaces/:workspaceId/suites/:suiteId`)
| Method | Path | Guard |
|---|---|---|
| PUT | `/suites/:suiteId/github-integration` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/github-integration/revalidate` | Session + Workspace + Operator+ |
| DELETE | `/suites/:suiteId/github-integration` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/tests/:testId/artifacts/:artifactId/publish` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/tests/:testId/artifacts/:artifactId/replay` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/github-webhook` | Webhook signature |

### TestRail Integration (`/api/v1/workspaces/:workspaceId/suites/:suiteId`)
| Method | Path | Guard |
|---|---|---|
| PUT | `/suites/:suiteId/testrail-integration` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/testrail-integration/revalidate` | Session + Workspace + Operator+ |
| DELETE | `/suites/:suiteId/testrail-integration` | Session + Workspace + Operator+ |
| PUT | `/suites/:suiteId/testrail-integration/tests/:testId/case-link` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/testrail-integration/sync` | Session + Workspace + Operator+ |
| POST | `/suites/:suiteId/testrail-integration/tests/:testId/retry` | Session + Workspace + Operator+ |

### Usage (`/api/v1`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/usage` | Session + Workspace + Operator+ |
| GET | `/tenants/:tenantId/usage` | Session + Tenant + Admin+ |
| GET | `/tenants/:tenantId` | Session + Tenant + Admin+ |
| PATCH | `/tenants/:tenantId` | Session + Tenant + Admin+ |
| GET | `/tenants/:tenantId/export` | Session + Tenant + Admin+ |
| GET | `/tenants/:tenantId/quotas` | Session + Tenant + Admin+ |
| PATCH | `/tenants/:tenantId/quotas` | Session + Tenant + Admin+ |

### Feedback (`/api/v1/workspaces/:workspaceId`)
| Method | Path | Guard |
|---|---|---|
| GET | `/workspaces/:workspaceId/feedback` | Session + Workspace |
| POST | `/workspaces/:workspaceId/feedback` | Session + Workspace |
| PATCH | `/workspaces/:workspaceId/feedback/:feedbackId` | Session + Workspace + Operator+ |

### Admin (`/api/v1/admin`)
| Method | Path | Guard |
|---|---|---|
| POST | `/admin/retention/cleanup` | Session + Platform Admin |

---

## Enhancement Phase 1 — Suite Domain & External Integrations ✅

All 6 sprints complete. Code review and algorithmic audit passed.

### EP1 Sprint 1 — Suite Schema & Backfill

| Deliverable | Status | Key Files |
|---|---|---|
| AutomationSuite model with rollout stage, slug, defaults | Done | `packages/database/prisma/schema.prisma` |
| Suite CRUD (list, detail, create, update) | Done | `apps/api/src/suites/suites.service.ts`, `suites.controller.ts` |
| Default suite creation per workspace | Done | `apps/api/src/suites/suite-defaults.ts` |
| Backfill script (assign orphaned tests to default suite) | Done | `packages/database/prisma/backfill-automation-suites.ts` |
| Migration: `create_automation_suites` | Done | Sprint 1 migration applied |

### EP1 Sprint 2 — GitHub Integration Base

| Deliverable | Status | Key Files |
|---|---|---|
| GitHubSuiteIntegration model | Done | `packages/database/prisma/schema.prisma` |
| Integration CRUD (upsert, revalidate, delete) | Done | `apps/api/src/github/github-integration.service.ts`, `github-integration.controller.ts` |
| AES-256-GCM secret encryption/decryption | Done | `packages/database/src/secret-crypto.ts` |
| Live GitHub API validation of repo + token | Done | `github-integration.service.ts` |
| Suite GitHub integration UI | Done | `apps/web/src/components/suite-github-integration-client.tsx` |

### EP1 Sprint 3 — GitHub Publication & Webhooks

| Deliverable | Status | Key Files |
|---|---|---|
| GeneratedArtifactPublication model | Done | `packages/database/prisma/schema.prisma` |
| GitHubWebhookDelivery model | Done | Same |
| Artifact publication flow (branch, commit, PR) | Done | `apps/api/src/github/github-publication.service.ts` |
| Webhook ingestion with HMAC-SHA256 verification | Done | Same |
| PR state machine reconciliation (OPEN → MERGED/CLOSED) | Done | Same — `processStoredDelivery()` |
| Idempotent webhook delivery (unique constraint) | Done | Same — `handleIncomingWebhook()` |
| Failed delivery replay | Done | Same — `replayPublication()` |
| Webhook controller | Done | `apps/api/src/github/github-webhook.controller.ts` |

### EP1 Sprint 4 — TestRail Linkage & Sync

| Deliverable | Status | Key Files |
|---|---|---|
| TestRailSuiteIntegration model | Done | `packages/database/prisma/schema.prisma` |
| ExternalTestCaseLink model | Done | Same |
| TestRailSyncRun model | Done | Same |
| Integration CRUD (upsert, revalidate, delete) | Done | `apps/api/src/testrail/testrail-integration.service.ts`, `testrail-integration.controller.ts` |
| Case link upsert/remove | Done | Same |
| Suite-wide sync with per-case error handling | Done | Same — `syncSuite()` |
| Individual case retry | Done | Same — `retryCaseLink()` |
| SSRF protection on baseUrl | Done | Same — `readBaseUrl()` |
| Suite TestRail integration UI | Done | `apps/web/src/components/suite-testrail-integration-client.tsx` |

### EP1 Sprint 5 — Execution Source & Lineage

| Deliverable | Status | Key Files |
|---|---|---|
| ExecutionSourceMode and ExecutionSourceRequestMode enums | Done | `packages/database/prisma/schema.prisma` |
| Execution source resolver (STORAGE_ARTIFACT / PINNED_COMMIT / BRANCH_HEAD) | Done | `apps/api/src/recordings/execution-source-resolver.service.ts` |
| Fallback chain with suite policy + allowStorageExecutionFallback gate | Done | Same |
| Lineage fields on TestRunItem (requestedSourceMode, resolvedCommitSha, etc.) | Done | Schema + run creation |
| Integration with createRun test selection | Done | `apps/api/src/recordings/recordings.service.ts` |

### EP1 Sprint 6 — Rollout Hardening & Operator Experience

| Deliverable | Status | Key Files |
|---|---|---|
| Rollout stage gating (assertPublishingEnabled, assertSyncEnabled, gitExecutionEnabled) | Done | Publication service, TestRail service, execution source resolver |
| Execution policy UI (suite-execution-policy-client) | Done | `apps/web/src/components/suite-execution-policy-client.tsx` |
| Operator rollout controls UI (stage + toggle switches) | Done | `apps/web/src/components/suite-rollout-controls-client.tsx` |
| Audit trail CSV export with BOM | Done | `apps/api/src/audit/audit.service.ts` |
| Audit export error display in UI | Done | `apps/web/src/components/audit-trail-client.tsx` |
| Suite detail page with rollout block + integration stats | Done | `apps/web/src/components/suite-detail-client.tsx` |

### Post-Review Fixes (Code Audit)

| Fix | Severity | File |
|---|---|---|
| SSRF: blocked loopback/metadata in TestRail baseUrl | Medium | `testrail-integration.service.ts` |
| Silent catch: surfaced export error in audit UI | Low | `audit-trail-client.tsx` |
| CSV BOM: added UTF-8 BOM for Excel compatibility | Low | `audit.service.ts` |

---

## What's Next — Post Enhancement Phase 1

Enhancement Phase 1 is complete. Remaining work falls into two categories:

**Enhancement Phase 2 candidates (from Phase 1 non-goals):**

1. TestRail result writeback (push execution outcomes back to TestRail cases)
2. Arbitrary repo targeting at publish time
3. Forced Git-only execution mode (remove storage fallback option)
4. Dense workflow automation (auto-publish on artifact ready, auto-sync on schedule)
5. Broad webhook event subscriptions beyond pull_request

**Hosted infrastructure (from Sprint 10):**

1. enterprise SSO implementation, starting with OIDC
2. MFA rollout, likely TOTP before WebAuthn
3. hosted alerting, dashboards, and paging
4. staged promotion and production release automation
5. DNS, TLS, and domain-level launch work
6. automated hosted cleanup for expired soft-deleted tenants

---

## Known Technical Debt

| Item | Priority | Notes |
|---|---|---|
| Duplicate favicon files | Low | `apps/web/public/favicon.svg` and `apps/web/src/app/icon.svg` are identical; pick one approach |
| Seed script does not delete ad-hoc test data | Low | Integration tests use unique IDs to work around this |
| Package `test` scripts are placeholders | Low | 16/17 packages still have `echo 'no tests yet'`; tests will be added as features land |
| Lint scripts are placeholders | Low | Most packages use `echo 'lint ok'`; real ESLint config needed before beta |
| No git repo initialized | Medium | Should be initialized before any multi-developer work begins |
| TestRail sectionNameSnapshot never updates during sync | Low | `readOptionalString(caseData['section_id'])` always returns undefined because TestRail sends section_id as a number; harmless no-op, preserves existing value |

---

## CI Pipeline

**File:** `.github/workflows/ci.yml`

**Triggers:** Pull requests to `main`, pushes to `main`

**Steps:**
1. Checkout
2. Setup pnpm + Node.js (from `.nvmrc`)
3. `pnpm install --frozen-lockfile`
4. `pnpm db:generate`
5. `pnpm lint`
6. `pnpm typecheck`
7. `pnpm db:migrate:deploy`
8. `pnpm --filter @selora/api test` (with Postgres service container)

---

## Repo Structure

```
selora/
├── .github/workflows/ci.yml
├── apps/
│   ├── api/                    # NestJS API (auth, workspaces, health)
│   │   ├── src/
│   │   │   ├── auth/           # Login, session, verification, reset, guards
│   │   │   ├── workspaces/     # CRUD, memberships, environments, retention
│   │   │   ├── audit/          # Audit event recording + CSV export
│   │   │   ├── suites/         # Automation suite CRUD, defaults, slug
│   │   │   ├── github/         # GitHub integration, publication, webhooks
│   │   │   ├── testrail/       # TestRail integration, case links, sync
│   │   │   ├── recordings/     # Recordings + execution source resolver
│   │   │   ├── common/         # Errors, response helpers, middleware, types
│   │   │   ├── database/       # PrismaService
│   │   │   ├── mail/           # MailerService (SMTP)
│   │   │   ├── bootstrap.ts    # Shared app creation (runtime + test)
│   │   │   ├── main.ts         # Entrypoint
│   │   │   └── app.module.ts   # Root module (throttler, config)
│   │   └── test/               # Security regression tests
│   ├── web/                    # Next.js 15 frontend
│   │   ├── src/app/            # Pages: login, verify, reset, workspace shell
│   │   ├── src/components/     # Forms, settings, suite detail, rollout controls, integrations, audit trail
│   │   └── src/lib/            # API helpers, types, server-session, schemas
│   ├── worker-execution/       # Placeholder — Playwright test runner
│   └── worker-ai-repair/       # Placeholder — AI repair worker
├── packages/
│   ├── database/               # Prisma schema, migrations, seed
│   ├── domain/                 # Placeholder — domain types
│   ├── auth/                   # Placeholder — auth utilities
│   ├── storage/                # Placeholder — S3/MinIO client
│   ├── queue/                  # Placeholder — BullMQ wiring
│   ├── recording-ingest/       # Placeholder — recording parser
│   ├── canonical-tests/        # Placeholder — canonical model
│   ├── test-generator/         # Placeholder — Playwright codegen
│   ├── test-validator/         # Placeholder — preflight validation
│   ├── ai-repair/              # Placeholder — repair logic
│   ├── executor/               # Placeholder — execution orchestration
│   ├── audit/                  # Placeholder — audit utilities
│   └── observability/          # Placeholder — logging/metrics
├── docs/
│   ├── architecture/           # Decision register, auth design, AI policy
│   ├── api/                    # API surface, OpenAPI starter
│   ├── data/                   # Domain schema, Prisma design
│   ├── planning/               # Sprint plans (0–10), delivery plan, CI/CD
│   └── runbooks/               # Onboarding, Docker dev, incidents, secrets
├── docker-compose.yml
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```
