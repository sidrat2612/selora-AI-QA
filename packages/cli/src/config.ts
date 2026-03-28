import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeloraConfig } from './api-client.js';

export interface SeloraYaml {
  api_url?: string;
  workspace_id?: string;
  suite?: string;
  environment?: string;
  repair?: {
    enabled?: boolean;
    max_attempts?: number;
  };
  poll_interval_seconds?: number;
  timeout_minutes?: number;
}

/**
 * Minimal YAML parser for flat key: value pairs and one-level nesting.
 * Avoids adding a YAML dependency — the .selora.yml file is intentionally simple.
 */
function parseSimpleYaml(text: string): SeloraYaml {
  const result: Record<string, unknown> = {};
  let currentBlock: string | null = null;
  const blockObj: Record<string, unknown> = {};

  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (line.trim().length === 0) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0 && line.includes(':')) {
      // flush previous block
      if (currentBlock) {
        result[currentBlock] = { ...blockObj };
        for (const k of Object.keys(blockObj)) delete blockObj[k];
      }

      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (val.length === 0) {
        currentBlock = key;
      } else {
        currentBlock = null;
        result[key] = coerceValue(val);
      }
    } else if (indent > 0 && currentBlock && line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      blockObj[key] = coerceValue(val);
    }
  }

  if (currentBlock) {
    result[currentBlock] = { ...blockObj };
  }

  return result as unknown as SeloraYaml;
}

function coerceValue(v: string): string | number | boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  if (!Number.isNaN(n) && v.length > 0) return n;
  // Strip quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function loadConfig(cwd: string): {
  config: SeloraConfig;
  yaml: SeloraYaml;
} {
  // 1. Try .selora.yml in cwd
  const yamlPath = resolve(cwd, '.selora.yml');
  let yaml: SeloraYaml = {};
  if (existsSync(yamlPath)) {
    yaml = parseSimpleYaml(readFileSync(yamlPath, 'utf-8'));
  }

  // 2. Environment variables override yaml
  const apiUrl =
    process.env['SELORA_API_URL'] ?? yaml.api_url ?? '';
  const apiKey = process.env['SELORA_API_KEY'] ?? '';
  const workspaceId =
    process.env['SELORA_WORKSPACE_ID'] ?? yaml.workspace_id ?? '';

  if (!apiUrl) {
    throw new Error(
      'Missing SELORA_API_URL. Set it in your environment or in .selora.yml (api_url).',
    );
  }
  if (!apiKey) {
    throw new Error(
      'Missing SELORA_API_KEY. Set it as an environment variable.',
    );
  }
  if (!workspaceId) {
    throw new Error(
      'Missing SELORA_WORKSPACE_ID. Set it in your environment or in .selora.yml (workspace_id).',
    );
  }

  return {
    config: { apiUrl, apiKey, workspaceId },
    yaml,
  };
}
