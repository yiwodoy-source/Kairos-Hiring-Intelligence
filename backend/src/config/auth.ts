const DEV_JWT_SECRET = 'dev-only-nexus-hr-secret-change-before-production';
let hasWarnedAboutDevSecret = false;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }

  if (!hasWarnedAboutDevSecret) {
    console.warn('[SECURITY] JWT_SECRET is not configured. Using a development-only secret.');
    hasWarnedAboutDevSecret = true;
  }

  return DEV_JWT_SECRET;
}
