import type { SeloraConfig, RunSummary } from '../api-client.js';
import type { SeloraYaml } from '../config.js';
import {
  createRun,
  getRun,
  getRunItems,
  listSuites,
  listEnvironments,
  triggerRepair,
} from '../api-client.js';

export interface RunCommandOptions {
  suite?: string;
  environment?: string;
  repair?: boolean;
  maxRepairAttempts?: number;
  pollIntervalSeconds?: number;
  timeoutMinutes?: number;
}

const TERMINAL_STATUSES = new Set([
  'PASSED',
  'FAILED',
  'CANCELED',
  'TIMED_OUT',
]);

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[selora ${ts}] ${msg}`);
}

function logError(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[selora ${ts}] ERROR: ${msg}`);
}

export async function runCommand(
  config: SeloraConfig,
  yaml: SeloraYaml,
  opts: RunCommandOptions,
): Promise<{ exitCode: number }> {
  const suiteName = opts.suite ?? yaml.suite;
  const envName = opts.environment ?? yaml.environment;
  const repairEnabled = opts.repair ?? yaml.repair?.enabled ?? true;
  const maxRepairAttempts = opts.maxRepairAttempts ?? yaml.repair?.max_attempts ?? 2;
  const pollInterval = (opts.pollIntervalSeconds ?? yaml.poll_interval_seconds ?? 15) * 1000;
  const timeoutMs = (opts.timeoutMinutes ?? yaml.timeout_minutes ?? 30) * 60 * 1000;

  // ── Resolve suite ───────────────────────────────────────────────────────────
  if (!suiteName) {
    logError('No suite specified. Use --suite or set "suite" in .selora.yml');
    return { exitCode: 1 };
  }

  log(`Resolving suite "${suiteName}"...`);
  const suites = await listSuites(config);
  const suite = suites.find(
    (s) => s.slug === suiteName || s.name === suiteName || s.id === suiteName,
  );
  if (!suite) {
    logError(`Suite "${suiteName}" not found. Available: ${suites.map((s) => s.slug).join(', ')}`);
    return { exitCode: 1 };
  }

  // ── Resolve environment ─────────────────────────────────────────────────────
  let environmentId: string | undefined;
  if (envName) {
    const envs = await listEnvironments(config);
    const env = envs.find(
      (e) => e.name === envName || e.id === envName,
    );
    if (!env) {
      logError(`Environment "${envName}" not found. Available: ${envs.map((e) => e.name).join(', ')}`);
      return { exitCode: 1 };
    }
    environmentId = env.id;
  }

  // ── Create run ──────────────────────────────────────────────────────────────
  log(`Creating run for suite "${suite.name}"${environmentId ? ` in environment "${envName}"` : ''}...`);
  const run = await createRun(config, {
    suiteId: suite.id,
    environmentId: environmentId ?? '',
  });
  log(`Run created: ${run.id} (${run.totalCount} tests)`);

  // ── Poll for completion ─────────────────────────────────────────────────────
  const deadline = Date.now() + timeoutMs;
  let finalRun = await pollRun(config, run.id, pollInterval, deadline);

  if (!finalRun) {
    logError('Timeout waiting for run completion.');
    return { exitCode: 1 };
  }

  log(`Run ${finalRun.id} finished: ${finalRun.status}`);
  printRunSummary(finalRun);

  // ── Self-heal on failure ────────────────────────────────────────────────────
  if (finalRun.status === 'FAILED' && repairEnabled && maxRepairAttempts > 0) {
    log('Attempting AI self-healing on failed tests...');
    const repaired = await healFailedTests(
      config,
      finalRun.id,
      maxRepairAttempts,
    );

    if (repaired) {
      // Re-run after repair
      log('Re-creating run after repair...');
      const healedRun = await createRun(config, {
        suiteId: suite.id,
        environmentId: environmentId ?? '',
      });
      log(`Healed run created: ${healedRun.id}`);

      finalRun = await pollRun(config, healedRun.id, pollInterval, deadline);
      if (!finalRun) {
        logError('Timeout waiting for healed run completion.');
        return { exitCode: 1 };
      }

      log(`Healed run ${finalRun.id} finished: ${finalRun.status}`);
      printRunSummary(finalRun);
    }
  }

  // ── Exit code ───────────────────────────────────────────────────────────────
  if (finalRun.status === 'PASSED') {
    log('All tests passed.');
    return { exitCode: 0 };
  }

  logError(`Run completed with status: ${finalRun.status}`);
  return { exitCode: 1 };
}

async function pollRun(
  config: SeloraConfig,
  runId: string,
  intervalMs: number,
  deadline: number,
): Promise<RunSummary | null> {
  while (Date.now() < deadline) {
    const run = await getRun(config, runId);
    if (TERMINAL_STATUSES.has(run.status)) {
      return run;
    }
    log(`  Status: ${run.status} (passed=${run.passedCount} failed=${run.failedCount} queued=${run.totalCount - run.passedCount - run.failedCount})`);
    await sleep(intervalMs);
  }
  return null;
}

async function healFailedTests(
  config: SeloraConfig,
  runId: string,
  maxAttempts: number,
): Promise<boolean> {
  const items = await getRunItems(config, runId);
  const failed = items.filter((i) => i.status === 'FAILED');

  if (failed.length === 0) return false;

  log(`Found ${failed.length} failed test(s). Triggering AI repair (max ${maxAttempts} attempt(s))...`);

  let anyRepaired = false;

  for (const item of failed) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log(`  Repairing test ${item.canonicalTestId} (attempt ${attempt}/${maxAttempts})...`);
        const result = await triggerRepair(
          config,
          item.canonicalTestId,
          item.generatedTestArtifactId,
        );
        log(`  Repair result: ${result.status}${result.diffSummary ? ` — ${result.diffSummary}` : ''}`);

        if (result.status === 'RERUN_PASSED' || result.status === 'APPLIED') {
          anyRepaired = true;
          break;
        }
        if (result.status === 'ABANDONED' || result.status === 'HUMAN_REVIEW_REQUIRED') {
          log(`  Skipping further attempts (status: ${result.status})`);
          break;
        }
      } catch (err) {
        logError(`  Repair attempt failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return anyRepaired;
}

function printRunSummary(run: RunSummary) {
  const parts = [
    `passed=${run.passedCount}`,
    `failed=${run.failedCount}`,
    run.timedOutCount > 0 ? `timed_out=${run.timedOutCount}` : null,
    run.canceledCount > 0 ? `canceled=${run.canceledCount}` : null,
    `total=${run.totalCount}`,
  ].filter(Boolean);
  log(`  Summary: ${parts.join(' | ')}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
