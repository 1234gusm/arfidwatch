const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET env var not set — using insecure fallback. Set JWT_SECRET in production!');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-replace-me';

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = { authenticate, SECRET };
