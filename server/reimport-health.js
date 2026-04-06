#!/usr/bin/env node
/**
 * Robust re-import of health_data + health_imports from Render export.
 * Uses parallel batches with retry for failed records.
 * 
 * Run: cd server && APPWRITE_API_KEY=xxx node reimport-health.js
 */
const fs = require('fs');
const path = require('path');
const { Client, Databases, ID, Permission, Role, Query } = require('node-appwrite');

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT  = '69d314770014fcf64eaf';
const APPWRITE_KEY      = process.env.APPWRITE_API_KEY;
const DB_ID             = 'arfidwatch';
const USER_ID           = '69d3b2639f75428dd401';

const BATCH_SIZE    = 20;    // parallel inserts per batch
const BATCH_DELAY   = 400;   // ms between batches
const MAX_RETRIES   = 5;

if (!APPWRITE_KEY) { console.error('Set APPWRITE_API_KEY'); process.exit(1); }

const client = new Databases(
  new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT).setKey(APPWRITE_KEY)
);

const perms = [
  Permission.read(Role.user(USER_ID)),
  Permission.update(Role.user(USER_ID)),
  Permission.delete(Role.user(USER_ID)),
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exportDir = path.join(__dirname, 'render-export');
const load = f => JSON.parse(fs.readFileSync(path.join(exportDir, f), 'utf8'));

async function deleteAll(collectionId) {
  let total = 0;
  while (true) {
    let r;
    try {
      r = await client.listDocuments(DB_ID, collectionId, [Query.limit(100)]);
    } catch (e) {
      console.log(`  Delete list error, retrying: ${e.message}`);
      await sleep(2000);
      continue;
    }
    if (r.documents.length === 0) break;
    // Delete in parallel batches of 20
    for (let i = 0; i < r.documents.length; i += 20) {
      const chunk = r.documents.slice(i, i + 20);
      await Promise.allSettled(chunk.map(d => client.deleteDocument(DB_ID, collectionId, d.$id)));
      total += chunk.length;
    }
    process.stdout.write(`  Deleted ${total} from ${collectionId}\r`);
    await sleep(200);
  }
  console.log(`  Deleted ${total} from ${collectionId}          `);
}

async function batchInsert(collectionId, docs) {
  let ok = 0;
  let failed = []; // collect failed docs for retry
  const startTime = Date.now();
  
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(doc => client.createDocument(DB_ID, collectionId, ID.unique(), doc, perms))
    );
    
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        ok++;
      } else {
        failed.push(batch[idx]);
      }
    });
    
    const total = ok + failed.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = (total / docs.length * 100).toFixed(1);
    process.stdout.write(`  ${collectionId}: ${ok}/${docs.length} (${pct}%) ${failed.length} pending retry | ${elapsed}s\r`);
    
    if (i + BATCH_SIZE < docs.length) await sleep(BATCH_DELAY);
  }
  
  // Retry failed records with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES && failed.length > 0; attempt++) {
    const retryDelay = BATCH_DELAY * attempt * 2;
    console.log(`\n  Retry ${attempt}/${MAX_RETRIES}: ${failed.length} records, delay=${retryDelay}ms`);
    await sleep(retryDelay);
    
    const stillFailed = [];
    for (let i = 0; i < failed.length; i += BATCH_SIZE) {
      const batch = failed.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(doc => client.createDocument(DB_ID, collectionId, ID.unique(), doc, perms))
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') ok++;
        else stillFailed.push(batch[idx]);
      });
      process.stdout.write(`  Retry ${attempt}: ${ok}/${docs.length}, ${stillFailed.length} still failing\r`);
      if (i + BATCH_SIZE < failed.length) await sleep(retryDelay);
    }
    failed = stillFailed;
  }
  
  const fail = failed.length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n  ${collectionId}: ${ok} ok, ${fail} failed (${elapsed}s)                     `);
  return { ok, fail };
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Re-import health_data + health_imports');
  console.log('═══════════════════════════════════════════\n');

  // Check current counts
  const curHealth = await client.listDocuments(DB_ID, 'health_data', [Query.limit(1)]);
  const curImports = await client.listDocuments(DB_ID, 'health_imports', [Query.limit(1)]);
  console.log(`Current: health_data=${curHealth.total}, health_imports=${curImports.total}\n`);

  // Phase 1: Delete existing
  if (curHealth.total > 0) {
    console.log('Phase 1: Clearing health_data...');
    await deleteAll('health_data');
  }
  if (curImports.total > 0) {
    console.log('Phase 1b: Clearing health_imports...');
    await deleteAll('health_imports');
  }
  
  // Verify deletion
  const afterDel = await client.listDocuments(DB_ID, 'health_data', [Query.limit(1)]);
  console.log(`After delete: health_data=${afterDel.total}\n`);

  // Phase 2: Import health data
  console.log('Phase 2: Importing health data...');
  const health = load('health.json');
  const healthDocs = (health.data || []).map(r => ({
    user_id:   USER_ID,
    type:      r.type || '',
    value:     typeof r.value === 'number' ? r.value : (parseFloat(r.value) || null),
    timestamp: r.timestamp || new Date().toISOString(),
    raw:       r.raw ? (typeof r.raw === 'string' ? r.raw : JSON.stringify(r.raw)) : null,
    import_id: r.import_id != null ? String(r.import_id) : null,
  }));
  console.log(`  ${healthDocs.length} health records to import`);
  console.log(`  Batch: ${BATCH_SIZE} parallel, ${BATCH_DELAY}ms delay, ${MAX_RETRIES} retries\n`);
  
  const healthResult = await batchInsert('health_data', healthDocs);

  // Phase 3: Import health_imports
  console.log('\nPhase 3: Importing health_imports...');
  const imports = load('health-imports.json');
  const importDocs = (imports.imports || []).map(r => ({
    user_id:      USER_ID,
    filename:     r.filename || '',
    source:       r.source || '',
    imported_at:  r.imported_at || new Date().toISOString(),
    record_count: r.record_count != null ? parseInt(r.record_count) : 0,
    file_hash:    r.file_hash || '',
  }));
  console.log(`  ${importDocs.length} import records to import`);
  const importResult = await batchInsert('health_imports', importDocs);

  // Final verification
  const finalHealth = await client.listDocuments(DB_ID, 'health_data', [Query.limit(1)]);
  const finalImports = await client.listDocuments(DB_ID, 'health_imports', [Query.limit(1)]);

  console.log('\n═══════════════════════════════════════════');
  console.log(` Results:`);
  console.log(`   health_data:    ${healthResult.ok} ok, ${healthResult.fail} failed (DB: ${finalHealth.total})`);
  console.log(`   health_imports: ${importResult.ok} ok, ${importResult.fail} failed (DB: ${finalImports.total})`);
  console.log(`   Expected:       41309 health, 112 imports`);
  console.log('═══════════════════════════════════════════');

  if (healthResult.fail > 0 || importResult.fail > 0) {
    console.log('\n⚠ Some records failed. Run again to add missing records.');
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
