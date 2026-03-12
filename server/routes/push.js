const express = require('express');
const webpush = require('web-push');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { getPublicKey } = require('../utils/vapid');

const router = express.Router();

// GET /api/push/vapid-key — public VAPID key for client subscription
router.get('/vapid-key', (req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push not ready' });
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — register a push subscription for the logged-in user
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    const existing = await db('push_subscriptions').where({ endpoint }).first();
    if (existing) {
      await db('push_subscriptions').where({ endpoint }).update({
        user_id: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
    } else {
      await db('push_subscriptions').insert({
        user_id: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        created_at: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/push/subscribe — remove push subscription(s) for the logged-in user
router.delete('/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await db('push_subscriptions').where({ user_id: req.user.id, endpoint }).delete();
    } else {
      await db('push_subscriptions').where({ user_id: req.user.id }).delete();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/push/reminders — save the user's reminders on the server so the
// push scheduler can fire notifications when the site is closed
router.post('/reminders', authenticate, async (req, res) => {
  try {
    const { reminders, timezone } = req.body;
    if (!Array.isArray(reminders)) return res.status(400).json({ error: 'reminders must be array' });
    const tz = (typeof timezone === 'string' && timezone.trim()) ? timezone.trim() : 'UTC';
    const existing = await db('user_reminders').where({ user_id: req.user.id }).first();
    const data = {
      reminders_json: JSON.stringify(reminders),
      timezone: tz,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await db('user_reminders').where({ user_id: req.user.id }).update(data);
    } else {
      await db('user_reminders').insert({ user_id: req.user.id, ...data });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
