import { Client, Databases, Query } from 'node-appwrite';
const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const db = new Databases(client);
const userId = '69d3b2639f75428dd401';

// Vitals-related types the page sends
const vitalsTypes = [
  'heart_rate_avg_countmin','heart_rate','heartrate','pulse','heart_ratebeatsmin',
  'resting_heart_rate_countmin',
  'blood_pressure_systolic_mmhg','systolic','systolicmmhg','systolic_mmhg','sys','sysmmhg',
  'blood_pressure_diastolic_mmhg','diastolic','diastolicmmhg','diastolic_mmhg','dia','diammhg',
  'heart_rate_variability_ms','weight_lb','weight_kg','height_cm','height_in',
  'blood_oxygen_saturation__','vo2_max_mlkgmin','body_fat_percentage__',
  'body_mass_index_count','body_temperature_degf','blood_glucose_mgdl','respiratory_rate_countmin'
];

// Also add macrofactor_ and apple_ prefixes like the server does
const expanded = new Set(vitalsTypes);
for (const t of vitalsTypes) {
  expanded.add(`macrofactor_${t}`);
  expanded.add(`apple_${t}`);
}
const typeArr = [...expanded];
console.log(`Query types count: ${typeArr.length}`);

const queries = [
  Query.equal('user_id', userId),
  Query.orderDesc('timestamp'),
  Query.select(['type', 'value', 'timestamp', 'raw']),
  Query.equal('type', typeArr),
];

const result = await db.listDocuments('arfidwatch', 'health_data', queries);
console.log(`Total docs returned: ${result.total}`);

// Group by type
const byType = {};
result.documents.forEach(d => {
  if (!byType[d.type]) byType[d.type] = [];
  byType[d.type].push(d);
});
for (const [type, docs] of Object.entries(byType).sort()) {
  const sources = docs.map(d => { try { return JSON.parse(d.raw || '{}').source || 'unknown'; } catch { return 'unknown'; }});
  const srcSet = [...new Set(sources)];
  console.log(`  ${type}: ${docs.length} records (sources: ${srcSet.join(', ')})`);
  // Print first 2 records
  docs.slice(0, 2).forEach(d => {
    console.log(`    ts=${d.timestamp} val=${d.value} raw=${(d.raw||'').substring(0,80)}`);
  });
}
