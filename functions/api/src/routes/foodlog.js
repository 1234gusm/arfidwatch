import { Query } from 'node-appwrite';

export async function handleFoodLog({ req, res, db, userId, body, method, path }) {
  const q = req.query || {};

  // GET /api/food-log/daily — aggregate nutrition per day
  if (method === 'GET' && path === '/api/food-log/daily') {
    const queries = [Query.equal('user_id', userId)];
    if (q.start) queries.push(Query.greaterThanEqual('date', q.start.slice(0, 10)));
    if (q.end)   queries.push(Query.lessThanEqual('date', q.end.slice(0, 10)));
    const rows = await db.find('food_log_entries', queries, 50000);

    // Aggregate by date in code (Appwrite has no GROUP BY)
    const byDate = {};
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date, dietary_energy_kcal: 0, protein_g: 0, carbohydrates_g: 0, total_fat_g: 0 };
      byDate[r.date].dietary_energy_kcal += r.calories || 0;
      byDate[r.date].protein_g           += r.protein_g || 0;
      byDate[r.date].carbohydrates_g     += r.carbs_g || 0;
      byDate[r.date].total_fat_g         += r.fat_g || 0;
    }
    const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    return res.json({ data });
  }

  // GET /api/food-log/items — raw food log entries
  if (method === 'GET' && path === '/api/food-log/items') {
    const queries = [Query.equal('user_id', userId), Query.orderDesc('date')];
    if (q.start) queries.push(Query.greaterThanEqual('date', q.start.slice(0, 10)));
    if (q.end)   queries.push(Query.lessThanEqual('date', q.end.slice(0, 10)));
    const rows = await db.find('food_log_entries', queries, 50000);
    return res.json({ data: rows.map(d => ({ id: d.$id, ...strip$(d) })) });
  }

  // GET /api/food-log/status
  if (method === 'GET' && path === '/api/food-log/status') {
    const rows = await db.find('food_log_entries', [Query.equal('user_id', userId), Query.select(['date']), Query.orderAsc('date')], 50000);
    return res.json({
      count: rows.length,
      earliest: rows.length ? rows[0].date : null,
      latest: rows.length ? rows[rows.length - 1].date : null,
    });
  }

  // DELETE /api/food-log/clear
  if (method === 'DELETE' && path === '/api/food-log/clear') {
    await db.removeMany('food_log_entries', [Query.equal('user_id', userId)]);
    return res.json({ ok: true });
  }

  // PUT /api/food-log/items/:id/note
  const noteMatch = path.match(/^\/api\/food-log\/items\/([^/]+)\/note$/);
  if (method === 'PUT' && noteMatch) {
    const docId = noteMatch[1];
    const doc = await db.findOne('food_log_entries', [Query.equal('$id', docId), Query.equal('user_id', userId)]);
    if (!doc) return res.json({ error: 'entry not found' }, 404);
    const note = body.note !== undefined ? (String(body.note || '').trim() || null) : null;
    await db.update('food_log_entries', docId, { note });
    return res.json({ ok: true, id: docId, note });
  }

  return res.json({ error: 'Not found' }, 404);
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...rest } = doc;
  return rest;
}
