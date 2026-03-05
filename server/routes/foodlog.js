const express = require('express');
const db = require('../db');

const router = express.Router();

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'supersecret');
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

// GET /api/food-log/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [{ n }] = await db('food_log_entries').where({ user_id: userId }).count('id as n');
    const range = await db('food_log_entries')
      .where({ user_id: userId })
      .min('date as earliest')
      .max('date as latest')
      .first();
    res.json({ count: n || 0, earliest: range?.earliest || null, latest: range?.latest || null });
  } catch (err) {
    console.error('food log status error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/food-log/clear
router.delete('/clear', authenticate, async (req, res) => {
  try {
    await db('food_log_entries').where({ user_id: req.user.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
