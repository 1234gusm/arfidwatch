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

  // ── Caffeine ─────────────────────────────────────────────────────────────
  { patterns: [/\bcaffeine\b/, /\bcaffein\b/],
    typeKey: 'caffeine_mg', canonicalUnit: 'mg' },

  // ── Amino Acids ──────────────────────────────────────────────────────────
  { patterns: [/\bcreatine\b/, /\bcreapure\b/],
    typeKey: 'creatine_g', canonicalUnit: 'g' },

  { patterns: [/\bl[- ]?glutamine\b/, /\bglutamine\b/],
    typeKey: 'l_glutamine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?arginine\b/, /\barginine\b/],
    typeKey: 'l_arginine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?lysine\b/, /\blysine\b/],
    typeKey: 'l_lysine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?leucine\b/, /^leucine\b/],
    typeKey: 'l_leucine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?isoleucine\b/, /\bisoleucine\b/],
    typeKey: 'l_isoleucine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?valine\b/, /^valine\b/],
    typeKey: 'l_valine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bbcaa\b/, /\bbranched[- ]?chain\b/],
    typeKey: 'bcaa_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?tryptophan\b/, /\btryptophan\b/],
    typeKey: 'l_tryptophan_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?tyrosine\b/, /\btyrosine\b/],
    typeKey: 'l_tyrosine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?phenylalanine\b/, /\bphenylalanine\b/],
    typeKey: 'l_phenylalanine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?methionine\b/, /\bmethionine\b/],
    typeKey: 'l_methionine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?threonine\b/, /\bthreonine\b/],
    typeKey: 'l_threonine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?histidine\b/, /\bhistidine\b/],
    typeKey: 'l_histidine_mg', canonicalUnit: 'mg' },

  // NAC must come before cysteine so it doesn't fall through to L-Cysteine
  { patterns: [/\bnac\b/, /\bn[- ]?acetyl[- ]?cysteine\b/],
    typeKey: 'nac_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?cysteine\b/, /\bcysteine\b/],
    typeKey: 'l_cysteine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?carnitine\b/, /\bcarnitine\b/, /\bacetyl[- ]?l[- ]?carnitine\b/, /\balcar\b/],
    typeKey: 'l_carnitine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?citrulline\b/, /\bcitrulline\b/],
    typeKey: 'l_citrulline_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?theanine\b/, /\btheanine\b/],
    typeKey: 'l_theanine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bbeta[- ]?alanine\b/],
    typeKey: 'beta_alanine_mg', canonicalUnit: 'mg' },

  { patterns: [/\btaurine\b/],
    typeKey: 'taurine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bglycine\b/],
    typeKey: 'glycine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bgaba\b/, /\bgamma[- ]?aminobutyric\b/],
    typeKey: 'gaba_mg', canonicalUnit: 'mg' },

  { patterns: [/\b5[- ]?htp\b/, /\b5[- ]?hydroxytryptophan\b/, /\bhydroxytryptophan\b/],
    typeKey: 'five_htp_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?proline\b/, /\bproline\b/],
    typeKey: 'l_proline_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?serine\b/, /\bserine\b/],
    typeKey: 'l_serine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?alanine\b/, /^alanine\b/],
    typeKey: 'l_alanine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?aspartate\b/, /\baspartic\s*acid\b/, /\baspartate\b/],
    typeKey: 'l_aspartate_mg', canonicalUnit: 'mg' },

  { patterns: [/\bl[- ]?glutamate\b/, /\bglutamic\s*acid\b/, /\bglutamate\b/],
    typeKey: 'l_glutamate_mg', canonicalUnit: 'mg' },

  // ── Other Common Supplements ──────────────────────────────────────────────
  { patterns: [/\bcoq[- ]?10\b/, /\bcoenzyme\s*q[- ]?10\b/, /\bubiquinol\b/, /\bubiquinone\b/],
    typeKey: 'coq10_mg', canonicalUnit: 'mg' },

  // EPA must come before omega-3 so it doesn't get swallowed by the broader match
  { patterns: [/\beicosapentaenoic\b/, /\bepa\b/],
    typeKey: 'epa_mg', canonicalUnit: 'mg' },

  { patterns: [/\bdocosahexaenoic\b/, /\bdha\b/],
    typeKey: 'dha_mg', canonicalUnit: 'mg' },

  { patterns: [/\bomega[- ]?3\b/, /\bfish\s*oil\b/, /\bkrill\s*oil\b/, /\bflaxseed\s*oil\b/],
    typeKey: 'omega_3_mg', canonicalUnit: 'mg' },

  { patterns: [/\balpha[- ]?lipoic\s*acid\b/, /\bala\b/],
    typeKey: 'alpha_lipoic_acid_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmelatonin\b/],
    typeKey: 'melatonin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bashwagandha\b/, /\bwithania\b/, /\bksm[- ]?66\b/],
    typeKey: 'ashwagandha_mg', canonicalUnit: 'mg' },

  { patterns: [/\bcurcumin\b/, /\bturmeric\b/, /\bcurcuma\b/],
    typeKey: 'curcumin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bcollagen\b/],
    typeKey: 'collagen_g', canonicalUnit: 'g' },

  { patterns: [/\bglucosamine\b/],
    typeKey: 'glucosamine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bchondroitin\b/],
    typeKey: 'chondroitin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bresveratrol\b/],
    typeKey: 'resveratrol_mg', canonicalUnit: 'mg' },

  { patterns: [/\bquercetin\b/],
    typeKey: 'quercetin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bberberine\b/],
    typeKey: 'berberine_mg', canonicalUnit: 'mg' },

  { patterns: [/\binositol\b/, /\bmyo[- ]?inositol\b/],
    typeKey: 'inositol_mg', canonicalUnit: 'mg' },

  { patterns: [/\bdhea\b/, /\bdehydroepiandrost\w+\b/],
    typeKey: 'dhea_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmilk\s*thistle\b/, /\bsilymarin\b/, /\bsilybum\b/],
    typeKey: 'silymarin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bvalerian\b/],
    typeKey: 'valerian_mg', canonicalUnit: 'mg' },

  { patterns: [/\belderberry\b/, /\bsambucus\b/],
    typeKey: 'elderberry_mg', canonicalUnit: 'mg' },

  { patterns: [/\bhyaluronic\s*acid\b/, /\bhyaluronate\b/],
    typeKey: 'hyaluronic_acid_mg', canonicalUnit: 'mg' },

  { patterns: [/\bphosphatidylserine\b/, /\bps[- ]?100\b/],
    typeKey: 'phosphatidylserine_mg', canonicalUnit: 'mg' },

  { patterns: [/\bastaxanthin\b/],
    typeKey: 'astaxanthin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bprobiotics?\b/, /\blactobacillus\b/, /\bbifidobacterium\b/],
    typeKey: 'probiotics_bcfu', canonicalUnit: 'bcfu' },

  { patterns: [/\bsaw\s*palmetto\b/],
    typeKey: 'saw_palmetto_mg', canonicalUnit: 'mg' },

  { patterns: [/\bst\.?\s*john'?s?\s*wort\b/, /\bhypericum\b/],
    typeKey: 'st_johns_wort_mg', canonicalUnit: 'mg' },

  { patterns: [/\bechinacea\b/],
    typeKey: 'echinacea_mg', canonicalUnit: 'mg' },

  { patterns: [/\bginseng\b/],
    typeKey: 'ginseng_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmaca\b/],
    typeKey: 'maca_mg', canonicalUnit: 'mg' },

  { patterns: [/\bspirulina\b/],
    typeKey: 'spirulina_mg', canonicalUnit: 'mg' },

  { patterns: [/\bchlorella\b/],
    typeKey: 'chlorella_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmatcha\b/],
    typeKey: 'matcha_mg', canonicalUnit: 'mg' },

  { patterns: [/\bgreen\s*tea\s*extract\b/, /\begcg\b/],
    typeKey: 'green_tea_extract_mg', canonicalUnit: 'mg' },

  { patterns: [/\bpycnogenol\b/, /\bpine\s*bark\s*extract\b/],
    typeKey: 'pycnogenol_mg', canonicalUnit: 'mg' },

  { patterns: [/\blycopene\b/],
    typeKey: 'lycopene_mg', canonicalUnit: 'mg' },

  { patterns: [/\blutein\b/],
    typeKey: 'lutein_mg', canonicalUnit: 'mg' },

  { patterns: [/\bzeaxanthin\b/],
    typeKey: 'zeaxanthin_mg', canonicalUnit: 'mg' },

  { patterns: [/\bshilajit\b/],
    typeKey: 'shilajit_mg', canonicalUnit: 'mg' },

  { patterns: [/\blion'?s?\s*mane\b/, /\bhericium\b/],
    typeKey: 'lions_mane_mg', canonicalUnit: 'mg' },

  { patterns: [/\breishi\b/],
    typeKey: 'reishi_mg', canonicalUnit: 'mg' },

  { patterns: [/\bcordyceps\b/],
    typeKey: 'cordyceps_mg', canonicalUnit: 'mg' },

  { patterns: [/\bchaga\b/],
    typeKey: 'chaga_mg', canonicalUnit: 'mg' },

  { patterns: [/\bturkey\s*tail\b/, /\btrametes\b/],
    typeKey: 'turkey_tail_mg', canonicalUnit: 'mg' },

  { patterns: [/\bmethy\w*\b.*\bfolate\b/, /\b5[- ]?mthf\b/],
    typeKey: 'folate_mcg', canonicalUnit: 'mcg' },
];

/**
 * Parse a dosage string like "1000 mg", "5000 IU", "400 mcg", "2.5 g", "25,000 IU".
 * Returns { value: number, unit: string } or null if unparseable.
 */
function parseDosage(dosageStr) {
  if (!dosageStr) return null;
  const s = String(dosageStr).trim();
  const m = s.match(/^([\d,]+(?:\.\d+)?)\s*(mcg|μg|ug|mg|iu|g|b\s*cfu|billion\s*cfu)\b/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  const rawUnit = m[2].toLowerCase().replace(/\s+/g, '');
  let unit = rawUnit;
  if (unit === 'μg' || unit === 'ug') unit = 'mcg';
  if (unit === 'billioncfu') unit = 'bcfu';
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

  // Probiotics (B CFU) — no conversion possible, pass through
  if (from === 'bcfu' || to === 'bcfu') return from === to ? value : null;

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

export { medicationEntryToHealthRow, parseDosage, convertToCanonical };
