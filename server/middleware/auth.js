const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'supersecret';

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
