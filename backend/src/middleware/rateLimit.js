const rateLimit = require('express-rate-limit');

// Keyed by user id when authenticated so one busy classroom behind a single
// school NAT does not rate-limit itself out of an exam.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) || req.ip,
  message: { error: 'Too many requests, please slow down' },
});

// Tighter budget on credential endpoints to blunt brute-force attempts.
// The ceiling is configurable because the test suites sign in many times in a
// row: at 30 the second consecutive run locks itself out with 429s that look
// like product failures. 100 attempts per 15 minutes still leaves an 8+
// character password far out of reach of guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

module.exports = { apiLimiter, authLimiter };
