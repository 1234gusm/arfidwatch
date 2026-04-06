#!/usr/bin/env node
/**
 * Pull ALL data from old Render backend and save to JSON files
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://arfidwatch.onrender.com';
const TOKEN = process.env.RENDER_TOKEN;
if (!TOKEN) { console.error('Set RENDER_TOKEN env var'); process.exit(1); }

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

const outDir = path.join(__dirname, 'render-export');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`  FAIL ${res.status} ${url}`);
    return null;
  }
  return res.json();
}

async function main() {
  console.log('Pulling data from Render backend...\n');

  // 1. Profile
  console.log('▶ Profile...');
  const profile = await fetchJson(`${BASE}/api/profile`);
  fs.writeFileSync(path.join(outDir, 'profile.json'), JSON.stringify(profile, null, 2));
  console.log('  saved profile.json');

  // 2. Health data (all time)
  console.log('▶ Health data...');
  const health = await fetchJson(`${BASE}/api/health?start=2000-01-01`);
  fs.writeFileSync(path.join(outDir, 'health.json'), JSON.stringify(health, null, 2));
  const hCount = health?.data?.length || 0;
  console.log(`  saved health.json (${hCount} records)`);

  // 3. Health imports
  console.log('▶ Health imports...');
  const imports = await fetchJson(`${BASE}/api/health/imports`);
  fs.writeFileSync(path.join(outDir, 'health-imports.json'), JSON.stringify(imports, null, 2));
  console.log(`  saved health-imports.json (${imports?.imports?.length || 0} imports)`);

  // 4. Food log (all time)
  console.log('▶ Food log...');
  const food = await fetchJson(`${BASE}/api/food-log/items?start=2000-01-01&end=2099-12-31`);
  fs.writeFileSync(path.join(outDir, 'food-log.json'), JSON.stringify(food, null, 2));
  console.log(`  saved food-log.json (${food?.data?.length || 0} entries)`);

  // 5. Journal (all time)
  console.log('▶ Journal...');
  const journal = await fetchJson(`${BASE}/api/journal?start=2000-01-01`);
  fs.writeFileSync(path.join(outDir, 'journal.json'), JSON.stringify(journal, null, 2));
  console.log(`  saved journal.json (${journal?.entries?.length || 0} entries)`);

  // 6. Medications (all time)
  console.log('▶ Medications...');
  const meds = await fetchJson(`${BASE}/api/medications?start=2000-01-01&end=2099-12-31`);
  fs.writeFileSync(path.join(outDir, 'medications.json'), JSON.stringify(meds, null, 2));
  console.log(`  saved medications.json (${meds?.entries?.length || 0} entries)`);

  // 7. Quick buttons
  console.log('▶ Medication quick buttons...');
  const buttons = await fetchJson(`${BASE}/api/medications/quick-buttons`);
  fs.writeFileSync(path.join(outDir, 'quick-buttons.json'), JSON.stringify(buttons, null, 2));
  console.log(`  saved quick-buttons.json (${buttons?.buttons?.length || 0} buttons)`);

  // 8. Sleep data
  console.log('▶ Sleep data...');
  const sleep = await fetchJson(`${BASE}/api/health/sleep/daily?days=9999&tzOffsetMinutes=240`);
  fs.writeFileSync(path.join(outDir, 'sleep.json'), JSON.stringify(sleep, null, 2));
  console.log(`  saved sleep.json (${sleep?.data?.length || 0} nights)`);

  // 9. Push/reminders
  console.log('▶ Reminders...');
  try {
    const reminders = await fetchJson(`${BASE}/api/push/reminders`);
    fs.writeFileSync(path.join(outDir, 'reminders.json'), JSON.stringify(reminders, null, 2));
    console.log('  saved reminders.json');
  } catch(e) { console.log('  no reminders'); }

  // 10. User info
  console.log('▶ User info...');
  const me = await fetchJson(`${BASE}/api/auth/me`);
  fs.writeFileSync(path.join(outDir, 'user.json'), JSON.stringify(me, null, 2));
  console.log('  saved user.json');

  console.log('\n✅ All data exported to', outDir);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
