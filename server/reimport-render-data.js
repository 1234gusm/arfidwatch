#!/usr/bin/env node
/**
 * Re-import: clear stale Appwrite data, then insert Render export.
 * Run: cd server && APPWRITE_API_KEY=xxx node reimport-render-data.js
 */
const fs = require('fs');
const path = require('path');
const { Client, Databases, ID, Permission, Role, Query } = require('node-appwrite');

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT  = '69d314770014fcf64eaf';
const APPWRITE_KEY      = process.env.APPWRITE_API_KEY;
const DB_ID             = 'arfidwatch';
const USER_ID           = '69d3b2639f75428dd401';
const BATCH             = 25;
const DELAY             = 300;

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
    const r = await client.listDocuments(DB_ID, collectionId, [Query.limit(100)]);
    if (r.documents.length === 0) break;
    await Promise.all(r.documents.map(d => client.deleteDocument(DB_ID, collectionId, d.$id)));
    total += r.documents.length;
    process.stdout.write(`  Deleted ${total} from ${collectionId}\r`);
    await sleep(200);
  }
  if (total) console.log(`  Deleted ${total} from ${collectionId}`);
}

async function batchInsert(collectionId, docs) {
  let ok = 0, fail = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(doc => client.createDocument(DB_ID, collectionId, ID.unique(), doc, perms))
    );
    results.forEach(r => {
      if (r.status === 'fulfilled') ok++;
      else { fail++; console.error(`  FAIL:`, r.reason?.message?.slice(0, 120) || r.reason); }
    });
    process.stdout.write(`  ${collectionId}: ${ok}/${docs.length}\r`);
    if (i + BATCH < docs.length) await sleep(DELAY);
  }
  console.log(`  ${collectionId}: ${ok} ok, ${fail} failed`);
  return { ok, fail };
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Re-import Render data → Appwrite');
  console.log('═══════════════════════════════════════════\n');

  // ── Phase 1: Delete existing data ──
  console.log('Phase 1: Clearing old data...');
  for (const col of ['health_data', 'food_log_entries', 'journal_entries', 'user_profiles', 'medication_entries', 'medication_quick_buttons', 'health_imports']) {
    await deleteAll(col);
  }

  // ── Phase 2: Import health data ──
  console.log('\nPhase 2: Importing health data...');
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
  await batchInsert('health_data', healthDocs);

  // ── Phase 3: Import food log entries ──
  console.log('\nPhase 3: Importing food log...');
  const food = load('food-log.json');
  const foodDocs = (food.data || []).map(r => ({
    user_id:   USER_ID,
    date:      (r.date || '').slice(0, 10),
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
  console.log(`  ${foodDocs.length} food entries to import`);
  await batchInsert('food_log_entries', foodDocs);

  // ── Phase 4: Import journal entries ──
  console.log('\nPhase 4: Importing journal...');
  const journal = load('journal.json');
  const journalDocs = (journal.entries || []).map(r => ({
    user_id: USER_ID,
    date:    (r.date || '').slice(0, 10),
    text:    r.text || '',
    mood:    r.mood != null ? String(r.mood) : '',
    title:   r.title || '',
  }));
  console.log(`  ${journalDocs.length} journal entries to import`);
  await batchInsert('journal_entries', journalDocs);

  // ── Phase 5: Import profile ──
  console.log('\nPhase 5: Importing profile...');
  const profile = load('profile.json');
  
  const jsonOrStr = v => {
    if (v == null) return '';
    if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const profileDoc = {
    user_id:                USER_ID,
    username:               profile.username || 'gus',
    export_period:          profile.export_period || 'month',
    share_token:            profile.share_token || '',
    share_passcode_hash:    '', // Can't transfer hash — user will need to re-set
    share_food_log:         profile.share_food_log ? true : false,
    share_food_notes:       profile.share_food_notes ? true : false,
    share_medications:      profile.share_medications ? true : false,
    share_journal:          profile.share_journal ? true : false,
    share_period:           profile.share_period || '',
    ingest_key_hash:        '', // Can't transfer — user will need to re-generate
    ingest_key_last_used_at: profile.ingest_key_last_used_at || '',
    health_auto_export_url: profile.health_auto_export_url || '',
    nav_tab_order:          jsonOrStr(profile.nav_tab_order),
    nav_hidden_tabs:        jsonOrStr(profile.nav_hidden_tabs),
    hidden_health_types:    jsonOrStr(profile.hidden_health_types),
    health_stat_order:      jsonOrStr(profile.health_stat_order),
    med_entry_colors:       jsonOrStr(profile.med_entry_colors),
  };

  try {
    await client.createDocument(DB_ID, 'user_profiles', ID.unique(), profileDoc, perms);
    console.log('  Profile imported');
  } catch(e) {
    console.error('  Profile failed:', e.message);
  }

  // ── Phase 6: Import medications ──
  console.log('\nPhase 6: Importing medications...');
  const meds = load('medications.json');
  if (meds.entries && meds.entries.length) {
    const medDocs = meds.entries.map(r => ({
      user_id:         USER_ID,
      date:            (r.date || '').slice(0, 10),
      time:            r.time || '',
      medication_name: r.medication_name || '',
      dosage:          r.dosage || '',
      notes:           r.notes || '',
      taken_at:        r.taken_at || '',
      created_at:      r.created_at || new Date().toISOString(),
    }));
    await batchInsert('medication_entries', medDocs);
  } else {
    console.log('  No medication entries');
  }

  // Quick buttons
  const buttons = load('quick-buttons.json');
  if (buttons.buttons && buttons.buttons.length) {
    const btnDocs = buttons.buttons.map(r => ({
      user_id:         USER_ID,
      medication_name: r.medication_name || '',
      dosage:          r.dosage || '',
      color:           r.color || '#4a90d9',
      sort_order:      r.sort_order || 0,
      created_at:      r.created_at || new Date().toISOString(),
    }));
    await batchInsert('medication_quick_buttons', btnDocs);
  } else {
    console.log('  No quick buttons');
  }

  // ── Phase 7: Import health imports ──
  console.log('\nPhase 7: Importing health imports...');
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
  await batchInsert('health_imports', importDocs);

  console.log('\n═══════════════════════════════════════════');
  console.log(' Done!');
  console.log('═══════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
