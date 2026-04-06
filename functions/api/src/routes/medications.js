import { Query } from 'node-appwrite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Medication name canonicalization (ported from server/routes/medications.js) ── */
let medicationNameSeed = [];
try {
  const p = resolve(__dirname, '..', 'data', 'medication_names.json');
  const raw = readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) medicationNameSeed = parsed.map(x => String(x).trim()).filter(Boolean);
} catch (_) { medicationNameSeed = []; }

const BRAND_GENERIC_PAIRS = [
  { generic: 'Cannabidiol (CBD)', brands: ['CBD', 'CBD Oil', 'CBD Gummies', 'Hemp CBD'] },
  { generic: 'Acetaminophen', brands: ['Tylenol'] },
  { generic: 'Ibuprofen', brands: ['Advil', 'Motrin'] },
  { generic: 'Naproxen', brands: ['Aleve'] },
  { generic: 'Diphenhydramine', brands: ['Benadryl'] },
  { generic: 'Loratadine', brands: ['Claritin'] },
  { generic: 'Cetirizine', brands: ['Zyrtec'] },
  { generic: 'Fexofenadine', brands: ['Allegra'] },
  { generic: 'Omeprazole', brands: ['Prilosec'] },
  { generic: 'Esomeprazole', brands: ['Nexium'] },
  { generic: 'Pantoprazole', brands: ['Protonix'] },
  { generic: 'Famotidine', brands: ['Pepcid'] },
  { generic: 'Metformin', brands: ['Glucophage'] },
  { generic: 'Empagliflozin', brands: ['Jardiance'] },
  { generic: 'Semaglutide', brands: ['Ozempic', 'Wegovy', 'Rybelsus'] },
  { generic: 'Amlodipine', brands: ['Norvasc'] },
  { generic: 'Lisinopril', brands: ['Zestril', 'Prinivil'] },
  { generic: 'Losartan', brands: ['Cozaar'] },
  { generic: 'Metoprolol', brands: ['Lopressor', 'Toprol XL'] },
  { generic: 'Atorvastatin', brands: ['Lipitor'] },
  { generic: 'Rosuvastatin', brands: ['Crestor'] },
  { generic: 'Levothyroxine', brands: ['Synthroid', 'Levoxyl'] },
  { generic: 'Gabapentin', brands: ['Neurontin'] },
  { generic: 'Escitalopram', brands: ['Lexapro'] },
  { generic: 'Sertraline', brands: ['Zoloft'] },
  { generic: 'Fluoxetine', brands: ['Prozac'] },
  { generic: 'Bupropion', brands: ['Wellbutrin'] },
  { generic: 'Trazodone', brands: ['Desyrel'] },
  { generic: 'Lamotrigine', brands: ['Lamictal'] },
  { generic: 'Hydroxyzine', brands: ['Vistaril', 'Atarax'] },
  { generic: 'Ondansetron', brands: ['Zofran'] },
  { generic: 'Amoxicillin', brands: ['Amoxil'] },
  { generic: 'Azithromycin', brands: ['Zithromax', 'Z-Pak'] },
  { generic: 'Prednisone', brands: ['Deltasone'] },
];

const normalizeMedicationKey = v => String(v || '').trim().toLowerCase().replace(/[()\[\],.]/g, ' ').replace(/\s+/g, ' ');
const toTitleLike = s => String(s || '').trim().replace(/\s+/g, ' ');

const medicationAliasMap = new Map();
const medicationAutocompleteSet = new Set();
const registerAlias = (alias, generic) => {
  const k = normalizeMedicationKey(alias);
  const g = toTitleLike(generic);
  if (!k || !g) return;
  medicationAliasMap.set(k, g);
  medicationAutocompleteSet.add(toTitleLike(alias));
  medicationAutocompleteSet.add(g);
};
for (const n of medicationNameSeed) {
  if (typeof n === 'string') { registerAlias(n, n); continue; }
  if (n && typeof n === 'object') {
    const generic = n.generic || n.name;
    if (!generic) continue;
    registerAlias(generic, generic);
    [...(n.brands || []), ...(n.aliases || [])].forEach(a => registerAlias(a, generic));
  }
}
for (const p of BRAND_GENERIC_PAIRS) {
  registerAlias(p.generic, p.generic);
  (p.brands || []).forEach(b => registerAlias(b, p.generic));
}
export const canonicalMedicationName = name => {
  const k = normalizeMedicationKey(name);
  return k ? (medicationAliasMap.get(k) || toTitleLike(name)) : '';
};

const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isHexColor = s => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));

export async function handleMedications({ req, res, db, userId, body, method, path }) {
  const q = req.query || {};

  // GET /api/medications
  if (method === 'GET' && path === '/api/medications') {
    const queries = [Query.equal('user_id', userId), Query.orderDesc('taken_at')];
    if (q.start) queries.push(Query.greaterThanEqual('date', q.start.slice(0, 10)));
    if (q.end)   queries.push(Query.lessThanEqual('date', q.end.slice(0, 10)));
    const rows = await db.find('medication_entries', queries, 50000);
    return res.json({
      data: rows.map(d => ({ id: d.$id, ...strip$(d), medication_name: canonicalMedicationName(d.medication_name) })),
    });
  }

  // GET /api/medications/status
  if (method === 'GET' && path === '/api/medications/status') {
    const rows = await db.find('medication_entries', [Query.equal('user_id', userId), Query.select(['date']), Query.orderAsc('date')], 50000);
    return res.json({
      count: rows.length,
      earliest: rows.length ? rows[0].date : null,
      latest: rows.length ? rows[rows.length - 1].date : null,
    });
  }

  // GET /api/medications/names
  if (method === 'GET' && path === '/api/medications/names') {
    const search = String(q.q || '').trim().toLowerCase();
    const userNames = await db.find('medication_entries', [Query.equal('user_id', userId), Query.select(['medication_name'])], 50000);
    const merged = [...medicationAutocompleteSet, ...userNames.map(r => canonicalMedicationName(r.medication_name)), ...userNames.map(r => r.medication_name)]
      .map(x => String(x || '').trim()).filter(Boolean);
    const uniq = [...new Set(merged.map(x => x.toLowerCase()))].map(lc => merged.find(v => v.toLowerCase() === lc));
    const filtered = search ? uniq.filter(n => n.toLowerCase().includes(search)) : uniq;
    return res.json({ names: filtered.sort((a, b) => a.localeCompare(b)).slice(0, 200) });
  }

  // GET /api/medications/quick-buttons
  if (method === 'GET' && path === '/api/medications/quick-buttons') {
    const rows = await db.find('medication_quick_buttons', [Query.equal('user_id', userId), Query.orderAsc('sort_order')], 500);
    return res.json({
      data: rows.map(d => ({ id: d.$id, ...strip$(d), medication_name: canonicalMedicationName(d.medication_name) })),
    });
  }

  // POST /api/medications/quick-buttons
  if (method === 'POST' && path === '/api/medications/quick-buttons') {
    const medicationName = canonicalMedicationName(body.medication_name);
    const dosage = String(body.dosage || '').trim();
    const color = isHexColor(body.color) ? String(body.color) : '#0a66c2';
    if (!medicationName) return res.json({ error: 'medication_name is required' }, 400);
    // Check for existing
    const existing = await db.find('medication_quick_buttons', [
      Query.equal('user_id', userId), Query.equal('medication_name', medicationName),
    ], 100);
    const dup = existing.find(e => (e.dosage || '') === dosage);
    if (dup) return res.json({ ok: true, button: { id: dup.$id, ...strip$(dup) }, existing: true });
    const maxSort = existing.reduce((m, e) => Math.max(m, e.sort_order || 0), -1);
    const doc = await db.create('medication_quick_buttons', {
      user_id: userId, medication_name: medicationName, dosage: dosage || null,
      color, sort_order: maxSort + 1,
    }, userId);
    return res.json({ ok: true, button: { id: doc.$id, ...strip$(doc) } });
  }

  // PUT /api/medications/quick-buttons/reorder
  if (method === 'PUT' && path === '/api/medications/quick-buttons/reorder') {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await db.update('medication_quick_buttons', ids[i], { sort_order: i });
    }
    return res.json({ ok: true });
  }

  // PUT /api/medications/quick-buttons/:id
  const qbUpdateMatch = path.match(/^\/api\/medications\/quick-buttons\/([^/]+)$/);
  if (method === 'PUT' && qbUpdateMatch) {
    const docId = qbUpdateMatch[1];
    const updates = {};
    if (body.medication_name !== undefined) {
      const mn = canonicalMedicationName(body.medication_name);
      if (!mn) return res.json({ error: 'medication_name is required' }, 400);
      updates.medication_name = mn;
    }
    if (body.dosage !== undefined) updates.dosage = String(body.dosage || '').trim() || null;
    if (body.color !== undefined) {
      if (!isHexColor(body.color)) return res.json({ error: 'invalid color' }, 400);
      updates.color = String(body.color);
    }
    if (!Object.keys(updates).length) return res.json({ error: 'no updates provided' }, 400);
    await db.update('medication_quick_buttons', docId, updates);
    const row = await db.findOne('medication_quick_buttons', [Query.equal('$id', docId)]);
    return res.json({ ok: true, button: { id: row.$id, ...strip$(row) } });
  }

  // DELETE /api/medications/quick-buttons/:id
  const qbDelMatch = path.match(/^\/api\/medications\/quick-buttons\/([^/]+)$/);
  if (method === 'DELETE' && qbDelMatch) {
    await db.remove('medication_quick_buttons', qbDelMatch[1]);
    return res.json({ ok: true });
  }

  // POST /api/medications
  if (method === 'POST' && path === '/api/medications') {
    const medicationName = canonicalMedicationName(body.medication_name);
    const dosage = String(body.dosage || '').trim().slice(0, 500);
    const notes = String(body.notes || '').trim().slice(0, 10000);
    const takenAtInput = String(body.taken_at || '').trim();
    if (!medicationName) return res.json({ error: 'medication_name is required' }, 400);
    let takenDate = new Date();
    let date = dateKey(takenDate);
    let time = timeKey(takenDate);
    let takenAtStored = takenDate.toISOString();
    if (takenAtInput) {
      const m = takenAtInput.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) { date = m[1]; time = m[2]; takenAtStored = `${date}T${time}:00`; }
      else {
        takenDate = new Date(takenAtInput);
        if (isNaN(takenDate.getTime())) return res.json({ error: 'invalid taken_at' }, 400);
        date = dateKey(takenDate); time = timeKey(takenDate); takenAtStored = takenDate.toISOString();
      }
    }
    const doc = await db.create('medication_entries', {
      user_id: userId, date, time, medication_name: medicationName,
      dosage: dosage || null, notes: notes || null,
      taken_at: takenAtStored, created_at: new Date().toISOString(),
    }, userId);
    return res.json({ ok: true, entry: { id: doc.$id, ...strip$(doc) } });
  }

  // DELETE /api/medications/clear/all
  if (method === 'DELETE' && path === '/api/medications/clear/all') {
    await db.removeMany('medication_entries', [Query.equal('user_id', userId)]);
    return res.json({ ok: true });
  }

  // DELETE /api/medications/:id
  const delMatch = path.match(/^\/api\/medications\/([^/]+)$/);
  if (method === 'DELETE' && delMatch) {
    await db.remove('medication_entries', delMatch[1]);
    return res.json({ ok: true });
  }

  return res.json({ error: 'Not found' }, 404);
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, user_id, ...rest } = doc;
  return rest;
}
