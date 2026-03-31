const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

const shareUnlockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 attempts per window per key
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function authenticateShare(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.type !== 'share') return res.status(403).json({ error: 'invalid token type' });
    req.share = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

function dateRangeForPeriod(period) {
  const end = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'ninety') {
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'two_weeks') {
    start.setDate(start.getDate() - 14);
    start.setHours(0, 0, 0, 0);
  } else {
    // 'week' or anything else — 7 days back, from start of that day
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

// GET /api/share/:shareToken — public metadata (no auth)
router.get('/:shareToken', async (req, res) => {
  try {
    const profile = await db('user_profiles')
      .where({ share_token: req.params.shareToken })
      .first();
    if (!profile) return res.status(404).json({ error: 'Share link not found or has been removed.' });
    const user = await db('users').where({ id: profile.user_id }).select('username').first();
    res.json({
      username: user.username,
      has_passcode: !!profile.share_passcode_hash,
    });
  } catch (err) {
    console.error('share meta error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/share/:shareToken/unlock — verify passcode → issue short-lived share JWT
router.post('/:shareToken/unlock', shareUnlockLimiter, async (req, res) => {
  try {
    const profile = await db('user_profiles')
      .where({ share_token: req.params.shareToken })
      .first();
    if (!profile) return res.status(404).json({ error: 'Share link not found.' });

    if (profile.share_passcode_hash) {
      const { passcode } = req.body;
      if (!passcode) return res.status(400).json({ error: 'passcode required' });
      const ok = await bcrypt.compare(String(passcode), profile.share_passcode_hash);
      if (!ok) return res.status(401).json({ error: 'Incorrect passcode.' });
    }

    const shareJwt = jwt.sign(
      { type: 'share', share_token: req.params.shareToken, user_id: profile.user_id },
      SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token: shareJwt });
  } catch (err) {
    console.error('share unlock error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/share/:shareToken/data — returns health summary (requires share JWT)
router.get('/:shareToken/data', authenticateShare, async (req, res) => {
  try {
    if (req.share.share_token !== req.params.shareToken) {
      return res.status(403).json({ error: 'token mismatch' });
    }
    const userId = req.share.user_id;
    const user = await db('users').where({ id: userId }).select('username').first();
    const profile = await db('user_profiles').where({ user_id: userId }).first();

    // User-locked period takes priority; otherwise use doctor's ?period= param or default 'week'
    const VALID_PERIODS = ['today', 'week', 'two_weeks', 'month', 'ninety'];
    const lockedPeriod = profile?.share_period || null;
    const reqPeriod = req.query.period;
    const exportPeriod = lockedPeriod
      || (VALID_PERIODS.includes(reqPeriod) ? reqPeriod : null)
      || profile?.export_period
      || 'week';

    const { start, end } = dateRangeForPeriod(exportPeriod);

    const healthData = await db('health_data')
      .where({ user_id: userId })
      .where('timestamp', '>=', start.toISOString())
      .where('timestamp', '<=', end.toISOString())
      .select('type', 'value', 'timestamp');

    const journalEntries = profile?.share_journal
      ? await db('journal_entries')
          .where({ user_id: userId })
          .where('date', '>=', start.toISOString())
          .where('date', '<=', end.toISOString())
          .select('date', 'title', 'mood')
          .orderBy('date', 'asc')
      : [];

    const startDate = start.toISOString().slice(0, 10);
    const endDate   = end.toISOString().slice(0, 10);

    const foodLog = profile?.share_food_log
      ? await db('food_log_entries')
          .where({ user_id: userId })
          .where('date', '>=', startDate)
          .where('date', '<=', endDate)
          .select('date', 'meal', 'food_name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g')
          .orderBy('date', 'asc')
      : [];

    const medications = profile?.share_medications
      ? await db('medication_entries')
          .where({ user_id: userId })
          .where('date', '>=', startDate)
          .where('date', '<=', endDate)
          .select('date', 'time', 'medication_name', 'dosage', 'notes', 'taken_at')
          .orderBy('date', 'asc')
          .orderBy('taken_at', 'asc')
      : [];

    res.json({
      username: user.username,
      export_period: exportPeriod,
      period_locked: !!lockedPeriod,
      share_medications: !!profile?.share_medications,
      start: startDate,
      end: endDate,
      data: healthData,
      journal: journalEntries,
      food_log: foodLog,
      medications,
    });
  } catch (err) {
    console.error('share data error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
