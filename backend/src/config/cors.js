// Allow-list driven CORS. With the frontend served by this same process the
// list is mostly relevant for running a separate dev server on another port.
const allowed = (process.env.CORS_ORIGINS || 'http://localhost:4000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Same-origin requests and non-browser clients (curl, tests) send no Origin.
    if (!origin) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

module.exports = { corsOptions, allowed };
