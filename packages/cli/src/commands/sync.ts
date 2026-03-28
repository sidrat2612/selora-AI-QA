import type { SeloraConfig } from '../api-client.js';
import type { SeloraYaml } from '../config.js';
import { listSuites, apiRequest } from '../api-client.js';

export interface SyncCommandOptions {
  suite?: string;
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
 * Sync command — pulls test-file mappings and validates local config
 * against the remote workspace.
 */
export async function syncCommand(
  config: SeloraConfig,
  yaml: SeloraYaml,
  opts: SyncCommandOptions,
): Promise<{ exitCode: number }> {
  const suiteName = opts.suite ?? yaml.suite;

  log('Syncing with Selora workspace...');

  // 1. Verify connectivity
  try {
    await apiRequest<unknown>(config, 'GET', `/workspaces/${config.workspaceId}`);
    log('Workspace connection verified.');
  } catch (err) {
    logError(`Cannot reach workspace: ${err instanceof Error ? err.message : String(err)}`);
    return { exitCode: 1 };
  }

  // 2. List suites
  const suites = await listSuites(config);
  log(`Found ${suites.length} suite(s): ${suites.map((s) => s.slug).join(', ')}`);

  // 3. If suite is specified, pull smart-selection mappings
  if (suiteName) {
    const suite = suites.find(
      (s) => s.slug === suiteName || s.name === suiteName || s.id === suiteName,
    );
    if (!suite) {
      logError(`Suite "${suiteName}" not found.`);
      return { exitCode: 1 };
    }

    log(`Syncing mappings for suite "${suite.name}"...`);
    const mappings = await apiRequest<{ id: string; filePattern: string; canonicalTestId: string }[]>(
      config,
      'GET',
      `/workspaces/${config.workspaceId}/smart-selection/mappings`,
    );

    log(`  ${mappings.length} test-file mapping(s) synced.`);
  }

  // 4. List environments
  const environments = await apiRequest<{ id: string; name: string }[]>(
    config,
    'GET',
    `/workspaces/${config.workspaceId}/environments`,
  );
  log(`Found ${environments.length} environment(s): ${environments.map((e) => e.name).join(', ')}`);

  log('Sync complete.');
  return { exitCode: 0 };
}
