/* rebuild trigger */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local for local dev (overrides .env values like DATABASE_URL)
try {
  const envLocal = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  for (const line of envLocal.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = value;
  }
} catch {
  // .env.local not found — use defaults from .env / environment
}

import { createApp } from './bootstrap';

async function bootstrap() {
  const app = await createApp();
  const port = process.env['API_PORT'] ?? 4000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}

bootstrap();
