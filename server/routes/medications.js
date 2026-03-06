const express = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = express.Router();

let medicationNameSeed = [];
try {
  const p = path.resolve(__dirname, '..', 'data', 'medication_names.json');
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) medicationNameSeed = parsed.map(x => String(x).trim()).filter(Boolean);
} catch (_) {
  medicationNameSeed = [];
}

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
  { generic: 'Dapagliflozin', brands: ['Farxiga'] },
  { generic: 'Sitagliptin', brands: ['Januvia'] },
  { generic: 'Semaglutide', brands: ['Ozempic', 'Wegovy', 'Rybelsus'] },
  { generic: 'Insulin Glargine', brands: ['Lantus', 'Basaglar', 'Toujeo'] },
  { generic: 'Insulin Lispro', brands: ['Humalog', 'Admelog'] },
  { generic: 'Amlodipine', brands: ['Norvasc'] },
  { generic: 'Lisinopril', brands: ['Zestril', 'Prinivil'] },
  { generic: 'Losartan', brands: ['Cozaar'] },
  { generic: 'Valsartan', brands: ['Diovan'] },
  { generic: 'Irbesartan', brands: ['Avapro'] },
  { generic: 'Enalapril', brands: ['Vasotec'] },
  { generic: 'Benazepril', brands: ['Lotensin'] },
  { generic: 'Metoprolol', brands: ['Lopressor', 'Toprol XL'] },
  { generic: 'Carvedilol', brands: ['Coreg'] },
  { generic: 'Propranolol', brands: ['Inderal'] },
  { generic: 'Spironolactone', brands: ['Aldactone'] },
  { generic: 'Hydrochlorothiazide', brands: ['Microzide'] },
  { generic: 'Furosemide', brands: ['Lasix'] },
  { generic: 'Atorvastatin', brands: ['Lipitor'] },
  { generic: 'Rosuvastatin', brands: ['Crestor'] },
  { generic: 'Ezetimibe', brands: ['Zetia'] },
  { generic: 'Apixaban', brands: ['Eliquis'] },
  { generic: 'Warfarin', brands: ['Coumadin', 'Jantoven'] },
  { generic: 'Clopidogrel', brands: ['Plavix'] },
  { generic: 'Levothyroxine', brands: ['Synthroid', 'Levoxyl'] },
  { generic: 'Albuterol', brands: ['Ventolin', 'ProAir', 'Proventil'] },
  { generic: 'Montelukast', brands: ['Singulair'] },
  { generic: 'Fluticasone', brands: ['Flonase'] },
  { generic: 'Gabapentin', brands: ['Neurontin'] },
  { generic: 'Pregabalin', brands: ['Lyrica'] },
  { generic: 'Duloxetine', brands: ['Cymbalta'] },
  { generic: 'Venlafaxine', brands: ['Effexor'] },
  { generic: 'Escitalopram', brands: ['Lexapro'] },
  { generic: 'Sertraline', brands: ['Zoloft'] },
  { generic: 'Fluoxetine', brands: ['Prozac'] },
  { generic: 'Paroxetine', brands: ['Paxil'] },
  { generic: 'Citalopram', brands: ['Celexa'] },
  { generic: 'Bupropion', brands: ['Wellbutrin'] },
  { generic: 'Trazodone', brands: ['Desyrel'] },
  { generic: 'Quetiapine', brands: ['Seroquel'] },
  { generic: 'Lamotrigine', brands: ['Lamictal'] },
  { generic: 'Levetiracetam', brands: ['Keppra'] },
  { generic: 'Topiramate', brands: ['Topamax'] },
  { generic: 'Clonazepam', brands: ['Klonopin'] },
  { generic: 'Diazepam', brands: ['Valium'] },
  { generic: 'Hydroxyzine', brands: ['Vistaril', 'Atarax'] },
  { generic: 'Zolpidem', brands: ['Ambien'] },
  { generic: 'Meloxicam', brands: ['Mobic'] },
  { generic: 'Cyclobenzaprine', brands: ['Flexeril'] },
  { generic: 'Baclofen', brands: ['Lioresal'] },
  { generic: 'Diclofenac', brands: ['Voltaren'] },
  { generic: 'Ondansetron', brands: ['Zofran'] },
  { generic: 'Sumatriptan', brands: ['Imitrex'] },
  { generic: 'Tamsulosin', brands: ['Flomax'] },
  { generic: 'Nitrofurantoin', brands: ['Macrobid'] },
  { generic: 'Amoxicillin', brands: ['Amoxil'] },
  { generic: 'Azithromycin', brands: ['Zithromax', 'Z-Pak'] },
  { generic: 'Doxycycline', brands: ['Vibramycin'] },
  { generic: 'Clindamycin', brands: ['Cleocin'] },
  { generic: 'Fluconazole', brands: ['Diflucan'] },
  { generic: 'Valacyclovir', brands: ['Valtrex'] },
  { generic: 'Prednisone', brands: ['Deltasone'] },
  { generic: 'Dexamethasone', brands: ['Decadron'] },
  { generic: 'Tramadol', brands: ['Ultram'] },
];

const normalizeMedicationKey = (v) => String(v || '')
  .trim()
  .toLowerCase()
  .replace(/[()\[\],.]/g, ' ')
  .replace(/\s+/g, ' ');

const toTitleLike = (s) => String(s || '').trim().replace(/\s+/g, ' ');

const medicationAliasMap = new Map();
const medicationAutocompleteSet = new Set();

const registerMedicationAlias = (alias, generic) => {
  const aliasNorm = normalizeMedicationKey(alias);
  const genericName = toTitleLike(generic);
  if (!aliasNorm || !genericName) return;
  medicationAliasMap.set(aliasNorm, genericName);
  medicationAutocompleteSet.add(toTitleLike(alias));
  medicationAutocompleteSet.add(genericName);
};

for (const n of medicationNameSeed) {
  if (typeof n === 'string') {
    registerMedicationAlias(n, n);
    continue;
  }
  if (n && typeof n === 'object') {
    const generic = n.generic || n.name;
    if (!generic) continue;
    registerMedicationAlias(generic, generic);
    const aliases = Array.isArray(n.brands) ? n.brands : [];
    const extraAliases = Array.isArray(n.aliases) ? n.aliases : [];
    [...aliases, ...extraAliases].forEach((a) => registerMedicationAlias(a, generic));
  }
}

for (const pair of BRAND_GENERIC_PAIRS) {
  registerMedicationAlias(pair.generic, pair.generic);
  (pair.brands || []).forEach((b) => registerMedicationAlias(b, pair.generic));
}

const canonicalMedicationName = (name) => {
  const key = normalizeMedicationKey(name);
  if (!key) return '';
  return medicationAliasMap.get(key) || toTitleLike(name);
};

const { authenticate } = require('../middleware/auth');

const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isHexColor = s => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));

// GET /api/medications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    let query = db('medication_entries')
      .where({ user_id: userId })
      .select('id', 'date', 'time', 'medication_name', 'dosage', 'notes', 'taken_at', 'created_at')
      .orderBy('taken_at', 'desc');

    if (req.query.start) query = query.where('date', '>=', req.query.start.slice(0, 10));
    if (req.query.end) query = query.where('date', '<=', req.query.end.slice(0, 10));

    const dataRaw = await query;
    const data = dataRaw.map(r => ({
      ...r,
      medication_name: canonicalMedicationName(r.medication_name),
    }));
    res.json({ data });
  } catch (err) {
    console.error('medications list error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/medications/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [{ n }] = await db('medication_entries').where({ user_id: userId }).count('id as n');
    const range = await db('medication_entries')
      .where({ user_id: userId })
      .min('date as earliest')
      .max('date as latest')
      .first();
    res.json({ count: n || 0, earliest: range?.earliest || null, latest: range?.latest || null });
  } catch (err) {
    console.error('medications status error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/medications/names
router.get('/names', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    const userNames = await db('medication_entries')
      .where({ user_id: userId })
      .distinct('medication_name')
      .pluck('medication_name');

    const merged = [
      ...medicationAutocompleteSet,
      ...userNames.map(canonicalMedicationName),
      ...userNames,
    ]
      .map(x => String(x || '').trim())
      .filter(Boolean);

    const uniq = [...new Set(merged.map(x => x.toLowerCase()))].map(lc => (
      merged.find(v => v.toLowerCase() === lc)
    ));

    const filtered = q
      ? uniq.filter(n => n.toLowerCase().includes(q))
      : uniq;

    const names = filtered.sort((a, b) => a.localeCompare(b)).slice(0, 200);
    res.json({ names });
  } catch (err) {
    console.error('medications names error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/medications/quick-buttons
router.get('/quick-buttons', authenticate, async (req, res) => {
  try {
    const dataRaw = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .select('id', 'medication_name', 'dosage', 'color', 'sort_order')
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc');
    const data = dataRaw.map(r => ({
      ...r,
      medication_name: canonicalMedicationName(r.medication_name),
    }));
    res.json({ data });
  } catch (err) {
    console.error('medications quick-buttons list error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medications/quick-buttons
router.post('/quick-buttons', authenticate, async (req, res) => {
  try {
    const medicationName = canonicalMedicationName(req.body.medication_name);
    const dosage = String(req.body.dosage || '').trim();
    const color = isHexColor(req.body.color) ? String(req.body.color) : '#0a66c2';
    if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });

    const existing = await db('medication_quick_buttons')
      .where({ user_id: req.user.id, medication_name: medicationName })
      .whereRaw('IFNULL(dosage, "") = ?', [dosage])
      .first();
    if (existing) {
      return res.json({ ok: true, button: existing, existing: true });
    }

    const maxRow = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .max('sort_order as max_sort')
      .first();
    const sortOrder = Number.isFinite(Number(maxRow?.max_sort)) ? Number(maxRow.max_sort) + 1 : 0;

    const [id] = await db('medication_quick_buttons').insert({
      user_id: req.user.id,
      medication_name: medicationName,
      dosage: dosage || null,
      color,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    });
    const row = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).first();
    res.json({ ok: true, button: row });
  } catch (err) {
    console.error('medications quick-buttons create error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medications/quick-buttons/reorder
router.put('/quick-buttons/reorder', authenticate, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(x => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids array is required' });

    const existing = await db('medication_quick_buttons')
      .where({ user_id: req.user.id })
      .whereIn('id', ids)
      .pluck('id');
    if (existing.length !== ids.length) return res.status(400).json({ error: 'ids contain invalid entries' });

    await db.transaction(async trx => {
      for (let i = 0; i < ids.length; i += 1) {
        await trx('medication_quick_buttons')
          .where({ user_id: req.user.id, id: ids[i] })
          .update({ sort_order: i });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications quick-buttons reorder error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medications/quick-buttons/:id
router.put('/quick-buttons/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    const updates = {};
    if (req.body.medication_name !== undefined) {
      const medicationName = canonicalMedicationName(req.body.medication_name);
      if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });
      updates.medication_name = medicationName;
    }
    if (req.body.dosage !== undefined) updates.dosage = String(req.body.dosage || '').trim() || null;
    if (req.body.color !== undefined) {
      if (!isHexColor(req.body.color)) return res.status(400).json({ error: 'invalid color' });
      updates.color = String(req.body.color);
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'no updates provided' });

    const changed = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).update(updates);
    if (!changed) return res.status(404).json({ error: 'not found' });
    const row = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).first();
    res.json({ ok: true, button: row });
  } catch (err) {
    console.error('medications quick-buttons update error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/quick-buttons/:id
router.delete('/quick-buttons/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await db('medication_quick_buttons').where({ id, user_id: req.user.id }).delete();
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications quick-buttons delete error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medications
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const medicationName = canonicalMedicationName(req.body.medication_name);
    const dosage = String(req.body.dosage || '').trim();
    const notes = String(req.body.notes || '').trim();
    const takenAtInput = String(req.body.taken_at || '').trim();

    if (!medicationName) return res.status(400).json({ error: 'medication_name is required' });

    let takenDate = new Date();
    let date = dateKey(takenDate);
    let time = timeKey(takenDate);
    let takenAtStored = takenDate.toISOString();

    if (takenAtInput) {
      const m = takenAtInput.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) {
        date = m[1];
        time = m[2];
        // Keep local clock time exactly as entered by the user (no UTC shift).
        takenAtStored = `${date}T${time}:00`;
      } else {
        takenDate = new Date(takenAtInput);
        if (Number.isNaN(takenDate.getTime())) {
          return res.status(400).json({ error: 'invalid taken_at' });
        }
        date = dateKey(takenDate);
        time = timeKey(takenDate);
        takenAtStored = takenDate.toISOString();
      }
    }

    const [id] = await db('medication_entries').insert({
      user_id: userId,
      date,
      time,
      medication_name: medicationName,
      dosage: dosage || null,
      notes: notes || null,
      taken_at: takenAtStored,
      created_at: new Date().toISOString(),
    });

    const row = await db('medication_entries').where({ id, user_id: userId }).first();
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error('medications create error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/clear
router.delete('/clear/all', authenticate, async (req, res) => {
  try {
    await db('medication_entries').where({ user_id: req.user.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('medications clear error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medications/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await db('medication_entries').where({ id, user_id: req.user.id }).delete();
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('medications delete error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
