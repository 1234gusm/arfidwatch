const jwt = require('jsonwebtoken');

/* ── V-1: Refuse to start in production without a real secret ── */
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET env var is required in production. Exiting.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET env var not set — using insecure fallback. Set JWT_SECRET in production!');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-replace-me';

/* ── Cookie configuration ─────────────────────────────────── */
const COOKIE_NAME = 'aw_token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
});

function authenticate(req, res, next) {
  /* Read token from httpOnly cookie first, then Authorization header fallback */
  let token = req.cookies?.[COOKIE_NAME] || null;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth) token = auth.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = { authenticate, SECRET, COOKIE_NAME, cookieOptions };
