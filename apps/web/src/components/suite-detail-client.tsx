'use client';

import Link from 'next/link';
import { SuiteExecutionPolicyClient } from '@/components/suite-execution-policy-client';
import { SuiteGitHubIntegrationClient } from '@/components/suite-github-integration-client';
import { SuiteRolloutControlsClient } from '@/components/suite-rollout-controls-client';
import { SuiteTestRailIntegrationClient } from '@/components/suite-testrail-integration-client';
import type { AutomationSuiteDetail } from '@/lib/types';

export function SuiteDetailClient({
  workspaceId,
  suite,
  canManage,
}: {
  workspaceId: string;
  suite: AutomationSuiteDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-none p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="eyebrow">Suites / {suite.slug}</p>
            <h2 className="section-title text-3xl font-semibold">{suite.name}</h2>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
              {suite.description || 'This suite is the ownership boundary for tests and future external integrations.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="status-pill">{suite.isDefault ? 'DEFAULT SUITE' : suite.status}</span>
            <span className="status-pill">{canManage ? 'MANAGEABLE' : 'VIEW ONLY'}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Canonical tests</p>
            <p className="mt-2 text-2xl font-semibold">{suite.counts.canonicalTests}</p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Artifacts</p>
            <p className="mt-2 text-2xl font-semibold">{suite.counts.generatedArtifacts}</p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">GitHub</p>
            <p className="mt-2 text-sm font-semibold text-black">
              {suite.linkedSystems.github
                ? `${suite.linkedSystems.github.status} · ${suite.linkedSystems.github.repoOwner}/${suite.linkedSystems.github.repoName}`
                : 'Not connected'}
            </p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Source policy</p>
            <p className="mt-2 text-sm font-semibold text-black">{suite.executionPolicy.defaultMode}</p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">Rollout stage</p>
            <p className="mt-2 text-sm font-semibold text-black">{suite.rollout.stage}</p>
          </div>
          <div className="border border-[var(--line)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">TestRail</p>
            <p className="mt-2 text-sm font-semibold text-black">
              {suite.linkedSystems.testrail
                ? `${suite.linkedSystems.testrail.status} · project ${suite.linkedSystems.testrail.projectId}`
                : 'Not connected'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel rounded-none p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Recent tests</p>
              <h3 className="text-xl font-semibold">Suite assignments</h3>
            </div>
            <Link href={`/app/${workspaceId}/tests`} className="secondary-button">
              Open tests
            </Link>
          </div>

          <div className="space-y-3">
            {suite.canonicalTests.length === 0 ? (
              <div className="empty-state">No canonical tests are assigned to this suite yet.</div>
            ) : null}
            {suite.canonicalTests.map((test) => (
              <div key={test.id} className="border border-[var(--line)] bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-base font-semibold">{test.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#999999]">{test.status}</p>
                  </div>
                  <div className="text-right text-[11px] text-[#999999]">
                    {test.latestArtifact ? `Artifact v${test.latestArtifact.version} • ${test.latestArtifact.status}` : 'No generated artifact yet'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <SuiteRolloutControlsClient canManage={canManage} suite={suite} workspaceId={workspaceId} />

          <SuiteExecutionPolicyClient
            canManage={canManage}
            suite={suite}
            workspaceId={workspaceId}
          />

          <SuiteGitHubIntegrationClient
            canManage={canManage}
            initialIntegration={suite.linkedSystems.github}
            suiteId={suite.id}
            workspaceId={workspaceId}
          />

          <SuiteTestRailIntegrationClient
            canManage={canManage}
            suite={suite}
            workspaceId={workspaceId}
          />

          <div className="glass-panel rounded-none p-6">
            <p className="eyebrow">Governance</p>
            <h3 className="text-xl font-semibold">Sprint 6 status</h3>
            <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
              <div className="border border-[var(--line)] bg-white p-4">Rollout controls are now managed per suite, so operators can move from INTERNAL to PILOT to GENERAL without changing code or relying on undocumented toggles.</div>
              <div className="border border-[var(--line)] bg-white p-4">GitHub publication, Git-backed execution, and TestRail sync each have explicit enablement switches. Disabled capabilities fail fast with clear operator-visible errors.</div>
              <div className="border border-[var(--line)] bg-white p-4">Audit export is available from the workspace audit trail so rollout reviews and incident investigations can be handed off without manual copy-paste from the UI.</div>
              <div className="border border-[var(--line)] bg-white p-4">Execution-source policy remains visible here, but rollout gating now makes it possible to stage Git-backed execution separately from publication and external synchronization.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}