/**
 * Production environment validation.
 * Call at application startup to fail fast on missing critical configuration.
 */

const REQUIRED_IN_PRODUCTION: readonly string[] = [
  'DATABASE_URL',
  'API_SESSION_SECRET',
  'SECRET_ENCRYPTION_KEY',
  'WEB_ORIGIN',
  'REDIS_URL',
];

const RECOMMENDED_IN_PRODUCTION: readonly string[] = [
  'SMTP_HOST',
  'SMTP_FROM',
  'API_PUBLIC_ORIGIN',
  'ARTIFACT_SIGNING_SECRET',
];

export function validateEnvironment() {
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (!isProduction) return;

  const missing: string[] = [];

  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production:\n  ${missing.join('\n  ')}\n` +
        'Set these variables before starting the API in production mode.',
    );
  }

  const warnings: string[] = [];
  for (const key of RECOMMENDED_IN_PRODUCTION) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (warnings.length > 0) {
    // Use stderr so it shows in logs but doesn't break JSON output
    process.stderr.write(
      `[WARN] Recommended environment variables not set: ${warnings.join(', ')}\n`,
    );
  }
}
