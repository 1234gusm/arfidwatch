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

/* ═══════════════════════════════════════════════════════════
   Offline PWA caching
   ═══════════════════════════════════════════════════════════ */
const CACHE_NAME = 'arfidwatch-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests, use network-first with HTML fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // For static assets, use cache-first
  if (url.pathname.startsWith('/static/') || url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return resp;
        });
      })
    );
    return;
  }
});

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

// Handle server-sent push notifications (work even when the site is closed)
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'ArfidWatch Reminder';
  const body  = data.body  || '';
  const tag   = data.tag   || 'arfidwatch-reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: self.registration.scope + 'logo192.png',
    })
  );
});
