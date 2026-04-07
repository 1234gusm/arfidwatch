/**
 * Migration script v2: Aggregate sub-daily Apple Health records into daily summaries.
 * Has retry logic and lower concurrency to avoid Appwrite rate limits.
 */
import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';

const c = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const db = new Databases(c);

const userId = '69d3b2639f75428dd401';
const DB = 'arfidwatch';
const COL = 'health_data';

const SUM_TYPES = new Set([
  'resting_energy_kcal', 'active_energy_kcal',
  'step_count_count', 'walking_running_distance_mi', 'walking___running_distance_mi',
  'apple_stand_time_min', 'apple_exercise_time_min', 'apple_stand_hour_count',
  'flights_climbed_count', 'swimming_stroke_count_count',
  'handwashing_s', 'toothbrushing_s', 'wheelchair_distance_mi',
]);

const AVG_TYPES = new Set([
  'heart_rate_avg_countmin', 'heart_rate_min_countmin', 'heart_rate_max_countmin',
  'heart_rate_variability_ms', 'resting_heart_rate_countmin',
  'walking_heart_rate_average_countmin',
  'physical_effort_kcalhrkg',
  'environmental_audio_exposure_dbaspl', 'headphone_audio_exposure_dbaspl',
  'walking_speed_mihr', 'walking_step_length_in',
  'walking_asymmetry_percentage', 'walking_asymmetry_percentage__',
  'walking_double_support_percentage', 'walking_double_support_percentage__',
  'respiratory_rate_countmin', 'resp_rate_min_countmin', 'resp_rate_max_countmin',
  'stair_speed__up_fts', 'stair_speed__down_fts', 'stair_speed_up_fts', 'stair_speed_down_fts',
]);

const ALL_SUB_DAILY = new Set([...SUM_TYPES, ...AVG_TYPES]);

const perms = [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

async function retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      if (i === attempts - 1) throw e;
      console.log(`    Retry ${i + 1}...`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchType(type) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 200; i++) {
    const q = [Query.equal('user_id', userId), Query.equal('type', type), Query.limit(5000)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await retry(() => db.listDocuments(DB, COL, q));
    all.push(...res.documents);
    console.log(`  Fetched batch ${i + 1}: ${res.documents.length} (total: ${all.length})`);
    if (res.documents.length < 5000) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return all;
}

async function migrate() {
  let totalDeleted = 0;
  let totalCreated = 0;

  for (const type of ALL_SUB_DAILY) {
    console.log(`\n--- Processing ${type} ---`);
    const docs = await fetchType(type);
    if (docs.length <= 1) {
      console.log(`  Skipping (${docs.length} records)`);
      continue;
    }

    // Group by date
    const byDate = {};
    for (const d of docs) {
      const date = (d.timestamp || '').slice(0, 10);
      if (!date) continue;
      const v = parseFloat(d.value);
      if (!Number.isFinite(v)) continue;
      if (!byDate[date]) byDate[date] = { values: [], docIds: [], importId: d.import_id };
      byDate[date].values.push(v);
      byDate[date].docIds.push(d.$id);
    }

    const method = SUM_TYPES.has(type) ? 'SUM' : 'AVG';
    let created = 0;
    let deleted = 0;

    const dates = Object.keys(byDate).sort();
    for (const date of dates) {
      const group = byDate[date];
      if (group.values.length <= 1) continue;

      const sum = group.values.reduce((a, b) => a + b, 0);
      const agg = method === 'SUM' ? sum : sum / group.values.length;

      // Create aggregate record
      await retry(() => db.createDocument(DB, COL, ID.unique(), {
        user_id: userId,
        type,
        value: agg,
        timestamp: `${date}T12:00:00.000Z`,
        import_id: group.importId || 'aggregated',
        raw: '',
      }, perms));
      created++;

      // Delete originals one by one with retry (to avoid rate limits)
      for (let i = 0; i < group.docIds.length; i += 5) {
        const chunk = group.docIds.slice(i, i + 5);
        await Promise.all(chunk.map(id => retry(() => db.deleteDocument(DB, COL, id))));
      }
      deleted += group.docIds.length;

      if (created % 10 === 0) {
        console.log(`  ${type}: ${created} days processed, ${deleted} originals deleted`);
      }
    }

    console.log(`  DONE: ${docs.length} → ${created} daily (${method}), deleted ${deleted}`);
    totalDeleted += deleted;
    totalCreated += created;
  }

  console.log(`\n=== Migration complete: created ${totalCreated}, deleted ${totalDeleted} ===`);

  // Final count
  let total = 0;
  let cursor = null;
  for (let i = 0; i < 200; i++) {
    const q = [Query.equal('user_id', userId), Query.limit(5000)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB, COL, q);
    total += res.documents.length;
    if (res.documents.length < 5000) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  console.log(`Final record count: ${total}`);
}

migrate().catch(e => { console.error('Migration failed:', e); process.exit(1); });
