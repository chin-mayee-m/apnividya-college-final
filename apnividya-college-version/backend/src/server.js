require('dotenv').config();
const { validateEnv } = require('./config/env');

// Configuration is checked before anything else boots so the process never
// comes up half-configured.
validateEnv();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { corsOptions } = require('./config/cors');
const { apiLimiter, authLimiter } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/error');
const migrate = require('../migrations/migrate');

const app = express();

app.set('trust proxy', 1);

// The frontend renders with inline `onclick` attributes, which helmet's
// default `script-src-attr 'none'` blocks outright. This is a demo-friendly
// relaxation, not a production posture: a deployed build should move to
// delegated listeners and drop both 'unsafe-inline' entries.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
      'connect-src': ["'self'"],
    },
  },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.path === '/api/health',
}));

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/batches', require('./routes/batch'));
app.use('/api/questions', require('./routes/question'));
app.use('/api/exams', require('./routes/exam'));
app.use('/api/attempts', require('./routes/attempt'));
app.use('/api/students', require('./routes/student'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Unknown API paths get a clean 404 rather than falling through to the SPA.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// The single-page frontend is served by this same process, so one `npm start`
// gives you the whole system on one origin and no CORS setup is needed.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

if (require.main === module) {
  (async () => {
    // Schema is brought up to date before the server starts.
    await migrate();
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`\n  Apni Vidya — Smart Examination & Assessment System`);
      console.log(`  Running on http://localhost:${PORT}\n`);
    });
  })().catch((err) => {
    console.error('[fatal] startup failed:', err);
    process.exit(1);
  });
}

module.exports = app;
