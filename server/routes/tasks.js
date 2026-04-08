const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Helper: next due date for recurring tasks ── */
function calcNextDue(currentDue, recurrence) {
  const d = currentDue ? new Date(currentDue + 'T00:00:00') : new Date();
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'weekdays':
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      break;
    default: d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/* ── GET /api/tasks — list tasks ── */
router.get('/', async (req, res) => {
  try {
    const { list, completed, due } = req.query;
    let q = db('tasks').where({ user_id: req.user.id });
    if (list) q = q.where('list_name', list);
    if (completed === '1') q = q.where('completed', true);
    else if (completed === '0') q = q.where('completed', false);
    if (due === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      q = q.where('due_date', today);
    } else if (due === 'upcoming') {
      const today = new Date().toISOString().slice(0, 10);
      q = q.where('due_date', '>=', today).where('completed', false);
    } else if (due === 'overdue') {
      const today = new Date().toISOString().slice(0, 10);
      q = q.where('due_date', '<', today).where('completed', false);
    }
    const rows = await q.orderBy([
      { column: 'completed', order: 'asc' },
      { column: 'sort_order', order: 'asc' },
      { column: 'created_at', order: 'desc' },
    ]);
    res.json({ tasks: rows });
  } catch (e) {
    console.error('[tasks] list error:', e.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/* ── GET /api/tasks/lists — distinct list names ── */
router.get('/lists', async (req, res) => {
  try {
    const rows = await db('tasks')
      .where({ user_id: req.user.id })
      .distinct('list_name')
      .orderBy('list_name');
    const lists = rows.map(r => r.list_name).filter(Boolean);
    if (!lists.includes('Inbox')) lists.unshift('Inbox');
    res.json({ lists });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

/* ── POST /api/tasks — create a task ── */
router.post('/', async (req, res) => {
  try {
    const { title, notes, due_date, due_time, priority, list_name, parent_id, recurrence } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
    // Validate parent belongs to same user
    if (parent_id) {
      const parent = await db('tasks').where({ id: parent_id, user_id: req.user.id }).first();
      if (!parent) return res.status(400).json({ error: 'Parent task not found' });
    }
    const maxOrder = await db('tasks').where({ user_id: req.user.id }).max('sort_order as m').first();
    const now = new Date().toISOString();
    const validRecurrences = ['daily', 'weekly', 'monthly', 'weekdays'];
    const [id] = await db('tasks').insert({
      user_id: req.user.id,
      title: String(title).trim().slice(0, 500),
      notes: notes ? String(notes).trim().slice(0, 2000) : null,
      due_date: due_date || null,
      due_time: due_time || null,
      priority: Math.max(0, Math.min(3, parseInt(priority) || 0)),
      list_name: list_name ? String(list_name).trim().slice(0, 100) : 'Inbox',
      completed: false,
      completed_at: null,
      sort_order: (maxOrder?.m || 0) + 1,
      parent_id: parent_id ? parseInt(parent_id) : null,
      recurrence: recurrence && validRecurrences.includes(recurrence) ? recurrence : null,
      created_at: now,
      updated_at: now,
    });
    const task = await db('tasks').where({ id }).first();
    res.status(201).json({ task });
  } catch (e) {
    console.error('[tasks] create error:', e.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/* ── PUT /api/tasks/:id — update a task ── */
router.put('/:id', async (req, res) => {
  try {
    const task = await db('tasks').where({ id: req.params.id, user_id: req.user.id }).first();
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const updates = {};
    if (req.body.title !== undefined) updates.title = String(req.body.title).trim().slice(0, 500);
    if (req.body.notes !== undefined) updates.notes = req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null;
    if (req.body.due_date !== undefined) updates.due_date = req.body.due_date || null;
    if (req.body.due_time !== undefined) updates.due_time = req.body.due_time || null;
    if (req.body.priority !== undefined) updates.priority = Math.max(0, Math.min(3, parseInt(req.body.priority) || 0));
    if (req.body.list_name !== undefined) updates.list_name = String(req.body.list_name).trim().slice(0, 100) || 'Inbox';
    if (req.body.parent_id !== undefined) updates.parent_id = req.body.parent_id ? parseInt(req.body.parent_id) : null;
    if (req.body.recurrence !== undefined) {
      const validRecurrences = ['daily', 'weekly', 'monthly', 'weekdays'];
      updates.recurrence = req.body.recurrence && validRecurrences.includes(req.body.recurrence) ? req.body.recurrence : null;
    }
    if (req.body.completed !== undefined) {
      updates.completed = !!req.body.completed;
      updates.completed_at = updates.completed ? new Date().toISOString() : null;
    }
    if (req.body.sort_order !== undefined) updates.sort_order = parseInt(req.body.sort_order) || 0;
    updates.updated_at = new Date().toISOString();
    await db('tasks').where({ id: req.params.id, user_id: req.user.id }).update(updates);

    // If completing a recurring task, spawn the next occurrence
    let spawned = null;
    if (updates.completed && task.recurrence && !task.completed) {
      const nextDue = calcNextDue(task.due_date, task.recurrence);
      const maxOrder = await db('tasks').where({ user_id: req.user.id }).max('sort_order as m').first();
      const now = new Date().toISOString();
      const [newId] = await db('tasks').insert({
        user_id: req.user.id,
        title: task.title,
        notes: task.notes,
        due_date: nextDue,
        due_time: task.due_time,
        priority: task.priority,
        list_name: task.list_name,
        completed: false,
        completed_at: null,
        sort_order: (maxOrder?.m || 0) + 1,
        parent_id: task.parent_id,
        recurrence: task.recurrence,
        created_at: now,
        updated_at: now,
      });
      spawned = await db('tasks').where({ id: newId }).first();
    }

    const updated = await db('tasks').where({ id: req.params.id }).first();
    res.json({ task: updated, spawned });
  } catch (e) {
    console.error('[tasks] update error:', e.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/* ── PUT /api/tasks/reorder — batch reorder ── */
router.put('/reorder', async (req, res) => {
  try {
    const { order } = req.body; // [{ id, sort_order }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
    for (const item of order) {
      await db('tasks')
        .where({ id: item.id, user_id: req.user.id })
        .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

/* ── DELETE /api/tasks/:id — also cascades subtasks ── */
router.delete('/:id', async (req, res) => {
  try {
    // Delete subtasks first
    await db('tasks').where({ parent_id: req.params.id, user_id: req.user.id }).del();
    const n = await db('tasks').where({ id: req.params.id, user_id: req.user.id }).del();
    if (n === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
