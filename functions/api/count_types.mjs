import { Client, Databases, Query } from 'node-appwrite';

const c = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf')
  .setKey('standard_ffc3b813b3af1291e8614afb125a5d3d2435a3eeaa5d0cbc560042e6ae8b34ee44ee9847af19f44d46731d786fe17b8c1712636df30dc9b11dd25f73cc800414105870c5da8984e264ee3d643b60964929e5b94f6f8a2a0217626e6644f28b6b11613e99361edfff994a78c7d900793d90687d5b88275b9c58e55f8e732f5d44');
const db = new Databases(c);

const userId = '69d3b2639f75428dd401';
const DB = 'arfidwatch';
const COL = 'health_data';

async function fetchAll() {
  let all = [];
  let cursor = null;
  for (let i = 0; i < 100; i++) {
    const q = [Query.equal('user_id', userId), Query.limit(5000)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB, COL, q);
    all = all.concat(res.documents);
    if (res.documents.length < 5000) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return all;
}

const docs = await fetchAll();
console.log('Total records:', docs.length);

// Count by type
const typeCounts = {};
for (const d of docs) {
  typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
}

// Sort by count desc
const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
console.log('\nType counts:');
for (const [t, c] of sorted) {
  console.log(`  ${t}: ${c}`);
}

// Date range
const dates = docs.map(d => d.timestamp).sort();
console.log('\nDate range:', dates[0], 'to', dates[dates.length - 1]);

// Check for BP data specifically
const bpTypes = docs.filter(d => d.type.includes('blood_pressure') || d.type.includes('systolic') || d.type.includes('diastolic'));
console.log('\nBP records:', bpTypes.length);
if (bpTypes.length > 0) {
  const bpByDate = {};
  for (const d of bpTypes) {
    const date = d.timestamp.slice(0, 10);
    if (!bpByDate[date]) bpByDate[date] = [];
    bpByDate[date].push(`${d.type}=${d.value}`);
  }
  for (const [date, vals] of Object.entries(bpByDate).sort()) {
    console.log(`  ${date}: ${vals.join(', ')}`);
  }
}

// Calorie/dietary data
const calTypes = docs.filter(d => d.type.includes('calori') || d.type.includes('dietary'));
console.log('\nCalorie/dietary records:', calTypes.length);
const calByDate = {};
for (const d of calTypes) {
  const date = d.timestamp.slice(0, 10);
  if (!calByDate[date]) calByDate[date] = [];
  calByDate[date].push(`${d.type}=${d.value}`);
}
for (const [date, vals] of Object.entries(calByDate).sort().slice(-10)) {
  console.log(`  ${date}: ${vals.join(', ')}`);
}

// Sleep data
const sleepTypes = docs.filter(d => d.type.includes('sleep'));
console.log('\nSleep records:', sleepTypes.length);
const sleepByDate = {};
for (const d of sleepTypes) {
  const date = d.timestamp.slice(0, 10);
  if (!sleepByDate[date]) sleepByDate[date] = [];
  sleepByDate[date].push(`${d.type}=${d.value}`);
}
for (const [date, vals] of Object.entries(sleepByDate).sort().slice(-5)) {
  console.log(`  ${date}: ${vals.join(', ')}`);
}
