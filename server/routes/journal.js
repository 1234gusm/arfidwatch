const express = require('express');
const db = require('../db');
const { generatePDF } = require('../utils/pdf');

const router = express.Router();

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    console.log('No auth header');
    return res.status(401).json({ error: 'missing token' });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'supersecret');
    req.user = payload;
    next();
  } catch (e) {
    console.log('Auth failed:', e.message);
    res.status(401).json({ error: 'invalid token' });
  }
}

// Debug all requests
router.use((req, res, next) => {
  console.log(`Journal route: ${req.method} ${req.path}`);
  next();
});

// export MUST come before /:id to avoid route conflicts
router.get('/export', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;

    let startStr, endStr;
    if (start && end) {
      startStr = start + 'T00:00:00';
      endStr   = end   + 'T23:59:59';
    } else {
      // Default: last 7 days
      const now    = new Date();
      const startD = new Date(now);
      startD.setDate(now.getDate() - 7);
      startStr = startD.toISOString().slice(0, 10) + 'T00:00:00';
      endStr   = now.toISOString().slice(0, 10)    + 'T23:59:59';
    }

    const { includeJournal = '1', quick = '0' } = req.query;

    const [entries, healthData] = await Promise.all([
      includeJournal !== '0'
        ? db('journal_entries')
            .where('user_id', req.user.id)
            .andWhere('date', '>=', startStr)
            .andWhere('date', '<=', endStr)
            .orderBy('date', 'asc')
        : Promise.resolve([]),
      db('health_data')
        .where('user_id', req.user.id)
        .andWhere('timestamp', '>=', startStr)
        .andWhere('timestamp', '<=', endStr)
        .orderBy('timestamp', 'asc'),
    ]);

    const pdfBuffer = await generatePDF(healthData, entries, startStr, endStr, includeJournal !== '0', quick === '1');
    res.set('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('journal_entries').where({ user_id: req.user.id });
    if (start) query = query.where('date', '>=', start);
    if (end) query = query.where('date', '<=', end);
    const entries = await query.orderBy('id', 'desc');
    res.json({ entries });
  } catch (err) {
    console.error('Get entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { date, text, mood, title } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const result = await db('journal_entries').insert({ 
      user_id: req.user.id, 
      date, 
      title: title || '',
      text: text || '', 
      mood: mood || 3 
    });
    res.json({ success: true, id: result[0] });
  } catch (err) {
    console.error('Post entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// delete journal entry by id
router.delete('/:id', authenticate, async (req, res) => {
  console.log('DELETE route hit for ID:', req.params.id);
  
  try {
    const id = req.params.id;
    
    const deleted = await db('journal_entries')
      .where('id', id)
      .where('user_id', req.user.id)
      .delete();
    
    console.log('Deleted rows:', deleted);
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'entry not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;