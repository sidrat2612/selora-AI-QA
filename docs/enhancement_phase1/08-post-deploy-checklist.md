# Sprint 6 Post-Deploy Checklist

## Operator Checklist

1. Open the suite detail page and verify the rollout stage is correct.
2. Verify `githubPublishingEnabled`, `gitExecutionEnabled`, and `testRailSyncEnabled` match the intended release state.
3. Run one storage-backed execution to confirm the baseline still works.
4. Run one Git-backed execution and verify requested and resolved lineage values are present.
5. If publication is enabled, publish one READY artifact and confirm webhook reconciliation updates the publication record.
6. If TestRail sync is enabled, run one sync or retry and confirm the latest sync summary is updated.
7. Export the audit trail CSV for the deployment window.

## Exit Criteria

1. No unexplained Git fallback events remain after validation.
2. No failed webhook deliveries are left unreplayed without an owner.
3. No failed TestRail retries are left without an operator note.
4. Audit export is attached to the rollout review or incident record.