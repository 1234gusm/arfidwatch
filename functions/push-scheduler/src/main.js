import { Client, Databases, Query } from 'node-appwrite';
import webpush from 'web-push';

const DB_ID = 'arfidwatch';

const BODIES = {
  upload_files:    'Time to upload your latest health export files.',
  log_medications: "Don't forget to log your medications for today.",
};

function getLocalTime(now, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const raw_hh = parts.find(p => p.type === 'hour').value;
    const mm = parts.find(p => p.type === 'minute').value.padStart(2, '0');
    const hh = raw_hh === '24' ? '00' : raw_hh.padStart(2, '0');
    const day3 = parts.find(p => p.type === 'weekday').value;
    const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = DAY_MAP[day3] ?? -1;
    return { day, time: `${hh}:${mm}`, valid: day !== -1 };
  } catch {
    return { day: -1, time: '', valid: false };
  }
}

async function paginate(databases, collectionId, queries, limit = 100) {
  const all = [];
  let cursor = undefined;
  while (true) {
    const q = [...queries, Query.limit(limit)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const { documents } = await databases.listDocuments(DB_ID, collectionId, q);
    if (!documents.length) break;
    all.push(...documents);
    cursor = documents[documents.length - 1].$id;
    if (documents.length < limit) break;
  }
  return all;
}

export default async ({ req, res, log, error }) => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    error('VAPID keys not configured');
    return res.json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails('mailto:noreply@arfidwatch.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const now = new Date();
  const todayUTC = now.toISOString().slice(0, 10);

  // Fetch all user_reminders
  let reminderDocs;
  try {
    reminderDocs = await paginate(databases, 'user_reminders', []);
  } catch (e) {
    error(`Failed to fetch reminders: ${e.message}`);
    return res.json({ error: 'Failed to fetch reminders' });
  }

  let sent = 0, skipped = 0;

  for (const ur of reminderDocs) {
    let reminders;
    try { reminders = JSON.parse(ur.reminders_json); } catch { continue; }
    if (!Array.isArray(reminders) || !reminders.length) continue;

    const { day, time, valid } = getLocalTime(now, ur.timezone || 'UTC');
    if (!valid) continue;

    // Check if any reminder matches current time
    const matching = reminders.filter(r =>
      r.enabled && r.time === time && Array.isArray(r.days) && r.days.includes(day)
    );
    if (!matching.length) { skipped++; continue; }

    // Fetch push subscriptions for this user
    let subs;
    try {
      subs = await paginate(databases, 'push_subscriptions', [
        Query.equal('user_id', ur.user_id),
      ]);
    } catch { continue; }
    if (!subs.length) continue;

    for (const reminder of matching) {
      const payload = JSON.stringify({
        title: reminder.label || 'ArfidWatch Reminder',
        body: BODIES[reminder.type] || '',
        tag: reminder.id,
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            try { await databases.deleteDocument(DB_ID, 'push_subscriptions', sub.$id); } catch (_) {}
          }
        }
      }
    }
  }

  log(`Push scheduler: sent=${sent}, users_checked=${reminderDocs.length}, skipped=${skipped}`);
  return res.json({ sent, checked: reminderDocs.length });
};
