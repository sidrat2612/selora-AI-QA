#!/usr/bin/env node

import { loadConfig } from './config.js';
import { runCommand } from './commands/run.js';
import { repairCommand } from './commands/repair.js';
import { syncCommand } from './commands/sync.js';
import { initProject } from './index.js';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
Selora QA CLI — Run and self-heal tests in CI

USAGE
  selora <command> [options]

COMMANDS
  run           Trigger a test run, poll for results, and optionally self-heal
  repair        Trigger AI self-healing on failed tests
  sync          Sync local config with the remote workspace
  init          Generate a .selora.yml config file
  help          Show this help message

RUN OPTIONS
  --suite <name>          Suite slug, name, or ID
  --environment <name>    Target environment name or ID
  --repair                Enable AI self-healing (default: true)
  --no-repair             Disable AI self-healing
  --max-repair-attempts   Max repair attempts per test (default: 2)
  --poll-interval         Poll interval in seconds (default: 15)
  --timeout               Timeout in minutes (default: 30)

REPAIR OPTIONS
  --suite <name>          Suite slug (uses latest run)
  --run-id <id>           Specific run ID to repair failures from
  --test-id <id>          Specific test ID to repair
  --max-attempts          Max repair attempts per test (default: 2)

SYNC OPTIONS
  --suite <name>          Suite to sync mappings for

ENVIRONMENT VARIABLES
  SELORA_API_URL          Selora API base URL
  SELORA_API_KEY          API authentication key
  SELORA_WORKSPACE_ID     Target workspace ID

CONFIG FILE
  .selora.yml in the project root (values can be overridden by env vars and flags)
`);
}

async function main() {
  try {
    switch (command) {
      case 'run': {
        const flags = parseFlags(args.slice(1));
        const { config, yaml } = loadConfig(process.cwd());
        const result = await runCommand(config, yaml, {
          suite: typeof flags['suite'] === 'string' ? flags['suite'] : undefined,
          environment:
            typeof flags['environment'] === 'string'
              ? flags['environment']
              : undefined,
          repair: flags['no-repair'] === true ? false : flags['repair'] !== false,
          maxRepairAttempts:
            typeof flags['max-repair-attempts'] === 'string'
              ? parseInt(flags['max-repair-attempts'], 10)
              : undefined,
          pollIntervalSeconds:
            typeof flags['poll-interval'] === 'string'
              ? parseInt(flags['poll-interval'], 10)
              : undefined,
          timeoutMinutes:
            typeof flags['timeout'] === 'string'
              ? parseInt(flags['timeout'], 10)
              : undefined,
        });
        process.exit(result.exitCode);
        break;
      }
      case 'init': {
        const dest = resolve(process.cwd(), '.selora.yml');
        if (existsSync(dest)) {
          console.error('.selora.yml already exists. Remove it first to re-initialize.');
          process.exit(1);
        }
        const content = await initProject(process.cwd());
        writeFileSync(dest, content, 'utf-8');
        console.log('Created .selora.yml — edit it with your workspace settings.');
        break;
      }
      case 'repair': {
        const flags = parseFlags(args.slice(1));
        const { config, yaml } = loadConfig(process.cwd());
        const result = await repairCommand(config, yaml, {
          suite: typeof flags['suite'] === 'string' ? flags['suite'] : undefined,
          runId: typeof flags['run-id'] === 'string' ? flags['run-id'] : undefined,
          testId: typeof flags['test-id'] === 'string' ? flags['test-id'] : undefined,
          maxAttempts:
            typeof flags['max-attempts'] === 'string'
              ? parseInt(flags['max-attempts'], 10)
              : undefined,
        });
        process.exit(result.exitCode);
        break;
      }
      case 'sync': {
        const flags = parseFlags(args.slice(1));
        const { config, yaml } = loadConfig(process.cwd());
        const result = await syncCommand(config, yaml, {
          suite: typeof flags['suite'] === 'string' ? flags['suite'] : undefined,
        });
        process.exit(result.exitCode);
        break;
      }
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(
      `Fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();
