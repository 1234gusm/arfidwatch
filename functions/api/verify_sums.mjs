import { Client, Databases, Query } from 'node-appwrite';

const c = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const db = new Databases(c);

const userId = '69d3b2639f75428dd401';
const DB = 'arfidwatch';
const COL = 'health_data';

// Fetch records for a specific type on a specific day
async function fetchTypeDay(type, date) {
  const q = [
    Query.equal('user_id', userId),
    Query.equal('type', type),
    Query.greaterThanEqual('timestamp', date),
    Query.lessThanEqual('timestamp', date + 'T23:59:59.999Z'),
    Query.limit(5000),
  ];
  const res = await db.listDocuments(DB, COL, q);
  return res.documents;
}

const testDate = '2026-04-05';
const sumTypes = ['resting_energy_kcal', 'active_energy_kcal', 'step_count_count', 
                  'walking_running_distance_mi', 'dietary_energy_kcal'];
const avgTypes = ['heart_rate_avg_countmin', 'physical_effort_kcalhrkg'];

console.log(`=== Data for ${testDate} ===\n`);

for (const type of sumTypes) {
  const docs = await fetchTypeDay(type, testDate);
  const values = docs.map(d => parseFloat(d.value)).filter(Number.isFinite);
  const sum = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values);
  const avg = values.length ? sum / values.length : 0;
  console.log(`${type}: ${values.length} records`);
  console.log(`  SUM=${sum.toFixed(2)}, MAX=${max.toFixed(4)}, AVG=${avg.toFixed(4)}`);
}
console.log('');
for (const type of avgTypes) {
  const docs = await fetchTypeDay(type, testDate);
  const values = docs.map(d => parseFloat(d.value)).filter(Number.isFinite);
  const sum = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values);
  const avg = values.length ? sum / values.length : 0;
  console.log(`${type}: ${values.length} records`);
  console.log(`  SUM=${sum.toFixed(2)}, MAX=${max.toFixed(4)}, AVG=${avg.toFixed(4)}`);
}
