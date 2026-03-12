/* ArfidWatch — Reminder Service Worker */
/* global self */

let reminders = [];
const fired = new Set();

const TITLES = {
  upload_files:    '📁 Upload Health Files',
  log_medications: '💊 Log Medications',
  send_report:     '📤 Send Report to Doctor',
};

const BODIES = {
  upload_files:    'Time to upload your latest health export files.',
  log_medications: "Don't forget to log your medications for today.",
  send_report:     'Remember to send your health report to your doctor.',
};

function checkReminders() {
  const now  = new Date();
  const day  = now.getDay();
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  const date = now.toISOString().slice(0, 10);

  for (const r of reminders) {
    if (!r.enabled) continue;
    if (r.time !== time) continue;
    if (!Array.isArray(r.days) || !r.days.includes(day)) continue;
    const key = `${r.id}|${date}|${time}`;
    if (fired.has(key)) continue;
    fired.add(key);

    const title = r.label || TITLES[r.type] || 'ArfidWatch Reminder';
    self.registration.showNotification(title, {
      body:     BODIES[r.type] || '',
      tag:      r.id,
      renotify: true,
    });
  }

  // Prevent memory leak from accumulating fired keys
  if (fired.size > 500) {
    const keep = [...fired].slice(-250);
    fired.clear();
    keep.forEach(k => fired.add(k));
  }
}

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  if (event.data?.type === 'SET_REMINDERS') {
    reminders = Array.isArray(event.data.reminders) ? event.data.reminders : [];
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('arfidwatch'));
      if (existing) return existing.focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});

// Check every 30 seconds; fired-set deduplication prevents double-firing within a minute
setInterval(checkReminders, 30000);
