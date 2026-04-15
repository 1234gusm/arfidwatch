const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/medical-visits — list all visits for user
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await db('medical_visits')
      .where({ user_id: req.user.id })
      .orderBy('date', 'desc');
    res.json({ data: rows });
  } catch (err) {
    console.error('medical-visits GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medical-visits — create a new visit
router.post('/', authenticate, async (req, res) => {
  try {
    const { date, visit_type, facility, provider, specialty, chief_complaint, diagnoses_json, vitals_json, labs_json, ecgs_json, notes, disposition, follow_up, medications_json } = req.body;
    if (!date || !visit_type) return res.status(400).json({ error: 'date and visit_type required' });
    const toJson = v => typeof v === 'string' ? v : JSON.stringify(v || null);
    const [id] = await db('medical_visits').insert({
      user_id: req.user.id,
      date,
      visit_type,
      facility: facility || null,
      provider: provider || null,
      specialty: specialty || null,
      chief_complaint: chief_complaint || null,
      diagnoses_json: toJson(diagnoses_json),
      vitals_json: toJson(vitals_json),
      labs_json: toJson(labs_json),
      ecgs_json: toJson(ecgs_json),
      notes: notes || null,
      disposition: disposition || null,
      follow_up: follow_up || null,
      medications_json: toJson(medications_json),
      created_at: new Date().toISOString(),
    });
    res.json({ id });
  } catch (err) {
    console.error('medical-visits POST error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medical-visits/:id — update a visit
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { date, visit_type, facility, provider, specialty, chief_complaint, diagnoses_json, vitals_json, labs_json, ecgs_json, notes, disposition, follow_up, medications_json } = req.body;
    const toJson = v => typeof v === 'string' ? v : JSON.stringify(v || null);
    await db('medical_visits').where({ id: req.params.id, user_id: req.user.id }).update({
      date, visit_type,
      facility: facility || null,
      provider: provider || null,
      specialty: specialty || null,
      chief_complaint: chief_complaint || null,
      diagnoses_json: toJson(diagnoses_json),
      vitals_json: toJson(vitals_json),
      labs_json: toJson(labs_json),
      ecgs_json: toJson(ecgs_json),
      notes: notes || null,
      disposition: disposition || null,
      follow_up: follow_up || null,
      medications_json: toJson(medications_json),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('medical-visits PUT error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medical-visits/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db('medical_visits').where({ id: req.params.id, user_id: req.user.id }).del();
    res.json({ ok: true });
  } catch (err) {
    console.error('medical-visits DELETE error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Public: GET /api/medical-visits/shared/:shareToken
router.get('/shared/:shareToken', async (req, res) => {
  try {
    const profile = await db('user_profiles').where({ share_token: req.params.shareToken }).first();
    if (!profile) return res.status(404).json({ error: 'not found' });
    const rows = await db('medical_visits')
      .where({ user_id: profile.user_id })
      .orderBy('date', 'desc');
    res.json({ data: rows });
  } catch (err) {
    console.error('medical-visits shared GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
