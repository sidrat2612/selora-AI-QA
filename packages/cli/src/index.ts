import { loadConfig, type SeloraYaml } from './config.js';
import { listSuites, listEnvironments } from './api-client.js';

export { loadConfig } from './config.js';
export type { SeloraConfig } from './api-client.js';
export type { SeloraYaml } from './config.js';
export { runCommand, type RunCommandOptions } from './commands/run.js';
export { repairCommand, type RepairCommandOptions } from './commands/repair.js';
export { syncCommand, type SyncCommandOptions } from './commands/sync.js';
export { apiRequest, ApiError } from './api-client.js';

export async function initProject(cwd: string): Promise<string> {
  const template = `# Selora QA Configuration
# See https://docs.selora.dev/ci-integration for details.

# api_url: https://api.selora.dev/api/v1
# workspace_id: your-workspace-id

# Suite to run (slug or name)
# suite: my-suite

# Target environment
# environment: staging

# AI self-healing on failure
repair:
  enabled: true
  max_attempts: 2

# Polling settings
poll_interval_seconds: 15
timeout_minutes: 30
`;
  return template;
}

export async function listAvailableTargets(cwd: string): Promise<{
  suites: Array<{ id: string; name: string; slug: string }>;
  environments: Array<{ id: string; name: string }>;
}> {
  const { config } = loadConfig(cwd);
  const [suites, environments] = await Promise.all([
    listSuites(config),
    listEnvironments(config),
  ]);
  return { suites, environments };
}
