#!/usr/bin/env node
const Database = require('better-sqlite3');
const { Client, Databases, ID, Permission, Role, Query } = require('node-appwrite');

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(client);
const uid = '69d3b2639f75428dd401';
const perms = [Permission.read(Role.user(uid)), Permission.update(Role.user(uid)), Permission.delete(Role.user(uid))];
const db = new Database('./data/health.db', { readonly: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Fetching existing records from Appwrite...');
  const existing = new Set();
  let lastId = null;
  while (true) {
    const q = [Query.equal('user_id', uid), Query.limit(100)];
    if (lastId) q.push(Query.cursorAfter(lastId));
    const r = await databases.listDocuments('arfidwatch', 'health_data', q);
    r.documents.forEach(d => existing.add(d.type + '|' + d.timestamp));
    if (r.documents.length < 100) break;
    lastId = r.documents[r.documents.length - 1].$id;
  }
  console.log('Existing in Appwrite:', existing.size);

  const rows = db.prepare('SELECT type, value, timestamp, raw, import_id FROM health_data WHERE user_id = ?').all(1);
  const missing = rows.filter(r => {
    const key = r.type + '|' + r.timestamp;
    return existing.has(key) === false;
  });
  console.log('Missing records:', missing.length);

  let ok = 0;
  for (const r of missing) {
    const val = r.value != null ? parseFloat(r.value) : null;
    try {
      await databases.createDocument('arfidwatch', 'health_data', ID.unique(), {
        user_id: uid,
        type: r.type,
        value: Number.isFinite(val) ? val : null,
        timestamp: r.timestamp || new Date().toISOString(),
        raw: r.raw || null,
        import_id: r.import_id != null ? String(r.import_id) : null,
      }, perms);
      ok++;
    } catch(e) {
      console.error('Failed:', r.type, r.timestamp, e.message);
    }
    await sleep(200);
  }
  console.log('Inserted', ok, 'missing records');
  db.close();
})();
