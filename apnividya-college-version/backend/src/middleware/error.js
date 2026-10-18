const isProduction = () => process.env.NODE_ENV === 'production';

// Central error handler. Known failure shapes get a clean client message;
// anything unexpected is logged in full server-side and generalised for the
// client in production.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.message && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  }

  const message = status >= 500 && isProduction()
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
