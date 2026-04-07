import { Client, Databases, Query } from 'node-appwrite';

const c = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');

const db = new Databases(c);
const userId = '69d3b2639f75428dd401';

async function main() {
  const all = [];
  let lastId = null;
  for (let i = 0; i < 4; i++) {
    const q = [
      Query.equal('user_id', userId),
      Query.orderDesc('timestamp'),
      Query.limit(5000),
      Query.select(['type','value','timestamp']),
    ];
    if (lastId) q.push(Query.cursorAfter(lastId));
    const r = await db.listDocuments('arfidwatch','health_data', q);
    all.push(...r.documents);
    console.log(`Batch ${i}: ${r.documents.length} docs (total so far: ${all.length})`);
    if (r.documents.length < 5000) break;
    lastId = r.documents[r.documents.length-1].$id;
  }
  console.log(`\nTotal fetched: ${all.length}`);

  // Count by type
  const types = {};
  all.forEach(d => { types[d.type] = (types[d.type] || 0) + 1; });
  const sorted = Object.entries(types).sort((a,b) => b[1]-a[1]);
  console.log(`Unique types: ${sorted.length}`);
  sorted.forEach(([t,c]) => console.log(`  ${String(c).padStart(5)} ${t}`));

  // Check date range
  const dates = all.map(d => d.timestamp).filter(Boolean).sort();
  console.log(`\nDate range: ${dates[0]?.slice(0,10)} to ${dates[dates.length-1]?.slice(0,10)}`);

  // Check calorie data per day (last 7 days)
  const calTypes = all.filter(d => d.type.includes('calori') || d.type.includes('energy') || d.type === 'dietary_energy_kcal');
  console.log(`\nCalorie/energy records: ${calTypes.length}`);
  const calByDay = {};
  calTypes.forEach(d => {
    const day = d.timestamp?.slice(0,10);
    if (!calByDay[day]) calByDay[day] = [];
    calByDay[day].push({ type: d.type, value: d.value });
  });
  Object.entries(calByDay).sort().slice(-10).forEach(([day, recs]) => {
    console.log(`  ${day}: ${recs.map(r => r.type + '=' + r.value).join(', ')}`);
  });

  // Check BP data
  const bp = all.filter(d => d.type.includes('blood_pressure') || d.type.includes('heart_rate'));
  console.log(`\nBP/HR records: ${bp.length}`);
  bp.slice(0,10).forEach(d => console.log(`  ${d.timestamp?.slice(0,19)} ${d.type} = ${d.value}`));
}

main().catch(e => console.error(e));
