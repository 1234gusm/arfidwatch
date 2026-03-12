/**
 * Maps supplement/vitamin medication entries to health_data type keys so they
 * can be surfaced on the Health and Share pages alongside imported nutrition data.
 */

// Each entry describes one supplement category.
//   patterns     — array of RegExp matched against the lowercased medication name
//   typeKey      — the health_data type key (matches typeMeta in HealthPage)
//   canonicalUnit — the unit stored for this type ('mg', 'mcg', 'g')
//   iuFactor     — multiply IU by this to get canonicalUnit (omit if not applicable)
const SUPPLEMENT_MAP = [
  // ── Vitamins ─────────────────────────────────────────────────────────────
  { patterns: [/\bvitamin\s*a\b/, /\bretinol\b/, /\bbeta[- ]?carotene\b/],
    typeKey: 'vitamin_a_mcg', canonicalUnit: 'mcg', iuFactor: 0.3 },

  { patterns: [/\bvitamin\s*b[- ]?1\b/, /\bthiamin(e)?\b/],
    typeKey: 'thiamin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*b[- ]?2\b/, /\briboflavin\b/],
    typeKey: 'riboflavin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*b[- ]?3\b/, /\bniacin(amide)?\b/, /\bnicotinamide\b/, /\bnicotinic\s*acid\b/],
    typeKey: 'niacin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*b[- ]?5\b/, /\bpantothenic\s*acid\b/],
    typeKey: 'pantothenic_acid_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*b[- ]?6\b/, /\bpyridoxin(e|al|amine)?\b/],
    typeKey: 'vitamin_b6_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*b[- ]?7\b/, /\bbiotin\b/],
    typeKey: 'biotin_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bvitamin\s*b[- ]?9\b/, /\bfolate\b/, /\bfolic\s*acid\b/, /\bmethylfolate\b/, /\bl-methylfolate\b/],
    typeKey: 'folate_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bvitamin\s*b[- ]?12\b/, /\bcyanocobalamin\b/, /\bmethylcobalamin\b/, /\bcobalamin\b/],
    typeKey: 'vitamin_b12_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bvitamin\s*c\b/, /\bascorbic\s*acid\b/],
    typeKey: 'vitamin_c_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvitamin\s*d[23]?\b/, /\bcholecalciferol\b/, /\bergocalciferol\b/],
    typeKey: 'vitamin_d_mcg', canonicalUnit: 'mcg', iuFactor: 0.025 },

  { patterns: [/\bvitamin\s*e\b/, /\b(alpha[- ]?)?tocopherol\b/],
    typeKey: 'vitamin_e_mg', canonicalUnit: 'mg', iuFactor: 0.67 },

  { patterns: [/\bvitamin\s*k2?\b/, /\bphylloquinone\b/, /\bmenaquinone\b/, /\bmk-[47]\b/],
    typeKey: 'vitamin_k_mcg', canonicalUnit: 'mcg' },

  // ── Minerals ─────────────────────────────────────────────────────────────
  { patterns: [/\biron\b/, /\bferrous\b/, /\bferric\b/],
    typeKey: 'iron_mg', canonicalUnit: 'mg' },

  { patterns: [/\bcalcium\b/],
    typeKey: 'calcium_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmagnesium\b/],
    typeKey: 'magnesium_mg', canonicalUnit: 'mg' },

  { patterns: [/\bzinc\b/],
    typeKey: 'zinc_mg', canonicalUnit: 'mg' },

  { patterns: [/\bchromium\b/],
    typeKey: 'chromium_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bcopper\b/],
    typeKey: 'copper_mg', canonicalUnit: 'mg' },

  { patterns: [/\biodine\b/, /\bpotassium\s*iodide\b/, /\bkelp\b/],
    typeKey: 'iodine_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bmanganese\b/],
    typeKey: 'manganese_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmolybdenum\b/],
    typeKey: 'molybdenum_mcg', canonicalUnit: 'mcg' },

  { patterns: [/\bpotassium\b/],
    typeKey: 'potassium_mg', canonicalUnit: 'mg' },

  { patterns: [/\bselenium\b/, /\bselenomet\w+\b/],
    typeKey: 'selenium_mcg', canonicalUnit: 'mcg' },
];

/**
 * Parse a dosage string like "1000 mg", "5000 IU", "400 mcg", "2.5 g", "25,000 IU".
 * Returns { value: number, unit: string } or null if unparseable.
 */
function parseDosage(dosageStr) {
  if (!dosageStr) return null;
  const s = String(dosageStr).trim();
  const m = s.match(/^([\d,]+(?:\.\d+)?)\s*(mcg|μg|ug|mg|iu|g)\b/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  const rawUnit = m[2].toLowerCase();
  const unit = rawUnit === 'μg' || rawUnit === 'ug' ? 'mcg' : rawUnit;
  return { value, unit };
}

/**
 * Convert a value in fromUnit to canonicalUnit.
 * Handles: g ↔ mg ↔ mcg, and IU → mg/mcg via iuFactor.
 */
function convertToCanonical(value, fromUnit, canonicalUnit, iuFactor) {
  const from = fromUnit.toLowerCase();
  const to = canonicalUnit.toLowerCase();

  if (from === to) return value;

  if (from === 'iu') {
    if (iuFactor == null) return null;
    // iuFactor gives value in canonicalUnit
    return value * iuFactor;
  }

  // Metric cascade: g → mg → mcg
  const ORDER = ['g', 'mg', 'mcg'];
  const fi = ORDER.indexOf(from);
  const ti = ORDER.indexOf(to);
  if (fi === -1 || ti === -1) return null;
  return value * Math.pow(1000, ti - fi);
}

/**
 * Given a medication_entry row, attempt to match it as a supplement and
 * return a synthetic health_data-shaped object, or null if not matchable.
 */
function medicationEntryToHealthRow(entry) {
  const nameLower = String(entry.medication_name || '').toLowerCase();

  let match = null;
  for (const supp of SUPPLEMENT_MAP) {
    if (supp.patterns.some(p => p.test(nameLower))) {
      match = supp;
      break;
    }
  }
  if (!match) return null;

  const parsed = parseDosage(entry.dosage);
  if (!parsed) return null;

  const value = convertToCanonical(parsed.value, parsed.unit, match.canonicalUnit, match.iuFactor);
  if (value == null || !Number.isFinite(value) || value <= 0) return null;

  // Prefer taken_at; fall back to date + time
  let timestamp = entry.taken_at || null;
  if (!timestamp && entry.date) {
    const timeStr = entry.time ? String(entry.time).slice(0, 8) : '08:00:00';
    const d = new Date(`${entry.date}T${timeStr}`);
    if (!Number.isNaN(d.getTime())) timestamp = d.toISOString();
  }
  if (!timestamp) return null;

  return {
    id: `supp_${entry.id}`,
    user_id: entry.user_id,
    type: match.typeKey,
    value,
    timestamp,
    raw: JSON.stringify({
      source: 'medication_log',
      medication_name: entry.medication_name,
      dosage: entry.dosage,
    }),
    import_id: null,
  };
}

module.exports = { medicationEntryToHealthRow, parseDosage, convertToCanonical };
