import crypto from 'crypto';

let _runtimeDevSecret: string | null = null;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  // Unconditionally refuse in production — a missing secret is not recoverable
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[FATAL] JWT_SECRET environment variable is required in production. Set a 64+ char random hex string.');
  }

  // In development: generate a random secret once per process lifetime so tokens
  // issued before a restart are automatically invalidated (acceptable in dev).
  if (!_runtimeDevSecret) {
    _runtimeDevSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[SECURITY] JWT_SECRET not set. Generated a temporary dev secret (invalidated on restart). Set JWT_SECRET in .env to persist sessions.');
  }
  return _runtimeDevSecret;
}
