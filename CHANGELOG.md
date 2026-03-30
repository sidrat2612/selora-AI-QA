# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-03-30

### Added

- **Recording-first workflow** — Upload Playwright Codegen recordings; AI generates tests automatically
- **AI test generation** — Recordings → versioned canonical tests → executable Playwright code
- **Bounded self-healing** — Rule-based + LLM repair (2-attempt max) with diff storage and full audit trail
- **Test execution engine** — On-demand runs with artifact capture (logs, screenshots, traces, video)
- **GitHub integration** — Auto-publish tests, webhook ingestion, PR lifecycle, secret rotation
- **TestRail integration** — Case mapping, sync dashboard, import from TestRail
- **CLI** — `@selora/cli` for init, run, repair, and sync commands
- **Multi-tenant platform** — 4-role RBAC, full audit trail, usage metering, quota enforcement
- **Platform console** — Admin panel for tenant management, audit logs, usage monitoring
- **Observability dashboard** — Pass rates, run breakdowns, execution metrics, test health, flakiness reports
- **AI Intelligence** — Auto-repair summaries, smart test selection, visual regression detection
- **Progressive rollout** — INTERNAL → PILOT → GENERAL stages with auto-promotion
- **Docker Compose** — 10-service local development stack
- **Terraform** — Full AWS infrastructure (17 .tf files)
- **CI pipeline** — GitHub Actions (typecheck → lint → build)

[0.1.0]: https://github.com/sidrat2612/selora-AI-QA/releases/tag/v0.1.0
