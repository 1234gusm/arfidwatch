import { Client, Databases, Query } from 'node-appwrite';
const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const databases = new Databases(client);
const userId = '69d3b2639f75428dd401';
const DB = 'arfidwatch';

// Simulate db.find with pagination
async function dbFind(collection, queries, limit = 5000) {
  const all = [];
  let offset = 0;
  const batchSize = 100;
  while (all.length < limit) {
    const batch = await databases.listDocuments(DB, collection, [...queries, Query.limit(batchSize), Query.offset(offset)]);
    all.push(...batch.documents);
    if (batch.documents.length < batchSize) break;
    offset += batchSize;
  }
  return all.slice(0, limit);
}

// Mimic the Vitals page request: ?start=2026-01-07&types=heart_rate_avg_countmin,...
const startDate = '2026-01-07';
const vitalsTypes = [
  'heart_rate_avg_countmin','heart_rate','heartrate','pulse','heart_ratebeatsmin',
  'resting_heart_rate_countmin',
  'blood_pressure_systolic_mmhg','systolic','systolicmmhg','systolic_mmhg','sys','sysmmhg',
  'blood_pressure_diastolic_mmhg','diastolic','diastolicmmhg','diastolic_mmhg','dia','diammhg',
  'heart_rate_variability_ms','weight_lb','weight_kg','height_cm','height_in',
  'blood_oxygen_saturation__','vo2_max_mlkgmin','body_fat_percentage__',
  'body_mass_index_count','body_temperature_degf','blood_glucose_mgdl','respiratory_rate_countmin'
];
const expanded = new Set(vitalsTypes);
for (const t of vitalsTypes) { expanded.add(`macrofactor_${t}`); expanded.add(`apple_${t}`); }
const typeArr = [...expanded];

const queries = [
  Query.equal('user_id', userId),
  Query.orderDesc('timestamp'),
  Query.greaterThanEqual('timestamp', startDate),
  Query.select(['type', 'value', 'timestamp', 'raw', 'import_id']),
  Query.equal('type', typeArr),
];
const rows = await dbFind('health_data', queries, 5000);
console.log(`Raw rows: ${rows.length}`);

// Now apply DEDUP just like the server does
const byKey = {};
for (const r of rows) {
  const date = (r.timestamp || '').slice(0, 10);
  if (!date) continue;
  const v = parseFloat(r.value);
  if (!Number.isFinite(v)) continue;
  let isIHealth = false;
  try { isIHealth = JSON.parse(String(r.raw || '{}')).source === 'ihealth_csv'; } catch (_) {}
  const key = isIHealth ? `${r.type}::${r.timestamp}` : `${r.type}::${date}`;
  if (!byKey[key] || v > parseFloat(byKey[key].value)) {
    byKey[key] = r;
  }
}
const deduped = Object.values(byKey);
deduped.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
console.log(`After dedup: ${deduped.length}`);

// Group by type
const byType = {};
deduped.forEach(d => {
  if (!byType[d.type]) byType[d.type] = [];
  byType[d.type].push(d);
});
for (const [type, docs] of Object.entries(byType).sort()) {
  console.log(`  ${type}: ${docs.length}`);
}

// Now simulate what the client VitalsPage does
const canonical = t => {
  if (!t) return t;
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};
const getSource = r => { try { return JSON.parse(String(r.raw || '{}')).source || ''; } catch (_) { return ''; } };

const allKeys = new Set(vitalsTypes);
const autoByType = {};
const ihByType = {};
deduped.forEach(r => {
  const ct = canonical(r.type);
  if (!allKeys.has(ct)) return;
  const v = parseFloat(r.value);
  if (!Number.isFinite(v)) return;
  const day = (r.timestamp || '').slice(0, 10);
  if (!day) return;
  if (getSource(r) === 'ihealth_csv') {
    if (!ihByType[ct]) ihByType[ct] = [];
    ihByType[ct].push({ ts: r.timestamp, day, v });
  } else {
    if (!autoByType[ct]) autoByType[ct] = {};
    if (!autoByType[ct][day]) autoByType[ct][day] = { sum: 0, count: 0 };
    autoByType[ct][day].sum += v;
    autoByType[ct][day].count += 1;
  }
});
console.log('\nClient-side classification:');
console.log('autoByType keys:', Object.keys(autoByType));
console.log('ihByType keys:', Object.keys(ihByType));
for (const [k, v] of Object.entries(ihByType)) console.log(`  ih ${k}: ${v.length} readings`);
for (const [k, v] of Object.entries(autoByType)) console.log(`  auto ${k}: ${Object.keys(v).length} days`);
