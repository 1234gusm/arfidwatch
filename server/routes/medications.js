const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = express.Router();

let medicationNameSeed = [];
try {
  const p = path.resolve(__dirname, '..', 'data', 'medication_names.json');
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) medicationNameSeed = parsed.map(x => String(x).trim()).filter(Boolean);
} catch (_) {
  medicationNameSeed = [];
}

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

const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// GET /api/medications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    let query = db('medication_entries')
      .where({ user_id: userId })
      .select('id', 'date', 'time', 'medication_name', 'dosage', 'notes', 'taken_at', 'created_at')
      .orderBy('taken_at', 'desc');

    if (req.query.start) query = query.where('date', '>=', req.query.start.slice(0, 10));
    if (req.query.end) query = query.where('date', '<=', req.query.end.slice(0, 10));

    const data = await query;
    res.json({ data });
  } catch (err) {
    console.error('medications list error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/medications/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [{ n }] = await db('medication_entries').where({ user_id: userId }).count('id as n');
    const range = await db('medication_entries')
      .where({ user_id: userId })
      .min('date as earliest')
      .max('date as latest')
      .first();
    res.json({ count: n || 0, earliest: range?.earliest || null, latest: range?.latest || null });
  } catch (err) {
    console.error('medications status error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/medications/names
router.get('/names', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    const userNames = await db('medication_entries')
      .where({ user_id: userId })
      .distinct('medication_name')
      .pluck('medication_name');

    const merged = [...medicationNameSeed, ...userNames]
      .map(x => String(x || '').trim())
      .filter(Boolean);

    const uniq = [...new Set(merged.map(x => x.toLowerCase()))].map(lc => (
      merged.find(v => v.toLowerCase() === lc)
    ));

    const filtered = q
      ? uniq.filter(n => n.toLowerCase().includes(q))
      : uniq;

    const names = filtered.sort((a, b) => a.localeCompare(b)).slice(0, 200);
    res.json({ names });
  } catch (err) {
    console.error('medications names error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medications
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const medicationName = String(req.body.medication_name || '').trim();
    const dosage = String(req.body.dosage || '').trim();
    const notes = String(req.body.notes || '').trim();
    const takenAtInput = String(req.body.taken_at || '').trim();

    if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });

    let takenDate = new Date();
    let date = dateKey(takenDate);
    let time = timeKey(takenDate);
    let takenAtStored = takenDate.toISOString();

    if (takenAtInput) {
      const m = takenAtInput.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) {
        date = m[1];
        time = m[2];
        // Keep local clock time exactly as entered by the user (no UTC shift).
        takenAtStored = `${date}T${time}:00`;
      } else {
        takenDate = new Date(takenAtInput);
        if (Number.isNaN(takenDate.getTime())) {
          return res.status(400).json({ error: 'invalid taken_at' });
        }
        date = dateKey(takenDate);
        time = timeKey(takenDate);
        takenAtStored = takenDate.toISOString();
      }
    }

    const [id] = await db('medication_entries').insert({
      user_id: userId,
      date,
      time,
      medication_name: medicationName,
      dosage: dosage || null,
      notes: notes || null,
      taken_at: takenAtStored,
      created_at: new Date().toISOString(),
    });

    const row = await db('medication_entries').where({ id, user_id: userId }).first();
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error('medications create error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/clear
router.delete('/clear/all', authenticate, async (req, res) => {
  try {
    await db('medication_entries').where({ user_id: req.user.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('medications clear error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await db('medication_entries').where({ id, user_id: req.user.id }).delete();
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications delete error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
