import { Client, Databases, Users, Storage } from 'node-appwrite';
import { createDb } from './db.js';
import { handleAuth } from './routes/auth.js';
import { handleJournal } from './routes/journal.js';
import { handleFoodLog } from './routes/foodlog.js';
import { handleMedications } from './routes/medications.js';
import { handleProfile } from './routes/profile.js';
import { handlePush } from './routes/push.js';
import { handleShare } from './routes/share.js';
import { handleHealth } from './routes/health.js';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const users = new Users(client);
  const storage = new Storage(client);
  const db = createDb(databases);

  const path = req.path || '/';
  const method = (req.method || 'GET').toUpperCase();
  const userId = req.headers['x-appwrite-user-id'] || null;
  log(`>>> ${method} ${path} userId=${userId}`);

  let body = {};
  try {
    body = req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : {};
  } catch (_) {
    // body stays {}
  }

  const ctx = { req, res, db, users, storage, userId, body, method, path, log, error };

  // ── OPTIONS (CORS preflight) ──
  if (method === 'OPTIONS') {
    return res.send('', 204, { 'Access-Control-Allow-Origin': '*' });
  }

  try {
    // ── Share routes (no user auth required) ──
    if (path.startsWith('/api/share/')) {
      return await handleShare(ctx);
    }

    // ── Health routes (support ingest-key auth inside handler) ──
    if (path.startsWith('/api/health')) {
      return await handleHealth(ctx);
    }

    // ── All other routes require an authenticated user ──
    if (!userId) {
      return res.json({ error: 'Not authenticated' }, 401);
    }

    if (path.startsWith('/api/auth/'))        return await handleAuth(ctx);
    if (path.startsWith('/api/journal'))       return await handleJournal(ctx);
    if (path.startsWith('/api/food-log'))      return await handleFoodLog(ctx);
    if (path.startsWith('/api/medications'))   return await handleMedications(ctx);
    if (path.startsWith('/api/profile'))       return await handleProfile(ctx);
    if (path.startsWith('/api/push'))          return await handlePush(ctx);

    return res.json({ error: 'Not found' }, 404);
  } catch (err) {
    error(`Unhandled error: ${err.message}\n${err.stack}`);
    return res.json({ error: 'server error' }, 500);
  }
};
