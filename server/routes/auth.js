const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { sendPasswordResetCode } = require('../utils/mailer');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'supersecret';
const RESET_CODE_TTL_MINUTES = parseInt(process.env.RESET_CODE_TTL_MINUTES, 10) || 15;

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// register
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const existing = await db('users').where({ username }).first();
  if (existing) {
    return res.status(400).json({ error: 'username taken' });
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (normalizedEmail) {
    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: 'invalid email address' });
    }
    const emailExists = await db('users').where({ email: normalizedEmail }).first();
    if (emailExists) {
      return res.status(400).json({ error: 'email already in use' });
    }
  }
  const rounds = parseInt(process.env.SALT_ROUNDS) || 10;
  const hash = await bcrypt.hash(password, rounds);
  const [id] = await db('users').insert({ username, password: hash, email: normalizedEmail });
  const token = jwt.sign({ id, username }, SECRET);
  res.json({ token, has_email: !!normalizedEmail });
});

// login — accept username OR email
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username/email and password required' });
  }
  let user = await db('users').where({ username }).first();
  if (!user) {
    user = await db('users').where({ email: String(username).trim().toLowerCase() }).first();
  }
  if (!user) {
    return res.status(400).json({ error: 'invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(400).json({ error: 'invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
  res.json({ token });
});

// forgot-password — verify username + email match, send a reset code via email
router.post('/forgot-password', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: 'username and email required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db('users')
    .where({ username, email: normalizedEmail })
    .first();
  if (!user) {
    return res.status(400).json({ error: 'No account found with that username and email combination.' });
  }
  const resetCode = generateResetCode();
  const expires = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000).toISOString();
  await db('users').where({ id: user.id }).update({
    reset_code_hash: hashResetCode(resetCode),
    reset_code_expires: expires,
    reset_token: null,
    reset_token_expires: null,
  });

  const mailResult = await sendPasswordResetCode({
    to: normalizedEmail,
    code: resetCode,
    username: user.username,
    ttlMinutes: RESET_CODE_TTL_MINUTES,
  });

  if (!mailResult.sent && process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Failed to send reset code email. Please try again.' });
  }

  const payload = {
    ok: true,
    message: 'If your account details are correct, a reset code has been sent to your email.',
  };

  if (process.env.NODE_ENV !== 'production' && !mailResult.sent) {
    payload.dev_reset_code = resetCode;
  }

  res.json(payload);
});

// reset-password — use username/email + code to set a new password
router.post('/reset-password', async (req, res) => {
  const { username, email, code, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'new password required' });
  }

  const rounds = parseInt(process.env.SALT_ROUNDS) || 10;
  const hash = await bcrypt.hash(password, rounds);

  if (!username || !email || !code) {
    return res.status(400).json({ error: 'username, email, code and new password required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db('users').where({ username, email: normalizedEmail }).first();
  if (!user) {
    return res.status(400).json({ error: 'No account found with that username and email combination.' });
  }
  if (!user.reset_code_hash || !user.reset_code_expires || new Date(user.reset_code_expires) < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }
  if (hashResetCode(code) !== user.reset_code_hash) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }

  await db('users').where({ id: user.id }).update({
    password: hash,
    reset_code_hash: null,
    reset_code_expires: null,
    reset_token: null,
    reset_token_expires: null,
  });
  res.json({ ok: true });
});

// change-password — authenticated, requires current password
router.post('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user) return res.status(400).json({ error: 'user not found' });
  const match = await bcrypt.compare(current_password, user.password);
  if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });
  const rounds = parseInt(process.env.SALT_ROUNDS) || 10;
  const hash = await bcrypt.hash(new_password, rounds);
  await db('users').where({ id: user.id }).update({ password: hash });
  res.json({ ok: true });
});

module.exports = router;
