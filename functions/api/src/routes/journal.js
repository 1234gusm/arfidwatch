import { Query } from 'node-appwrite';

export async function handleJournal({ req, res, db, userId, body, method, path }) {
  const q = req.query || {};

  // GET /api/journal/export — PDF export
  if (method === 'GET' && path === '/api/journal/export') {
    // TODO: port PDF generation (pdfkit)
    return res.json({ error: 'PDF export not yet implemented on Appwrite' }, 501);
  }

  // GET /api/journal
  if (method === 'GET' && path === '/api/journal') {
    const queries = [Query.equal('user_id', userId), Query.orderDesc('$createdAt')];
    if (q.start) queries.push(Query.greaterThanEqual('date', q.start));
    if (q.end)   queries.push(Query.lessThanEqual('date', q.end));
    const entries = await db.find('journal_entries', queries, 50000);
    return res.json({ entries: entries.map(d => ({ id: d.$id, ...strip$(d) })) });
  }

  // POST /api/journal
  if (method === 'POST' && path === '/api/journal') {
    const { date, text, mood, title } = body;
    if (!date) return res.json({ error: 'date required' }, 400);
    const safeTitle = String(title || '').slice(0, 1000);
    const safeText  = String(text || '').slice(0, 100000);
    const safeMood  = Math.min(5, Math.max(1, parseInt(mood, 10) || 3));
    const doc = await db.create('journal_entries', {
      user_id: userId, date, title: safeTitle, text: safeText, mood: safeMood,
    }, userId);
    return res.json({ success: true, id: doc.$id });
  }

  // DELETE /api/journal/:id
  const delMatch = path.match(/^\/api\/journal\/([^/]+)$/);
  if (method === 'DELETE' && delMatch) {
    const docId = delMatch[1];
    const doc = await db.findOne('journal_entries', [
      Query.equal('$id', docId), Query.equal('user_id', userId),
    ]);
    if (!doc) return res.json({ error: 'not found' }, 404);
    await db.remove('journal_entries', docId);
    return res.json({ success: true });
  }

  return res.json({ error: 'Not found' }, 404);
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...rest } = doc;
  return rest;
}
