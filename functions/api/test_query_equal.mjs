import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const db = new Databases(client);
const userId = '69d3b2639f75428dd401';

// Build the same queries the server builds for a vitals request
const baseTypes = 'heart_rate_avg_countmin,heart_rate,heartrate,pulse,heart_ratebeatsmin,resting_heart_rate_countmin,blood_pressure_systolic_mmhg,systolic,systolicmmhg,systolic_mmhg,sys,sysmmhg,blood_pressure_diastolic_mmhg,diastolic,diastolicmmhg,diastolic_mmhg,dia,diammhg,heart_rate_variability_ms,weight_lb,weight_kg,height_cm,height_in,blood_oxygen_saturation__,vo2_max_mlkgmin,body_fat_percentage__,body_mass_index_count,body_temperature_degf,blood_glucose_mgdl,respiratory_rate_countmin'.split(',');
const expanded = new Set(baseTypes);
for (const t of baseTypes) { expanded.add(`macrofactor_${t}`); expanded.add(`apple_${t}`); }
const typeArr = [...expanded];

const queries = [
  Query.equal('user_id', userId),
  Query.orderDesc('timestamp'),
  Query.greaterThanEqual('timestamp', '2026-01-07'),
  Query.select(['type', 'value', 'timestamp', 'raw', 'import_id']),
  Query.equal('type', typeArr),
];

try {
  console.log('Querying with', typeArr.length, 'type values...');
  const res = await db.listDocuments('arfidwatch', 'health_data', [...queries, Query.limit(100)]);
  console.log('Total documents:', res.total);
  console.log('Returned:', res.documents.length);
  if (res.documents.length > 0) {
    console.log('First doc fields:', Object.keys(res.documents[0]));
    const byType = {};
    res.documents.forEach(d => { byType[d.type] = (byType[d.type] || 0) + 1; });
    for (const [t, c] of Object.entries(byType).sort()) console.log(`  ${t}: ${c}`);
  }
} catch (e) {
  console.error('Query FAILED:', e.message);
  console.error('Code:', e.code);
  if (e.response) console.error('Response:', JSON.stringify(e.response).slice(0, 300));
}
