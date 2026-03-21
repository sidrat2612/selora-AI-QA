# Sprint 6 Rollout Runbook

## Scope

Use this runbook when enabling Sprint 6 capabilities for a suite:

- GitHub publication and webhook replay
- Git-backed execution
- TestRail sync and retry
- Audit export for operator review

## Pre-flight

1. Confirm the suite is still functional with storage-backed execution.
2. Validate the GitHub integration and confirm webhook delivery health is stable.
3. Validate the TestRail integration and confirm mapped cases are present.
4. Open the suite detail page and confirm the current rollout stage and toggle values.
5. Export the current audit trail for the suite workspace to establish a baseline.

## Stage Progression

### INTERNAL

- Keep rollout stage at `INTERNAL` while validating configuration and fallback behavior.
- Enable `gitExecutionEnabled` first if lineage validation is the immediate goal.
- Leave `githubPublishingEnabled` and `testRailSyncEnabled` off until the external integrations have been validated end to end.

### PILOT

- Move the suite to `PILOT` after at least one successful Git-backed run.
- Enable `githubPublishingEnabled` only after publication and webhook reconciliation both succeed.
- Enable `testRailSyncEnabled` only after a dry-run style sync shows acceptable error rates.
- Export audit events after each change and retain the file for operator handoff.

### GENERAL

- Move to `GENERAL` only after the pilot window completes without unresolved webhook or sync failures.
- Keep storage fallback enabled unless the suite has proven it can tolerate hard Git failures.
- Review the audit export for repeated replay, fallback, or retry events before announcing general availability.

## Rollback

1. Disable the specific capability toggle that is failing.
2. If Git-backed runs are unstable, keep execution policy on `STORAGE_ARTIFACT` or retain fallback.
3. If publication is unstable, disable `githubPublishingEnabled` and reconcile pending webhook failures later.
4. If TestRail synchronization is unstable, disable `testRailSyncEnabled` and preserve manual case mapping.
5. Export the audit trail immediately after rollback so the incident timeline is preserved.

## Evidence To Capture

- One successful Git-backed run with lineage visible in run details
- One successful publication with reconciled webhook delivery
- One successful TestRail sync or retry
- One audit CSV export covering the rollout window