const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'supersecret';

// register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const existing = await db('users').where({ username }).first();
  if (existing) {
    return res.status(400).json({ error: 'username exists' });
  }
  const rounds = parseInt(process.env.SALT_ROUNDS) || 10;
  const hash = await bcrypt.hash(password, rounds);
  const [id] = await db('users').insert({ username, password: hash });
  const token = jwt.sign({ id, username }, SECRET);
  res.json({ token });
});

// login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const user = await db('users').where({ username }).first();
  if (!user) {
    return res.status(400).json({ error: 'invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(400).json({ error: 'invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username }, SECRET);
  res.json({ token });
});

module.exports = router;
