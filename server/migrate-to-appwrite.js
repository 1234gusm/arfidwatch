#!/usr/bin/env node
/**
 * Migrate data from SQLite (data/health.db) → Appwrite Cloud
 * Run: cd server && node migrate-to-appwrite.js
 */
const Database = require('better-sqlite3');
const { Client, Databases, ID, Permission, Role } = require('node-appwrite');

// ── Config ─────────────────────────────────────────────────────────────
const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT  = '69d314770014fcf64eaf';
const APPWRITE_KEY      = process.env.APPWRITE_API_KEY;  // server API key
const DB_ID             = 'arfidwatch';

const OLD_USER_ID       = 1;                              // SQLite user_id for gusm
const NEW_USER_ID       = '69d3b2639f75428dd401';         // Appwrite user $id

const BATCH_SIZE        = 50;   // docs per batch (Appwrite rate-limits at ~60 req/s)
const BATCH_DELAY_MS    = 500;  // delay between batches

// ── Setup ──────────────────────────────────────────────────────────────
if (!APPWRITE_KEY) {
  console.error('Set APPWRITE_API_KEY env var');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT)
  .setKey(APPWRITE_KEY);

const databases = new Databases(client);
const db = new Database('./data/health.db', { readonly: true });

function userPerms(userId) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function batchInsert(collectionId, docs) {
  let ok = 0, fail = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(doc =>
        databases.createDocument(DB_ID, collectionId, ID.unique(), doc, userPerms(NEW_USER_ID))
      )
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') { ok++; }
      else { fail++; console.error(`  FAIL [${collectionId}]:`, r.reason?.message || r.reason); }
    });
    process.stdout.write(`  ${collectionId}: ${ok}/${docs.length} done\r`);
    if (i + BATCH_SIZE < docs.length) await sleep(BATCH_DELAY_MS);
  }
  console.log(`  ${collectionId}: ${ok} inserted, ${fail} failed`);
  return { ok, fail };
}

// ── Migrate health_data ────────────────────────────────────────────────
async function migrateHealthData() {
  console.log('\n▶ Migrating health_data...');
  const rows = db.prepare('SELECT type, value, timestamp, raw, import_id FROM health_data WHERE user_id = ?').all(OLD_USER_ID);
  console.log(`  Found ${rows.length} records`);

  const docs = rows.map(r => ({
    user_id:   NEW_USER_ID,
    type:      r.type,
    value:     r.value != null ? parseFloat(r.value) : null,
    timestamp: r.timestamp || new Date().toISOString(),
    raw:       r.raw || null,
    import_id: r.import_id != null ? String(r.import_id) : null,
  }));

  return batchInsert('health_data', docs);
}

// ── Migrate food_log_entries ───────────────────────────────────────────
async function migrateFoodLog() {
  console.log('\n▶ Migrating food_log_entries...');
  const rows = db.prepare('SELECT date, meal, food_name, quantity, calories, protein_g, carbs_g, fat_g, note, import_id FROM food_log_entries WHERE user_id = ?').all(OLD_USER_ID);
  console.log(`  Found ${rows.length} records`);

  const docs = rows.map(r => ({
    user_id:   NEW_USER_ID,
    date:      r.date || '',
    meal:      r.meal || '',
    food_name: r.food_name || '',
    quantity:  r.quantity || '',
    calories:  r.calories != null ? parseFloat(r.calories) : null,
    protein_g: r.protein_g != null ? parseFloat(r.protein_g) : null,
    carbs_g:   r.carbs_g != null ? parseFloat(r.carbs_g) : null,
    fat_g:     r.fat_g != null ? parseFloat(r.fat_g) : null,
    note:      r.note || '',
    import_id: r.import_id != null ? String(r.import_id) : null,
  }));

  return batchInsert('food_log_entries', docs);
}

// ── Migrate journal_entries ────────────────────────────────────────────
async function migrateJournal() {
  console.log('\n▶ Migrating journal_entries...');
  const rows = db.prepare('SELECT date, text, mood, title FROM journal_entries WHERE user_id = ?').all(OLD_USER_ID);
  console.log(`  Found ${rows.length} records`);

  const docs = rows.map(r => ({
    user_id: NEW_USER_ID,
    date:    r.date || '',
    text:    r.text || '',
    mood:    r.mood != null ? parseInt(r.mood, 10) : null,
    title:   r.title || '',
  }));

  return batchInsert('journal_entries', docs);
}

// ── Migrate medication_entries ─────────────────────────────────────────
async function migrateMedications() {
  console.log('\n▶ Migrating medication_entries...');
  const rows = db.prepare('SELECT date, time, medication_name, dosage, notes, taken_at, created_at FROM medication_entries WHERE user_id = ?').all(OLD_USER_ID);
  console.log(`  Found ${rows.length} records`);
  if (rows.length === 0) return { ok: 0, fail: 0 };

  const docs = rows.map(r => ({
    user_id:         NEW_USER_ID,
    date:            r.date || '',
    time:            r.time || '',
    medication_name: r.medication_name || '',
    dosage:          r.dosage || '',
    notes:           r.notes || '',
    taken_at:        r.taken_at || '',
    created_at:      r.created_at || new Date().toISOString(),
  }));

  return batchInsert('medication_entries', docs);
}

// ── Migrate medication_quick_buttons ───────────────────────────────────
async function migrateMedButtons() {
  console.log('\n▶ Migrating medication_quick_buttons...');
  const rows = db.prepare('SELECT medication_name, dosage, color, sort_order, created_at FROM medication_quick_buttons WHERE user_id = ?').all(OLD_USER_ID);
  console.log(`  Found ${rows.length} records`);
  if (rows.length === 0) return { ok: 0, fail: 0 };

  const docs = rows.map(r => ({
    user_id:         NEW_USER_ID,
    medication_name: r.medication_name || '',
    dosage:          r.dosage || '',
    color:           r.color || '#4a90d9',
    sort_order:      r.sort_order != null ? parseInt(r.sort_order, 10) : 0,
    created_at:      r.created_at || new Date().toISOString(),
  }));

  return batchInsert('medication_quick_buttons', docs);
}

// ── Migrate user_profiles ──────────────────────────────────────────────
async function migrateProfile() {
  console.log('\n▶ Migrating user_profiles...');
  const row = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(OLD_USER_ID);
  if (!row) { console.log('  No profile found, skipping'); return { ok: 0, fail: 0 }; }

  const doc = {
    user_id:                NEW_USER_ID,
    export_period:          row.export_period || 'month',
    share_token:            row.share_token || '',
    share_passcode_hash:    row.share_passcode_hash || '',
    share_food_log:         row.share_food_log ? true : false,
    share_food_notes:       row.share_food_notes ? true : false,
    share_medications:      row.share_medications ? true : false,
    share_journal:          row.share_journal ? true : false,
    ingest_key_hash:        row.ingest_key_hash || '',
    ingest_key_last_used_at: row.ingest_key_last_used_at || '',
    health_auto_export_url: row.health_auto_export_url || '',
    nav_tab_order:          row.nav_tab_order || '',
    nav_hidden_tabs:        row.nav_hidden_tabs || '',
    hidden_health_types:    row.hidden_health_types || '',
    health_stat_order:      row.health_stat_order || '',
    med_entry_colors:       row.med_entry_colors || '',
  };

  try {
    await databases.createDocument(DB_ID, 'user_profiles', ID.unique(), doc, userPerms(NEW_USER_ID));
    console.log('  Profile migrated successfully');
    return { ok: 1, fail: 0 };
  } catch (e) {
    console.error('  Profile migration failed:', e.message);
    return { ok: 0, fail: 1 };
  }
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' ArfidWatch Data Migration: SQLite → Appwrite');
  console.log('═══════════════════════════════════════════');
  console.log(`Old user_id: ${OLD_USER_ID} → New user_id: ${NEW_USER_ID}`);

  const results = {};
  results.health    = await migrateHealthData();
  results.food      = await migrateFoodLog();
  results.journal   = await migrateJournal();
  results.meds      = await migrateMedications();
  results.medBtns   = await migrateMedButtons();
  results.profile   = await migrateProfile();

  console.log('\n═══════════════════════════════════════════');
  console.log(' Migration Summary');
  console.log('═══════════════════════════════════════════');
  let totalOk = 0, totalFail = 0;
  for (const [name, r] of Object.entries(results)) {
    console.log(`  ${name}: ${r.ok} ok, ${r.fail} failed`);
    totalOk += r.ok;
    totalFail += r.fail;
  }
  console.log(`\n  TOTAL: ${totalOk} ok, ${totalFail} failed`);

  db.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
