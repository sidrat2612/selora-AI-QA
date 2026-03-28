import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function resolveSecretKey() {
  const configuredKey =
    process.env['SECRET_ENCRYPTION_KEY'] ??
    process.env['API_SESSION_SECRET'];

  if (!configuredKey) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('SECRET_ENCRYPTION_KEY or API_SESSION_SECRET must be set in production.');
    }
    // Development-only fallback — will not run in production
    return createHash('sha256').update('selora-dev-secret-encryption-key', 'utf8').digest();
  }

  return createHash('sha256').update(configuredKey, 'utf8').digest();
}

export function encryptSecretValue(secretValue: string) {
  const key = resolveSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secretValue, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

export function decryptSecretValue(payload: string) {
  const parsed = JSON.parse(payload) as {
    version?: number;
    algorithm?: string;
    iv?: string;
    tag?: string;
    ciphertext?: string;
  };

  if (
    parsed.version !== 1 ||
    parsed.algorithm !== 'aes-256-gcm' ||
    !parsed.iv ||
    !parsed.tag ||
    !parsed.ciphertext
  ) {
    throw new Error('Encrypted secret payload is invalid.');
  }

  const decipher = createDecipheriv('aes-256-gcm', resolveSecretKey(), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}