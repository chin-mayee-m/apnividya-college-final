// Fail fast on missing or unsafe configuration rather than booting a server
// that silently signs tokens with a guessable secret.
const DEFAULT_SECRET = 'change-me-to-a-long-random-string';

function validateEnv() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[fatal] JWT_SECRET is not set.');
      process.exit(1);
    }
    process.env.JWT_SECRET = 'dev-only-insecure-secret';
    console.warn('[warn] JWT_SECRET not set — using a development-only secret.');
    return;
  }

  if (process.env.NODE_ENV === 'production' && (secret === DEFAULT_SECRET || secret.length < 24)) {
    console.error('[fatal] JWT_SECRET is the placeholder value or too short for production.');
    process.exit(1);
  }
}

module.exports = { validateEnv };
