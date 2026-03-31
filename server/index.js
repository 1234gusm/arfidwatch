const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const journalRoutes = require('./routes/journal');
const profileRoutes = require('./routes/profile');
const shareRoutes = require('./routes/share');
const foodLogRoutes = require('./routes/foodlog');
const medicationsRoutes = require('./routes/medications');
const pushRoutes = require('./routes/push');
const { startAutoHealthPull } = require('./utils/autoHealthPull');
const { initVapid } = require('./utils/vapid');
const { startPushScheduler } = require('./utils/pushScheduler');

/* ── V-8: Graceful shutdown on fatal errors ───────────────── */
let server;
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  if (server) server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000); // force exit after 5s
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();

/* ── Security headers (helmet + V-10 Referrer-Policy) ─────── */
app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
}));

/* ── Cookie parser (V-2) ──────────────────────────────────── */
app.use(cookieParser());

/* ── HTTPS redirect in production ───────────────────────── */
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

/* ── V-5: CORS — restrict to allowed origins, fail-closed in production ── */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !ALLOWED_ORIGINS.length) {
  console.error('[FATAL] CORS_ORIGINS env var is required in production. Exiting.');
  process.exit(1);
}

app.use(cors(
  ALLOWED_ORIGINS.length
    ? { origin: ALLOWED_ORIGINS, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-Ingest-Key', 'X-Upload-Filename', 'X-File-Name'] }
    : { origin: true, credentials: true } // dev: reflect origin, still enable credentials for cookies
));

/* ── Global rate limiter ────────────────────────────────── */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 300,                   // 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Debug middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// mount routers
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/food-log', foodLogRoutes);
app.use('/api/medications', medicationsRoutes);
app.use('/api/push', pushRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler – keeps the server alive on route errors
app.use((err, _req, res, _next) => {
  console.error('[EXPRESS]', err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try { await initVapid(); } catch (e) { console.error('VAPID init error:', e.message); }
  startPushScheduler();
  startAutoHealthPull({ port: PORT });
});

/* ── V-9: Upload file cleanup (delete files older than 30 days) ─ */
const UPLOAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
function cleanupUploads() {
  const dirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, '..', 'uploads'),
  ];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && (now - stat.mtimeMs) > UPLOAD_MAX_AGE_MS) {
            fs.unlinkSync(filePath);
          }
        } catch (_) { /* skip files we can't stat/delete */ }
      }
    } catch (_) { /* skip dirs we can't read */ }
  }
}
setInterval(cleanupUploads, 15 * 60 * 1000);
cleanupUploads();

/* ── Graceful shutdown ──────────────────────────────────── */
function shutdown(signal) {
  console.log(`\n${signal} received – shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
