# Selora — AI-Powered QA for Faster Releases

Selora is a QA automation platform that turns browser recordings into reliable, self-healing tests — no scripting required.

Teams record their workflows using Playwright, and Selora takes it from there: generating tests, validating them, and automatically repairing failures using bounded AI. The result is a faster path from "recorded a flow" to "tests running in CI," with full visibility into what was generated, what changed, and why.

## Who It's For

Selora is built for engineering and QA teams who want to ship faster without sacrificing test coverage. Whether you're a QA engineer maintaining a large regression suite or an engineering lead looking to reduce manual testing overhead, Selora helps your team move confidently from recording to execution.

## What It Does

- **Recording-first workflow** — Import browser recordings and let Selora handle the rest. No hand-written test code needed.
- **AI-powered test generation** — Recordings are automatically converted into structured, executable tests with full source traceability.
- **Bounded self-healing** — When tests break due to UI changes, Selora's AI attempts automatic repair within strict limits, preventing runaway fixes.
- **Runs & results at a glance** — Execute tests on demand, review results, inspect captured artifacts, and drill into failures — all from a single dashboard.
- **GitHub integration** — Link test suites to GitHub repositories, sync test results with pull requests, and keep your QA workflow connected to your development process.
- **TestRail integration** — Push test results and run data directly into TestRail for teams that rely on it for test management and reporting.
- **Multi-tenant by design** — Organize teams into tenants and workspaces with environment-level configuration and secrets management.
- **Platform governance** — A dedicated admin console for overseeing tenants, auditing activity, and managing quotas across the platform.

## User Roles

Selora supports four levels of access to match how teams actually work:

| Role | Purpose |
|------|---------|
| **Selora Admin** | Platform-wide operations, tenant oversight, and compliance monitoring |
| **Company Admin** | Manage team members, configure workspace settings, and govern test lifecycle |
| **Operator** | Author tests, trigger runs, upload recordings, and manage day-to-day QA work |
| **Viewer** | Read-only access to dashboards, test results, and audit trails |

## Project Structure

Selora is organized as a monorepo with two frontend applications and a shared backend:

- **Core App** — The main workspace where teams manage recordings, tests, runs, and settings.
- **Console App** — The platform administration interface for Selora Admins to manage tenants and monitor platform health.
- **API** — The backend powering both applications with authentication, authorization, and all business logic.

## License

Proprietary. All rights reserved.

See the `LICENSE` file at the root of this repository for the full license terms.
