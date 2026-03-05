const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();
const SALT_ROUNDS = 12;
const hashIngestKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

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

const VALID_PERIODS = ['today', 'week', 'month', 'custom'];

// GET /api/profile
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db('users').where({ id: userId }).select('username').first();
    let profile = await db('user_profiles').where({ user_id: userId }).first();
    if (!profile) {
      await db('user_profiles').insert({ user_id: userId, export_period: 'week' });
      profile = { export_period: 'week', share_token: null, share_passcode_hash: null };
    }
    res.json({
      username: user.username,
      export_period: profile.export_period,
      share_token: profile.share_token || null,
      has_passcode: !!profile.share_passcode_hash,
      share_food_log: !!profile.share_food_log,
      share_medications: !!profile.share_medications,
      has_ingest_key: !!profile.ingest_key_hash,
      ingest_key_last_used_at: profile.ingest_key_last_used_at || null,
    });
  } catch (err) {
    console.error('profile GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/profile
router.put('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      export_period,
      passcode,
      clear_passcode,
      regenerate_share,
      clear_share,
      share_food_log,
      share_medications,
      regenerate_ingest_key,
      clear_ingest_key,
    } = req.body;
    const updates = {};
    let plainIngestKey = null;

    if (export_period !== undefined) {
      if (!VALID_PERIODS.includes(export_period)) {
        return res.status(400).json({ error: 'invalid export_period' });
      }
      updates.export_period = export_period;
    }

    if (regenerate_share) {
      updates.share_token = crypto.randomBytes(24).toString('hex');
    }

    if (clear_share) {
      updates.share_token = null;
      updates.share_passcode_hash = null;
    }

    if (passcode !== undefined && String(passcode).trim() !== '') {
      updates.share_passcode_hash = await bcrypt.hash(String(passcode), SALT_ROUNDS);
    }

    if (clear_passcode) {
      updates.share_passcode_hash = null;
    }

    if (share_food_log !== undefined) {
      updates.share_food_log = !!share_food_log;
    }

    if (share_medications !== undefined) {
      updates.share_medications = !!share_medications;
    }

    if (regenerate_ingest_key) {
      plainIngestKey = `awk_${crypto.randomBytes(24).toString('hex')}`;
      updates.ingest_key_hash = hashIngestKey(plainIngestKey);
      updates.ingest_key_last_used_at = null;
    }

    if (clear_ingest_key) {
      updates.ingest_key_hash = null;
      updates.ingest_key_last_used_at = null;
    }

    if (Object.keys(updates).length > 0) {
      const exists = await db('user_profiles').where({ user_id: userId }).first();
      if (exists) {
        await db('user_profiles').where({ user_id: userId }).update(updates);
      } else {
        await db('user_profiles').insert({ user_id: userId, export_period: 'week', ...updates });
      }
    }

    // Clear passcode via raw query to guarantee SQLite stores NULL (not skipped)
    if (clear_passcode) {
      await db.raw('UPDATE user_profiles SET share_passcode_hash = NULL WHERE user_id = ?', [userId]);
    }

    const profile = await db('user_profiles').where({ user_id: userId }).first();
    res.json({
      ok: true,
      share_token: profile?.share_token || null,
      has_passcode: !!(profile?.share_passcode_hash),
      share_food_log: !!(profile?.share_food_log),
      share_medications: !!(profile?.share_medications),
      has_ingest_key: !!(profile?.ingest_key_hash),
      ingest_key_last_used_at: profile?.ingest_key_last_used_at || null,
      ingest_key: plainIngestKey,
    });
  } catch (err) {
    console.error('profile PUT error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
