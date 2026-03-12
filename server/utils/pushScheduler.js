const webpush = require('web-push');
const db = require('../db');

const BODIES = {
  upload_files:    'Time to upload your latest health export files.',
  log_medications: "Don't forget to log your medications for today.",
};

// Per-process deduplication: (user_id | reminder_id | date | time)
const fired = new Set();
let firedDate = null;

function getLocalTime(now, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour:     '2-digit',
      minute:   '2-digit',
      weekday:  'short',
      hour12:   false,
    });
    const parts = fmt.formatToParts(now);
    const raw_hh = parts.find(p => p.type === 'hour').value;
    const mm     = parts.find(p => p.type === 'minute').value.padStart(2, '0');
    // Normalize midnight: '24' → '00'
    const hh     = raw_hh === '24' ? '00' : raw_hh.padStart(2, '0');
    const day3   = parts.find(p => p.type === 'weekday').value; // Mon, Tue…
    const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = DAY_MAP[day3] ?? -1;
    return { day, time: `${hh}:${mm}`, valid: day !== -1 };
  } catch {
    return { day: -1, time: '', valid: false };
  }
}

async function checkAndSend() {
  const now = new Date();

  // Reset deduplication set daily
  const todayUTC = now.toISOString().slice(0, 10);
  if (firedDate !== todayUTC) {
    fired.clear();
    firedDate = todayUTC;
  }

  let rows;
  try {
    rows = await db('user_reminders').select('*');
  } catch { return; }

  for (const ur of rows) {
    let reminders;
    try { reminders = JSON.parse(ur.reminders_json); } catch { continue; }
    if (!Array.isArray(reminders) || !reminders.length) continue;

    const { day, time, valid } = getLocalTime(now, ur.timezone || 'UTC');
    if (!valid) continue;

    let subs;
    try {
      subs = await db('push_subscriptions').where({ user_id: ur.user_id }).select('*');
    } catch { continue; }
    if (!subs.length) continue;

    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      if (reminder.time !== time) continue;
      if (!Array.isArray(reminder.days) || !reminder.days.includes(day)) continue;

      const key = `${ur.user_id}|${reminder.id}|${todayUTC}|${time}`;
      if (fired.has(key)) continue;
      fired.add(key);

      const payload = JSON.stringify({
        title: reminder.label || 'ArfidWatch Reminder',
        body:  BODIES[reminder.type] || '',
        tag:   reminder.id,
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err) {
          // 410 Gone / 404 = subscription expired; clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            db('push_subscriptions').where({ id: sub.id }).delete().catch(() => {});
          }
        }
      }
    }
  }

  // Prevent unbounded growth mid-day
  if (fired.size > 1000) {
    const keep = [...fired].slice(-500);
    fired.clear();
    keep.forEach(k => fired.add(k));
  }
}

function startPushScheduler() {
  setInterval(checkAndSend, 60 * 1000);
  // Also run once shortly after startup so reminders due "now" aren't missed
  setTimeout(checkAndSend, 5000);
  console.log('Push reminder scheduler started');
}

module.exports = { startPushScheduler };
