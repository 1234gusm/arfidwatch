import { Query } from 'node-appwrite';
import webpush from 'web-push';

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, user_id, ...rest } = doc;
  return rest;
}

export async function handlePush({ req, res, db, userId, body, method, path }) {

  // GET /api/push/vapid-key
  if (method === 'GET' && path === '/api/push/vapid-key') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return res.json({ error: 'Push not ready' }, 503);
    return res.json({ publicKey });
  }

  // POST /api/push/subscribe
  if (method === 'POST' && path === '/api/push/subscribe') {
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.json({ error: 'Invalid subscription object' }, 400);
    }
    const existing = await db.findOne('push_subscriptions', [Query.equal('endpoint', endpoint)]);
    if (existing) {
      await db.update('push_subscriptions', existing.$id, {
        user_id: userId, p256dh: keys.p256dh, auth: keys.auth,
      });
    } else {
      await db.create('push_subscriptions', {
        user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
        created_at: new Date().toISOString(),
      }, userId);
    }
    return res.json({ ok: true });
  }

  // DELETE /api/push/subscribe
  if (method === 'DELETE' && path === '/api/push/subscribe') {
    const { endpoint } = body || {};
    if (endpoint) {
      await db.removeMany('push_subscriptions', [
        Query.equal('user_id', userId), Query.equal('endpoint', endpoint),
      ]);
    } else {
      await db.removeMany('push_subscriptions', [Query.equal('user_id', userId)]);
    }
    return res.json({ ok: true });
  }

  // POST /api/push/reminders
  if (method === 'POST' && path === '/api/push/reminders') {
    const { reminders, timezone } = body;
    if (!Array.isArray(reminders)) return res.json({ error: 'reminders must be array' }, 400);
    if (reminders.length > 100) return res.json({ error: 'too many reminders (max 100)' }, 400);
    const tz = (typeof timezone === 'string' && timezone.trim()) ? timezone.trim().slice(0, 100) : 'UTC';
    const existing = await db.findOne('user_reminders', [Query.equal('user_id', userId)]);
    const data = {
      reminders_json: JSON.stringify(reminders),
      timezone: tz,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await db.update('user_reminders', existing.$id, data);
    } else {
      await db.create('user_reminders', { user_id: userId, ...data }, userId);
    }
    return res.json({ ok: true });
  }

  // POST /api/push/test
  if (method === 'POST' && path === '/api/push/test') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@arfidwatch.app';
    if (!publicKey || !privateKey) return res.json({ error: 'Push not configured' }, 503);
    webpush.setVapidDetails(vapidSubject, publicKey, privateKey);

    const subs = await db.find('push_subscriptions', [Query.equal('user_id', userId)]);
    if (!subs.length) {
      return res.json({ error: 'No push subscription found. Open the Reminders section to register.' }, 404);
    }
    const payload = JSON.stringify({
      title: '🔔 ArfidWatch Test',
      body: 'Push notifications are working!',
      tag: 'test',
    });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          try { await db.remove('push_subscriptions', sub.$id); } catch (_) {}
        }
      }
    }
    return res.json({ ok: true, sent });
  }

  return res.json({ error: 'Not found' }, 404);
}
