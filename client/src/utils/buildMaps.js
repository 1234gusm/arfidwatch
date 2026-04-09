/**
 * Shared map-building logic for health data.
 * Used by both HealthPage (user) and SharePage (doctor) to ensure identical averages.
 */

export const mapCanonical = t => {
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};

const getSource = r => { try { return JSON.parse(String(r.raw || '{}')).source || ''; } catch (_) { return ''; } };

export const MAP_TYPE_ALIASES = {
  // calories
  'calories_kcal':          'dietary_energy_kcal',
  'dietary_energy_kcal':    'dietary_energy_kcal',
  'energy':                 'dietary_energy_kcal',
  'calories':               'dietary_energy_kcal',
  // macros
  'fat_g':                  'total_fat_g',
  'fat':                    'total_fat_g',
  'carbs_g':                'carbohydrates_g',
  'carbs':                  'carbohydrates_g',
  'carbohydrates':          'carbohydrates_g',
  'sugars_g':               'sugar_g',
  'sugar':                  'sugar_g',
  // body
  'weight_lbs':             'weight_lb',
  'weight':                 'weight_lb',
  'trend_weight_lbs':       'weight_lb',
  'body_fat':               'body_fat_percentage__',
  'lean_mass':              'lean_body_mass_lb',
  // activity
  'steps':                  'step_count_count',
  'vo2_max_mlkg_min':       'vo2_max_mlkgmin',
  'physical_effort_kcalhr_kg': 'physical_effort_kcalhrkg',
  // heart
  'resting_heart_rate':     'resting_heart_rate_countmin',
};

export function buildMaps(rows) {
  const IH_PRIORITY = new Set([
    'heart_rate_avg_countmin', 'resting_heart_rate_countmin',
    'blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg',
    'heart_rate', 'heartrate', 'pulse', 'heart_ratebeatsmin',
    'systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg',
    'diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg',
  ]);
  const maps = {};
  const ihDays = {};
  // First pass: collect iHealth rows
  rows.forEach(r => {
    if (getSource(r) !== 'ihealth_csv') return;
    const raw = mapCanonical(r.type);
    const ct  = MAP_TYPE_ALIASES[raw] || raw;
    if (!IH_PRIORITY.has(ct)) return;
    const v   = parseFloat(r.value);
    if (!Number.isFinite(v)) return;
    const day = String(r.timestamp || '').slice(0, 10);
    if (!day) return;
    if (!ihDays[ct]) ihDays[ct] = new Set();
    ihDays[ct].add(day);
    if (!maps[ct]) maps[ct] = {};
    if (!maps[ct][day]) maps[ct][day] = { sum: v, count: 1 };
    else if (typeof maps[ct][day] === 'object') { maps[ct][day].sum += v; maps[ct][day].count += 1; }
    else { maps[ct][day] = { sum: maps[ct][day] + v, count: 2 }; }
  });
  // Flatten iHealth averages
  for (const ct of Object.keys(maps)) {
    for (const day of Object.keys(maps[ct])) {
      const entry = maps[ct][day];
      if (entry && typeof entry === 'object' && 'sum' in entry) {
        maps[ct][day] = Math.round((entry.sum / entry.count) * 100) / 100;
      }
    }
  }
  // Types that must come exclusively from iHealth — never Apple Health fallback
  const IH_ONLY = new Set([
    'blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg',
    'systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg',
    'diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg',
  ]);
  // Second pass: all rows (auto health fills gaps where iHealth is absent)
  rows.forEach(r => {
    const raw = mapCanonical(r.type);
    const ct  = MAP_TYPE_ALIASES[raw] || raw;
    const v   = parseFloat(r.value);
    if (!Number.isFinite(v)) return;
    const day = String(r.timestamp || '').slice(0, 10);
    if (!day) return;
    // BP: only iHealth sources allowed
    if (IH_ONLY.has(ct) && getSource(r) !== 'ihealth_csv') return;
    if (IH_PRIORITY.has(ct) && ihDays[ct] && ihDays[ct].has(day) && getSource(r) !== 'ihealth_csv') return;
    if (!maps[ct]) maps[ct] = {};
    if (maps[ct][day] === undefined) {
      maps[ct][day] = v;
    } else if (!IH_PRIORITY.has(ct) || !ihDays[ct] || !ihDays[ct].has(day)) {
      maps[ct][day] = Math.max(maps[ct][day], v);
    }
  });
  return maps;
}

/**
 * Merge food_log entries into a maps object (mutates maps in-place).
 * Works with both raw food_log rows (SharePage) and pre-aggregated daily rows (HealthPage).
 * @param {Object} maps - The maps object from buildMaps
 * @param {Array} foodEntries - Array of food log entries or daily aggregates
 * @param {'raw'|'daily'} mode - 'raw' for individual meal entries, 'daily' for pre-aggregated
 */
export function mergeFoodLog(maps, foodEntries, mode = 'raw') {
  const RAW_MAP = { calories: 'dietary_energy_kcal', protein_g: 'protein_g', carbs_g: 'carbohydrates_g', fat_g: 'total_fat_g' };
  const DAILY_MAP = { dietary_energy_kcal: 'dietary_energy_kcal', protein_g: 'protein_g', carbohydrates_g: 'carbohydrates_g', total_fat_g: 'total_fat_g' };
  const colMap = mode === 'daily' ? DAILY_MAP : RAW_MAP;

  // Sum per day
  const flDaily = {};
  (foodEntries || []).forEach(entry => {
    const day = entry.date;
    if (!day) return;
    if (!flDaily[day]) flDaily[day] = {};
    for (const [col, mapKey] of Object.entries(colMap)) {
      const v = parseFloat(entry[col]);
      if (Number.isFinite(v) && v > 0) {
        flDaily[day][mapKey] = (flDaily[day][mapKey] || 0) + v;
      }
    }
  });

  // Merge into maps: max(health, food_log) per day
  for (const mapKey of new Set(Object.values(colMap))) {
    if (!maps[mapKey]) maps[mapKey] = {};
    for (const [day, dayData] of Object.entries(flDaily)) {
      const flVal = dayData[mapKey];
      if (flVal !== undefined) {
        maps[mapKey][day] = Math.max(maps[mapKey][day] ?? 0, flVal);
      }
    }
  }
}
