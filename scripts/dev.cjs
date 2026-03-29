const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const file = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of file.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value;
  }

  return env;
}

const repoRoot = path.resolve(__dirname, '..');
const localEnv = loadEnvFile(path.join(repoRoot, '.env.local'));
const env = {
  ...localEnv,
  ...process.env,
};

const child = spawn('pnpm', ['exec', 'turbo', 'run', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});