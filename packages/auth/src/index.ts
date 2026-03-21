// @selora/auth — Authentication and authorization utilities

import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

export const AUTH_CONFIG = {
  SALT_ROUNDS: 12,
  SESSION_TTL_SECONDS: 60 * 60 * 24,
  SESSION_IDLE_TTL_SECONDS: 60 * 60 * 8,
  EMAIL_VERIFICATION_TTL_SECONDS: 60 * 60 * 24,
  PASSWORD_RESET_TTL_SECONDS: 60 * 60,
  MIN_PASSWORD_LENGTH: 10,
} as const;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);
  return bcrypt.hash(password, AUTH_CONFIG.SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function assertPasswordStrength(password: string): void {
  if (password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} characters long.`,
    );
  }
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createExpiryDate(ttlSeconds: number, now = new Date()): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}
