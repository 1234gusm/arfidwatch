const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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

/* ── Process-level crash catchers ─────────────────────────── */
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

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
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try { await initVapid(); } catch (e) { console.error('VAPID init error:', e.message); }
  startPushScheduler();
  startAutoHealthPull({ port: PORT });
});

/* ── Graceful shutdown ──────────────────────────────────── */
function shutdown(signal) {
  console.log(`\n${signal} received – shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
