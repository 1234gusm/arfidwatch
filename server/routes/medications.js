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
const isHexColor = s => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));

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

// GET /api/medications/quick-buttons
router.get('/quick-buttons', authenticate, async (req, res) => {
  try {
    const data = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .select('id', 'medication_name', 'dosage', 'color', 'sort_order')
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc');
    res.json({ data });
  } catch (err) {
    console.error('medications quick-buttons list error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medications/quick-buttons
router.post('/quick-buttons', authenticate, async (req, res) => {
  try {
    const medicationName = String(req.body.medication_name || '').trim();
    const dosage = String(req.body.dosage || '').trim();
    const color = isHexColor(req.body.color) ? String(req.body.color) : '#0a66c2';
    if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });

    const maxRow = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .max('sort_order as max_sort')
      .first();
    const sortOrder = Number.isFinite(Number(maxRow?.max_sort)) ? Number(maxRow.max_sort) + 1 : 0;

    const [id] = await db('medication_quick_buttons').insert({
      user_id: req.user.id,
      medication_name: medicationName,
      dosage: dosage || null,
      color,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    });
    const row = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).first();
    res.json({ ok: true, button: row });
  } catch (err) {
    console.error('medications quick-buttons create error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medications/quick-buttons/reorder
router.put('/quick-buttons/reorder', authenticate, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(x => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids array is required' });

    const existing = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .whereIn('id', ids)
      .pluck('id');
    if (existing.length !== ids.length) return res.status(400).json({ error: 'ids contain invalid entries' });

    await db.transaction(async trx => {
      for (let i = 0; i < ids.length; i += 1) {
        await trx('medication_quick_buttons')
          .where({ user_id: req.user.id, id: ids[i] })
          .update({ sort_order: i });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications quick-buttons reorder error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medications/quick-buttons/:id
router.put('/quick-buttons/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    const updates = {};
    if (req.body.medication_name !== undefined) {
      const medicationName = String(req.body.medication_name || '').trim();
      if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });
      updates.medication_name = medicationName;
    }
    if (req.body.dosage !== undefined) updates.dosage = String(req.body.dosage || '').trim() || null;
    if (req.body.color !== undefined) {
      if (!isHexColor(req.body.color)) return res.status(400).json({ error: 'invalid color' });
      updates.color = String(req.body.color);
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'no updates provided' });

    const changed = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).update(updates);
    if (!changed) return res.status(404).json({ error: 'not found' });
    const row = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).first();
    res.json({ ok: true, button: row });
  } catch (err) {
    console.error('medications quick-buttons update error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/quick-buttons/:id
router.delete('/quick-buttons/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).delete();
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications quick-buttons delete error:', err);
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
