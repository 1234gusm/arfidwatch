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

// GET /api/food-log/daily  — aggregate nutrition per day from food_log_entries
router.get('/daily', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    let query = db('food_log_entries')
      .where({ user_id: userId })
      .select('date')
      .sum('calories as dietary_energy_kcal')
      .sum('protein_g as protein_g')
      .sum('carbs_g as carbohydrates_g')
      .sum('fat_g as total_fat_g')
      .groupBy('date')
      .orderBy('date', 'asc');
    if (req.query.start) query = query.where('date', '>=', req.query.start.slice(0, 10));
    if (req.query.end)   query = query.where('date', '<=', req.query.end.slice(0, 10));
    const rows = await query;
    res.json({ data: rows });
  } catch (err) {
    console.error('food log daily error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

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
