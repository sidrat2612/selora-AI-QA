import type { SeloraConfig } from '../api-client.js';
import type { SeloraYaml } from '../config.js';
import {
  listSuites,
  getRunItems,
  triggerRepair,
  apiRequest,
} from '../api-client.js';

export interface RepairCommandOptions {
  suite?: string;
  runId?: string;
  testId?: string;
  maxAttempts?: number;
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[selora ${ts}] ${msg}`);
}

function logError(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[selora ${ts}] ERROR: ${msg}`);
}

/**
 * Standalone repair command — triggers AI self-healing on failed tests
 * from a specific run or for a specific test.
 */
export async function repairCommand(
  config: SeloraConfig,
  yaml: SeloraYaml,
  opts: RepairCommandOptions,
): Promise<{ exitCode: number }> {
  const maxAttempts = opts.maxAttempts ?? yaml.repair?.max_attempts ?? 2;

  // If a specific testId is given, repair that test's latest artifact
  if (opts.testId) {
    log(`Repairing test "${opts.testId}"...`);
    try {
      // Get latest artifact for this test
      const test = await apiRequest<{
        id: string;
        generatedArtifacts?: { id: string; status: string }[];
      }>(
        config,
        'GET',
        `/workspaces/${config.workspaceId}/tests/${opts.testId}`,
      );

      const artifact = test.generatedArtifacts?.[0];
      if (!artifact) {
        logError('No generated artifact found for this test.');
        return { exitCode: 1 };
      }

      const result = await triggerRepair(config, opts.testId, artifact.id);
      log(`Repair result: ${result.status}${result.diffSummary ? ` — ${result.diffSummary}` : ''}`);
      return { exitCode: result.status === 'RERUN_PASSED' || result.status === 'APPLIED' ? 0 : 1 };
    } catch (err) {
      logError(`Repair failed: ${err instanceof Error ? err.message : String(err)}`);
      return { exitCode: 1 };
    }
  }

  // If a runId is given, repair all failed tests from that run
  if (opts.runId) {
    return repairRunFailures(config, opts.runId, maxAttempts);
  }

  // Otherwise, resolve the latest run for the suite
  const suiteName = opts.suite ?? yaml.suite;
  if (!suiteName) {
    logError('No suite or run specified. Use --suite, --run-id, or --test-id.');
    return { exitCode: 1 };
  }

  log(`Resolving suite "${suiteName}"...`);
  const suites = await listSuites(config);
  const suite = suites.find(
    (s) => s.slug === suiteName || s.name === suiteName || s.id === suiteName,
  );
  if (!suite) {
    logError(`Suite "${suiteName}" not found.`);
    return { exitCode: 1 };
  }

  // Get latest run for suite
  const runs = await apiRequest<{ id: string; status: string }[]>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/runs?suiteId=${suite.id}&limit=1`,
  );
  const latestRun = Array.isArray(runs) ? runs[0] : undefined;
  if (!latestRun) {
    logError('No runs found for this suite.');
    return { exitCode: 1 };
  }

  log(`Found latest run: ${latestRun.id} (status: ${latestRun.status})`);
  return repairRunFailures(config, latestRun.id, maxAttempts);
}

async function repairRunFailures(
  config: SeloraConfig,
  runId: string,
  maxAttempts: number,
): Promise<{ exitCode: number }> {
  const items = await getRunItems(config, runId);
  const failed = items.filter((i) => i.status === 'FAILED');

  if (failed.length === 0) {
    log('No failed tests found in this run.');
    return { exitCode: 0 };
  }

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

  if (anyRepaired) {
    log('Some tests were repaired successfully.');
    return { exitCode: 0 };
  }

  logError('No tests could be repaired.');
  return { exitCode: 1 };
}
