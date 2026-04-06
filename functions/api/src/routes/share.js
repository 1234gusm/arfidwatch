import { Query } from 'node-appwrite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'appwrite-share-secret';

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateRangeForPeriod(period, clientToday) {
  const end = clientToday ? new Date(clientToday + 'T23:59:59') : new Date();
  const start = new Date(end);
  const subtract = { today: 0, month: 30, ninety: 90, two_weeks: 14 }[period] ?? 7;
  if (subtract > 0) start.setDate(start.getDate() - subtract);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function authenticateShareToken(req) {
  const auth = req.headers?.authorization;
  if (!auth) return null;
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'share') return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export async function handleShare({ req, res, db, body, method, path }) {
  const q = req.query || {};

  // GET /api/share/:shareToken — public metadata
  const metaMatch = path.match(/^\/api\/share\/([^/]+)$/);
  if (method === 'GET' && metaMatch) {
    const shareToken = metaMatch[1];
    const profile = await db.findOne('user_profiles', [Query.equal('share_token', shareToken)]);
    if (!profile) return res.json({ error: 'Share link not found or has been removed.' }, 404);
    // Look up username
    let username = 'Unknown';
    try {
      const { users } = await import('node-appwrite');
      // We don't have Users here, pass through ctx if needed; fallback to profile user_id
    } catch (_) {}
    return res.json({ username: profile.username || profile.user_id, has_passcode: !!profile.share_passcode_hash });
  }

  // POST /api/share/:shareToken/unlock
  const unlockMatch = path.match(/^\/api\/share\/([^/]+)\/unlock$/);
  if (method === 'POST' && unlockMatch) {
    const shareToken = unlockMatch[1];
    const profile = await db.findOne('user_profiles', [Query.equal('share_token', shareToken)]);
    if (!profile) return res.json({ error: 'Share link not found.' }, 404);
    if (profile.share_passcode_hash) {
      const { passcode } = body;
      if (!passcode) return res.json({ error: 'passcode required' }, 400);
      const ok = await bcrypt.compare(String(passcode), profile.share_passcode_hash);
      if (!ok) return res.json({ error: 'Incorrect passcode.' }, 401);
    }
    const shareJwt = jwt.sign(
      { type: 'share', share_token: shareToken, user_id: profile.user_id },
      JWT_SECRET,
      { expiresIn: '24h' },
    );
    return res.json({ token: shareJwt });
  }

  // GET /api/share/:shareToken/data
  const dataMatch = path.match(/^\/api\/share\/([^/]+)\/data$/);
  if (method === 'GET' && dataMatch) {
    const shareToken = dataMatch[1];
    const share = authenticateShareToken(req);
    if (!share) return res.json({ error: 'missing or invalid token' }, 401);
    if (share.share_token !== shareToken) return res.json({ error: 'token mismatch' }, 403);

    const userId = share.user_id;
    const profile = await db.findOne('user_profiles', [Query.equal('user_id', userId)]);
    const VALID_PERIODS = ['today', 'week', 'two_weeks', 'month', 'ninety'];
    const lockedPeriod = profile?.share_period || null;
    const reqPeriod = q.period;
    const exportPeriod = lockedPeriod
      || (VALID_PERIODS.includes(reqPeriod) ? reqPeriod : null)
      || profile?.export_period || 'week';

    const clientToday = q.today || null;
    const { start, end } = dateRangeForPeriod(exportPeriod, clientToday);
    const startDate = fmtDate(start);
    const endDate = fmtDate(end);

    const healthData = await db.find('health_data', [
      Query.equal('user_id', userId),
      Query.greaterThanEqual('timestamp', start.toISOString()),
      Query.lessThanEqual('timestamp', end.toISOString()),
    ], 50000);

    const journalEntries = profile?.share_journal
      ? await db.find('journal_entries', [
          Query.equal('user_id', userId),
          Query.greaterThanEqual('date', startDate),
          Query.lessThanEqual('date', endDate),
          Query.orderAsc('date'),
        ], 50000)
      : [];

    const foodLog = profile?.share_food_log
      ? await db.find('food_log_entries', [
          Query.equal('user_id', userId),
          Query.greaterThanEqual('date', startDate),
          Query.lessThanEqual('date', endDate),
          Query.orderAsc('date'),
        ], 50000)
      : [];

    const medications = profile?.share_medications
      ? await db.find('medication_entries', [
          Query.equal('user_id', userId),
          Query.greaterThanEqual('date', startDate),
          Query.lessThanEqual('date', endDate),
          Query.orderAsc('date'),
        ], 50000)
      : [];

    return res.json({
      username: profile?.username || userId,
      export_period: exportPeriod,
      period_locked: !!lockedPeriod,
      share_medications: !!profile?.share_medications,
      start: startDate,
      end: endDate,
      data: healthData.map(d => ({ type: d.type, value: d.value, timestamp: d.timestamp, raw: d.raw })),
      journal: journalEntries.map(d => ({ date: d.date, title: d.title, mood: d.mood })),
      food_log: foodLog.map(d => strip$(d)),
      medications: medications.map(d => strip$(d)),
    });
  }

  return res.json({ error: 'Not found' }, 404);
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, user_id, ...rest } = doc;
  return rest;
}
