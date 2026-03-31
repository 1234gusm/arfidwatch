const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendPasswordResetCode } = require('../utils/mailer');
const { authenticate, SECRET, COOKIE_NAME, cookieOptions } = require('../middleware/auth');

const router = express.Router();
const RESET_CODE_TTL_MINUTES = parseInt(process.env.RESET_CODE_TTL_MINUTES, 10) || 15;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Auth-specific rate limiters ────────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per window
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,                     // 3 attempts per hour per IP
  message: { error: 'Too many password reset requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Password validation ────────────────────────────────── */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit.';
  }
  return null;
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/* ── V-6: Cryptographically secure reset code ───────────── */
function generateResetCode() {
  return crypto.randomBytes(20).toString('base64url'); // ~27 chars, 160 bits entropy
}

// register
router.post('/register', authLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (username.length > 64) {
    return res.status(400).json({ error: 'username must be 64 characters or fewer' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });
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
  const token = jwt.sign({ id, username }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true, has_email: !!normalizedEmail });
});

// login — accept username OR email
router.post('/login', authLimiter, async (req, res) => {
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
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true });
});

// forgot-password — verify username + email match, send a reset code via email
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: 'username and email required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db('users')
    .where({ username, email: normalizedEmail })
    .first();
  if (!user) {
    // Return the same success message to prevent user enumeration
    return res.json({ ok: true, message: 'If your account details are correct, a reset code has been sent to your email.' });
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
router.post('/reset-password', authLimiter, async (req, res) => {
  const { username, email, code, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'new password required' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

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
  const pwError = validatePassword(new_password);
  if (pwError) return res.status(400).json({ error: pwError });
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user) return res.status(400).json({ error: 'user not found' });
  const match = await bcrypt.compare(current_password, user.password);
  if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });
  const rounds = parseInt(process.env.SALT_ROUNDS) || 10;
  const hash = await bcrypt.hash(new_password, rounds);
  await db('users').where({ id: user.id }).update({ password: hash });
  res.json({ ok: true });
});

// V-2: Session check — validates httpOnly cookie, returns user info
router.get('/me', authenticate, async (req, res) => {
  res.json({ authenticated: true, id: req.user.id, username: req.user.username });
});

// V-2: Logout — clears the httpOnly cookie
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/' });
  res.json({ ok: true });
});

module.exports = router;
