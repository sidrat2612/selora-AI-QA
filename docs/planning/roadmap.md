# Selora — Master Roadmap

> Last updated: 2026-03-25 · Source of truth for pending work and future phases

---

## How to Read This Document

This roadmap organizes all pending and future work into **phases**, each containing discrete **work items**. Items marked ✅ are complete. Items marked ⏳ have partial implementation (schema/stubs exist but business logic is pending). Items marked 📋 are planned with specs. Items marked 💡 are proposed but not yet specified.

---

## Phase 0: Foundation (Complete)

Everything from Sprints 0–10 is delivered and working. See [STATUS.md](../STATUS.md) for the full inventory.

| Area | Status |
|------|--------|
| Monorepo + Docker development stack | ✅ Complete |
| Custom auth (email/password, sessions, verification, reset) | ✅ Complete |
| Four-role model (PLATFORM_ADMIN, TENANT_ADMIN, TENANT_OPERATOR, TENANT_VIEWER) | ✅ Complete |
| Two-app split (Console for platform admin, Core for tenant users) | ✅ Complete |
| Recording ingestion → AI canonicalization → test generation → validation → AI repair | ✅ Complete |
| Run execution with Playwright, artifact capture, cancellation | ✅ Complete |
| Audit, metering, retention, quotas, license enforcement | ✅ Complete |
| Feedback, environments, workspace/tenant CRUD | ✅ Complete |
| Observability, health checks, backup/recovery | ✅ Complete |
| Tenant lifecycle (suspend, archive, soft-delete, export) | ✅ Complete |
| SLOs, error budgets, operator runbooks | ✅ Complete |
| Performance baseline (all p95 < 200ms) | ✅ Complete |

---

## Phase 1: Four-Role Auth Alignment (Complete)

**Goal**: Ensure the four-role model is fully enforced end-to-end — not just at the UI boundary but in every API endpoint, guard, seed, and migration.

**Status**: ✅ **Completed 2026-03-24**. Enum renamed to TENANT_OPERATOR/TENANT_VIEWER. All endpoints audited for @RequireRoles. computePermissions aligned. Seed includes all 4 roles. Console API client cleaned up.

| # | Item | Status | Summary |
|---|------|--------|---------|
| 1.1 | Resolve enum naming | ✅ Complete | Renamed to TENANT_OPERATOR/TENANT_VIEWER via Prisma migration |
| 1.2 | Audit all API endpoints for @RequireRoles | ✅ Complete | Every controller verified with explicit role requirements |
| 1.3 | Verify computePermissions alignment | ✅ Complete | PLATFORM_ADMIN narrowing confirmed intentional |
| 1.4 | Update seed script | ✅ Complete | Seed creates users for all four roles |
| 1.5 | Core frontend permission gating | ✅ Complete | Action buttons/forms gated by permission flags |
| 1.6 | Console API client cleanup | ✅ Complete | Dead sections removed |
| 1.7 | Role-based regression tests | ✅ Complete | Playwright regression specs added |

---

## Phase 2: Enhancement Phase 1 — Suite & Integration Business Logic (Complete)

**Goal**: Implement the full business logic for AutomationSuite management, GitHub publishing, TestRail sync, and Git-backed execution.

**Status**: ✅ **Completed 2026-03-25**. All suite management, integration UI, rollout automation, and observability work delivered.

### 2A. Suite Management (EP1 Sprint 1)

| # | Item | Status | Details |
|---|------|--------|---------|
| 2A.1 | Suite CRUD API | ✅ Complete | Full create/update/archive with validation. screenshotPolicy field exposed. |
| 2A.2 | Test-to-suite assignment | ✅ Complete | Bulk assign/unassign API endpoints + frontend client |
| 2A.3 | Default suite backfill | ✅ Complete | Migration script: auto-creates default suite per workspace, reassigns orphaned tests |
| 2A.4 | Archive cascade rules | ✅ Complete | Archive suite → unassign tests, disconnect integrations, cancel queued runs |
| 2A.5 | Suite RBAC | ✅ Complete | Enforced via @RequireRoles on all endpoints |
| 2A.6 | Suite UI (Core) | ✅ Complete | Suite list/detail pages, test case list/detail/create/edit UI |
| 2A.7 | Audit events | ✅ Complete | All suite/test/integration lifecycle events audited |
| 2A.8 | Business test case CRUD | ✅ Complete | Full CRUD API (create, list, get, update, archive). Prisma migration applied. |
| 2A.9 | Test case script mappings | ✅ Complete | Link business test cases to canonical tests. CRUD endpoints. |
| 2A.10 | Test case results model | ✅ Complete | TestCaseResult with verdict enum (PASSED/FAILED/BLOCKED/SKIPPED/NOT_RUN). |
| 2A.11 | TestRail case import | ✅ Complete | POST import-test-cases endpoint for bulk import from TestRail. |

### 2B. GitHub Integration (EP1 Sprints 2–3)

| # | Item | Status | Details |
|---|------|--------|---------|
| 2B.1 | GitHub credential validation | ✅ Complete | Full App + PAT validation flow with revalidation endpoint |
| 2B.2 | Repository allowlist | ✅ Complete | Schema, CRUD API, frontend client |
| 2B.3 | Publication orchestration | ✅ Complete | Full lifecycle with advisory-lock concurrency, retry logic, auto-publish on validation/repair |
| 2B.4 | Deterministic branch pattern | ✅ Complete | `selora/{suiteSlug}/{canonicalTestId}/v{artifactVersion}` |
| 2B.5 | Webhook ingress & HMAC verification | ✅ Complete | HMAC-SHA256 verification, idempotent deliveryId processing |
| 2B.6 | Webhook reconciliation | ✅ Complete | PR lifecycle state machine (opened/synchronized/closed/merged) |
| 2B.7 | Secret rotation | ✅ Complete | API endpoint + UI flow (non-destructive rotation with audit) |
| 2B.8 | Delivery replay | ✅ Complete | Replay failed webhook deliveries via API + UI |
| 2B.9 | Publication UI | ✅ Complete | Status cards, delivery history, replay/rotation actions |
| 2B.10 | Retry policy | ✅ Complete | 3-attempt exponential backoff, distinguishes retryable vs non-retryable |

### 2C. TestRail Integration (EP1 Sprint 4)

| # | Item | Status | Details |
|---|------|--------|---------|
| 2C.1 | TestRail credential validation | ✅ Complete | Validates instance URL + project access |
| 2C.2 | Case mapping | ✅ Complete | Upsert case link API (PATCH testrail-links/:testId), frontend editor |
| 2C.3 | Sync orchestration | ✅ Complete | Manual sync with partial-failure isolation, sync run tracking |
| 2C.4 | Mapping editor UI | ✅ Complete | TestRail Mapping tab on TestCaseDetail: add/edit/remove links, status, error display |
| 2C.5 | Sync status dashboard | ✅ Complete | Sync history, latest run status, failure counts in TestRailIntegration component |

### 2D. Git-Backed Execution (EP1 Sprint 5)

| # | Item | Status | Details |
|---|------|--------|---------|
| 2D.1 | Source resolver service | ✅ Complete | Handles SUITE_DEFAULT, PINNED_COMMIT, BRANCH_HEAD with storage fallback |
| 2D.2 | Lineage persistence | ✅ Complete | Resolved source, git ref, commit SHA, repo, file path persisted per run item |
| 2D.3 | Storage fallback | ✅ Complete | Graceful fallback to storage-backed execution when Git resolution fails |
| 2D.4 | Execution policy CRUD | ✅ Complete | Suite-level execution policy settings wired to frontend |
| 2D.5 | Run creation UI updates | ✅ Complete | Source mode selector on CreateRunDialog, lineage tab on RunDetail |
| 2D.6 | Feature flag gating | ✅ Complete | Per-suite feature flags + RolloutControls UI |

### 2E. Rollout & Hardening (EP1 Sprint 6)

| # | Item | Status | Details |
|---|------|--------|---------|
| 2E.1 | Feature flag strategy | ✅ Complete | Per-tenant flags (githubPublishing, gitExecution, testRailSync, maxRolloutStage) on Tenant model + API |
| 2E.2 | Progressive rollout | ✅ Complete | Hourly cron: INTERNAL → PILOT → GENERAL auto-promotion based on pass rate, run count, failure recency |
| 2E.3 | Operator dashboards | ✅ Complete | Observability section on Dashboard: pass rate gauge, run breakdown, execution metrics |
| 2E.4 | UX polish | ✅ Complete | Empty states, disabled states, enriched data displays throughout |
| 2E.5 | Security review | ✅ Complete | Secret rotation audited, credential masking, RBAC enforced |
| 2E.6 | Incident runbooks | ✅ Complete | EP1-specific procedures documented |

---

## Phase 3: Enterprise Auth (Assessed, Not Started)

**Goal**: Add enterprise-grade authentication for hosted deployment.

**Assessment source**: [reports/sprint-10-local-ops-readiness.md](../reports/sprint-10-local-ops-readiness.md)

### Recommended implementation order:

| # | Item | Effort | Details |
|---|------|--------|---------|
| 3.1 | **OIDC SSO** | L | Best fit for modern SaaS; aligns with session-cookie architecture. Add OIDC provider configuration per tenant. |
| 3.2 | **TOTP MFA** | M | Low-friction baseline MFA. Adds TOTP setup flow, QR code, backup codes, enforcement toggle per tenant. |
| 3.3 | **WebAuthn MFA** | M | Strongest long-term posture. Add passkey registration, challenge/response flow. |
| 3.4 | **SAML 2.0** | L | Only if design partner explicitly requires. Higher complexity, XML assertion handling. |

### Prerequisites:
- Phase 1 (auth alignment) must be complete
- Hosted deployment infrastructure must be available
- Tenant-level auth policy controls needed

---

## Phase 4: Hosted Deployment (Not Started)

**Goal**: Move from local Docker to production-hosted infrastructure.

| # | Item | Effort | Details |
|---|------|--------|---------|
| 4.1 | **Managed PostgreSQL** | M | RDS or equivalent; automated backups, point-in-time recovery |
| 4.2 | **Managed Redis** | S | ElastiCache or equivalent |
| 4.3 | **S3 object storage** | S | Replace MinIO with S3 |
| 4.4 | **Container orchestration** | L | Kubernetes or ECS for api, workers, frontends |
| 4.5 | **Worker autoscaling** | M | Scale execution workers based on queue depth |
| 4.6 | **WAF & edge security** | M | Bot management, DDoS protection, rate limiting at edge |
| 4.7 | **External secret manager** | M | HashiCorp Vault or AWS Secrets Manager, rotation workflows |
| 4.8 | **SIEM & alerting** | M | Audit log forwarding, anomaly detection, PagerDuty/Opsgenie |
| 4.9 | **Multi-region evaluation** | L | Cross-region replication and failover assessment |
| 4.10 | **CI/CD pipeline hardening** | M | Image scanning, migration validation, canary deploys |
| 4.11 | **Custom domain per tenant** | M | Tenant-specific URLs and SSL certificates |

---

## Phase 5: Product Expansion (Future)

**Goal**: Expand platform capabilities based on design partner feedback and market needs.

| # | Item | Category | Details |
|---|------|----------|---------|
| 5.1 | **Scheduled runs** | Automation | Cron-based run scheduling per environment |
| 5.2 | **Webhook-triggered runs** | Automation | GitHub/CI webhook triggers test execution |
| 5.3 | **Run comparison & analytics** | Insights | Historical trend analysis, flaky test detection |
| 5.4 | **Email notifications** | Communication | Run completion, failure alerts, membership invites |
| 5.5 | **WebSocket live updates** | UX | Replace polling with real-time run status, test progress |
| 5.6 | **Custom helper support** | Ingestion | Parse and support custom Playwright helper functions |
| 5.7 | **Approval workflows** | Governance | Require approval before publishing repaired tests |
| 5.8 | **Compliance retention** | Data | Legal hold support, compliance-tier retention packages |
| 5.9 | **API tokens** | Integration | Programmatic access via API keys (in addition to session auth) |
| 5.10 | **Tenant self-service** | Onboarding | Public signup with email verification (currently invite-only) |

---

## Documentation Maintenance Tracker

These docs need periodic review as implementation progresses:

| Document | Last Updated | Needs Refresh When |
|----------|-------------|-------------------|
| [STATUS.md](../STATUS.md) | 2026-03-24 | After each phase/milestone completion |
| [api/mvp-api-surface.md](../api/mvp-api-surface.md) | 2026-03-24 | After new endpoints are added |
| [architecture/auth-session-design.md](../architecture/auth-session-design.md) | 2026-03-24 | After auth alignment (Phase 1) or enterprise auth (Phase 3) |
| [data/prisma-data-design.md](../data/prisma-data-design.md) | 2026-03-24 | After enum rename migration |
| [selora-core-implementation-spec.md](../selora-core-implementation-spec.md) | 2026-03-24 | After EP1 UI implementation |
| [selora-console-implementation-spec.md](../selora-console-implementation-spec.md) | 2026-03-24 | After console cleanup or new governance features |
| [runbooks/contributor-onboarding.md](../runbooks/contributor-onboarding.md) | 2026-03-24 | After repo structure changes |
| [runbooks/docker-development.md](../runbooks/docker-development.md) | 2026-03-24 | After Docker Compose changes |
| [runbooks/docker-release-checklist.md](../runbooks/docker-release-checklist.md) | 2026-03-24 | After release process changes |

### Stale Historical Docs (preserved for reference)

These contain historical planning context and should not be treated as current specifications:

| Document | Staleness Note |
|----------|---------------|
| `planning/sprint-0.md` through `sprint-10.md` | Historical sprint plans. All complete. Role references may use old naming. |
| `api/openapi-starter.md` | Uses `workspace_operator/viewer` naming. Still useful for response schema reference. |
| `enhancement_phase1/` (all files) | Implementation specs are current but missing role-gating matrices. Add RBAC before EP1 coding begins. |
| `planning/github-testrail-git-execution-plan.md` | Good reference for integration design; lacks role-based access definitions. |
| `planning/webhook-operator-ui-design.md` | Design spec pending Pencil tool restoration. |

---

## Decision Dependencies

Work items that are **blocked** until specific decisions are made:

| Blocked Item | Blocked On | Decision Owner |
|-------------|-----------|----------------|
| Phase 1 items 1.1–1.4 | Enum naming + migration strategy | Engineering lead |
| Phase 1 item 1.5 | TENANT_ADMIN workspace scope | Product owner |
| Phase 2 all items | Phase 1 completion | — |
| Phase 2B (GitHub) | GitHub App vs PAT default mode | Product + Security |
| Phase 2D (Git execution) | Branch-head role restrictions | Product owner |
| Phase 3 (Enterprise auth) | Hosted deployment readiness + partner demand | Product owner |
| Phase 4 (Hosted) | Infrastructure budget + provider selection | Engineering lead |
