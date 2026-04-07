import { Query } from 'node-appwrite';
import crypto from 'crypto';
import { parse as csvParseFn } from 'csv-parse/sync';
import { medicationEntryToHealthRow } from '../utils/supplementNutrients.js';

/* ── Sub-daily type sets for pre-aggregation ────────────────────────────── */
const SUM_TYPES = new Set([
  'resting_energy_kcal', 'active_energy_kcal',
  'step_count_count', 'walking_running_distance_mi', 'walking___running_distance_mi',
  'apple_stand_time_min', 'apple_exercise_time_min', 'apple_stand_hour_count',
  'flights_climbed_count', 'swimming_stroke_count_count',
  'handwashing_s', 'toothbrushing_s', 'wheelchair_distance_mi',
]);
const AVG_TYPES = new Set([
  'heart_rate_avg_countmin', 'heart_rate_min_countmin', 'heart_rate_max_countmin',
  'heart_rate_variability_ms', 'resting_heart_rate_countmin',
  'walking_heart_rate_average_countmin', 'physical_effort_kcalhrkg',
  'environmental_audio_exposure_dbaspl', 'headphone_audio_exposure_dbaspl',
  'walking_speed_mihr', 'walking_step_length_in',
  'walking_asymmetry_percentage', 'walking_asymmetry_percentage__',
  'walking_double_support_percentage', 'walking_double_support_percentage__',
  'respiratory_rate_countmin', 'resp_rate_min_countmin', 'resp_rate_max_countmin',
  'stair_speed__up_fts', 'stair_speed__down_fts', 'stair_speed_up_fts', 'stair_speed_down_fts',
]);

/**
 * Pre-aggregate sub-daily Apple Health records into daily summaries.
 * SUM types (energy, steps, distance) → summed per day.
 * AVG types (heart rate, speed) → averaged per day.
 * All other types pass through unchanged.
 */
function preAggregateDailyRecords(records) {
  const passThrough = [];
  const groups = {};   // key = `${type}::${date}` → { values:[], template }
  for (const r of records) {
    const type = r.type;
    if (!SUM_TYPES.has(type) && !AVG_TYPES.has(type)) { passThrough.push(r); continue; }
    const date = (r.timestamp || '').slice(0, 10);
    if (!date) { passThrough.push(r); continue; }
    const v = typeof r.value === 'number' ? r.value : parseFloat(r.value);
    if (!Number.isFinite(v)) { passThrough.push(r); continue; }
    const key = `${type}::${date}`;
    if (!groups[key]) groups[key] = { values: [], template: r };
    groups[key].values.push(v);
  }
  const aggregated = [];
  for (const [key, g] of Object.entries(groups)) {
    const type = key.split('::')[0];
    const date = key.split('::')[1];
    const sum = g.values.reduce((a, b) => a + b, 0);
    const agg = SUM_TYPES.has(type) ? sum : sum / g.values.length;
    aggregated.push({ ...g.template, value: agg, timestamp: `${date}T12:00:00.000Z`, raw: '' });
  }
  return [...passThrough, ...aggregated];
}

/* ── Helpers ported from server/routes/health.js ─────────────────────────── */
const hashIngestKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

const resolveImportFilename = (fallback, ...candidates) => {
  for (const c of candidates) {
    const raw = String(c || '').trim();
    if (!raw) continue;
    const clean = raw.replace(/^.*[/\\]/, '').replace(/\0/g, '');
    if (clean) return clean;
  }
  return fallback;
};

const normalizeStatTimestamp = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const normalizeStatValue = (v) => {
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '') return n;
  return String(v ?? '').trim();
};
const statKey = (r) => `${r.type}|${normalizeStatTimestamp(r.timestamp)}|${String(normalizeStatValue(r.value))}`;

const normalizeCsvHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');

const parseDurationHours = (value) => {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) return (Number(hhmm[1]) || 0) + ((Number(hhmm[2]) || 0) / 60) + ((Number(hhmm[3]) || 0) / 3600);
  const hm = raw.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(\d+(?:\.\d+)?)?\s*m?/);
  if (hm) return (Number(hm[1]) || 0) + ((Number(hm[2]) || 0) / 60);
  const mins = raw.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)$/);
  if (mins) return (Number(mins[1]) || 0) / 60;
  const n = Number(raw.replace(/[^0-9eE+\-.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 24 && n <= 1440) return n / 60;
  return n;
};

const pickRowValue = (row, testFn) => {
  for (const [k, v] of Object.entries(row || {})) {
    if (testFn(normalizeCsvHeader(k))) return v;
  }
  return null;
};

const pickRowValueByHeaders = (row, headerNames = []) => {
  const wanted = new Set(headerNames.map(h => normalizeCsvHeader(h)));
  for (const [k, v] of Object.entries(row || {})) {
    if (wanted.has(normalizeCsvHeader(k))) return v;
  }
  return null;
};

const MONTH_MAP = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const parseDateOnlyLocal = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isoDatePrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoDatePrefix) return new Date(Number(isoDatePrefix[1]), Number(isoDatePrefix[2]) - 1, Number(isoDatePrefix[3]), 12, 0, 0, 0);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]), 12, 0, 0, 0);
  const human = raw.match(/^(?:\w+,\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (human) { const m = MONTH_MAP[human[1].toLowerCase().slice(0, 3)]; if (m != null) return new Date(Number(human[3]), m, Number(human[2]), 12, 0, 0, 0); }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(12, 0, 0, 0);
  return parsed;
};

/* ── CSV type detection ─────────────────────────────────────────────────── */
const isAutoSleepCsvHeaders = (headers = []) => {
  const hs = headers.map(normalizeCsvHeader).filter(Boolean);
  if (!hs.length) return false;
  if (hs.some(h => h.includes('autosleep'))) return true;
  const c = [
    hs.some(h => h === 'iso8601'),
    hs.some(h => h === 'fromdate' || h === 'todate'),
    hs.some(h => h === 'inbed'),
    hs.some(h => h === 'fellasleepin'),
    hs.some(h => h === 'asleepavg7' || h === 'efficiencyavg7' || h === 'qualityavg7' || h === 'deepavg7'),
  ].filter(Boolean).length;
  return c >= 2;
};

const isIHealthCsvHeaders = (headers = []) => {
  const hs = headers.map(normalizeCsvHeader).filter(Boolean);
  if (!hs.length) return false;
  const hasSys = hs.some(h => h.includes('systolic') || h.includes('sysmmhg') || h.includes('sys mmhg'));
  const hasDia = hs.some(h => h.includes('diastolic') || h.includes('diammhg') || h.includes('dia mmhg'));
  const hasDate = hs.some(h => h.includes('date') || h.includes('time'));
  return hasSys && hasDia && hasDate;
};

/* ── Record builders ────────────────────────────────────────────────────── */
const autosleepTimestamp = (row) => {
  const toDateVal = pickRowValueByHeaders(row, ['toDate']) || pickRowValue(row, h => h === 'todate');
  const fallbackDateVal = pickRowValueByHeaders(row, ['ISO8601', 'date', 'sleep date', 'day', 'fromDate']) ||
    pickRowValue(row, h => h === 'iso8601' || h === 'date' || h.includes('sleep date') || h === 'day' || h === 'fromdate');
  const d = parseDateOnlyLocal(toDateVal || fallbackDateVal);
  return d ? d.toISOString() : new Date().toISOString();
};

const buildAutoSleepRecords = (rows, userId) => {
  const durationMetrics = [
    { type: 'sleep_analysis_total_sleep_hr', match: h => h === 'asleep' || h.includes('total sleep') || h.includes('time asleep') },
    { type: 'sleep_analysis_in_bed_hr',      match: h => h === 'inbed' || h.includes('in bed') || h.includes('time in bed') },
    { type: 'sleep_analysis_deep_hr',        match: h => h === 'deep' || h.includes('deep sleep') },
    { type: 'sleep_analysis_rem_hr',         match: h => h === 'rem' || h.includes('rem sleep') },
    { type: 'sleep_analysis_awake_hr',       match: h => h === 'awake' || h.includes('time awake') || h === 'wake' },
    { type: 'sleep_analysis_quality_hr',     match: h => h === 'quality' },
    { type: 'fell_asleep_in_hr',             match: h => h === 'fellasleepin' || h.includes('fell asleep in') },
  ];
  const numericMetrics = [
    { type: 'sleep_efficiency_percent',      match: h => h === 'efficiency' },
    { type: 'sleep_sessions_count',          match: h => h === 'sessions' },
    { type: 'sleep_heart_rate_bpm',          match: h => h === 'sleepbpm' || h === 'sleep bpm' },
    { type: 'waking_heart_rate_bpm',         match: h => h === 'wakingbpm' || h === 'waking bpm' },
    { type: 'day_heart_rate_bpm',            match: h => h === 'daybpm' || h === 'day bpm' },
    { type: 'heart_rate_variability_ms',     match: h => h === 'hrv' },
    { type: 'sleep_hrv_ms',                  match: h => h === 'sleephrv' || h === 'sleep hrv' },
    { type: 'blood_oxygen_saturation__',     match: h => h === 'spo2avg' },
    { type: 'blood_oxygen_min__',            match: h => h === 'spo2min' },
    { type: 'blood_oxygen_max__',            match: h => h === 'spo2max' },
    { type: 'respiratory_rate_countmin',     match: h => h === 'respavg' || h === 'resp avg' },
    { type: 'resp_rate_min_countmin',        match: h => h === 'respmin' || h === 'resp min' },
    { type: 'resp_rate_max_countmin',        match: h => h === 'respmax' || h === 'resp max' },
    { type: 'breathing_disturbances_count',  match: h => h === 'apnea' },
  ];
  const out = [];
  rows.forEach((row, idx) => {
    const ts = autosleepTimestamp(row);
    durationMetrics.forEach(m => {
      const rawVal = pickRowValue(row, m.match);
      const value = parseDurationHours(rawVal);
      if (value == null) return;
      out.push({ user_id: userId, type: m.type, value, timestamp: ts, raw: JSON.stringify({ source: 'autosleep_csv', row: idx + 2, value: rawVal }) });
    });
    numericMetrics.forEach(m => {
      const rawVal = pickRowValue(row, m.match);
      if (rawVal == null || String(rawVal).trim() === '') return;
      const value = parseFloat(String(rawVal).replace(/[^0-9eE+\-.]/g, ''));
      if (!Number.isFinite(value)) return;
      out.push({ user_id: userId, type: m.type, value, timestamp: ts, raw: JSON.stringify({ source: 'autosleep_csv', row: idx + 2, value: rawVal }) });
    });
    const asleepRaw = pickRowValue(row, h => h === 'asleep' || h.includes('total sleep') || h.includes('time asleep'));
    const deepRaw = pickRowValue(row, h => h === 'deep' || h.includes('deep sleep'));
    const asleepH = parseDurationHours(asleepRaw);
    const deepH = parseDurationHours(deepRaw) ?? 0;
    if (Number.isFinite(asleepH) && asleepH > 0) {
      const coreH = Math.max(0, Math.round((asleepH - deepH) * 10000) / 10000);
      out.push({ user_id: userId, type: 'sleep_analysis_core_hr', value: coreH, timestamp: ts,
        raw: JSON.stringify({ source: 'autosleep_csv', row: idx + 2, derived: true, formula: 'asleep - deep' }) });
    }
  });
  return out;
};

const buildIHealthRecords = (rows, userId) => {
  const out = [];
  rows.forEach((row, idx) => {
    let dateVal = null, timeVal = null;
    for (const [k, v] of Object.entries(row)) {
      const kn = k.trim().toLowerCase();
      if (kn === 'date' && v) dateVal = v.trim();
      if (kn === 'time' && v) timeVal = v.trim();
    }
    let ts = null;
    if (dateVal && timeVal) { const d = new Date(`${dateVal} ${timeVal}`); if (!Number.isNaN(d.getTime())) ts = d.toISOString(); }
    if (!ts && dateVal) { const d = new Date(dateVal); if (!Number.isNaN(d.getTime())) ts = d.toISOString(); }
    if (!ts) {
      for (const [k, v] of Object.entries(row)) {
        if (/date|time/i.test(k) && v) { const d = new Date(v); if (!Number.isNaN(d.getTime())) { ts = d.toISOString(); break; } }
      }
    }
    if (!ts) { const d = parseDateOnlyLocal(Object.values(row)[0]); ts = d ? d.toISOString() : new Date().toISOString(); }
    const sysRaw = pickRowValue(row, h => h.includes('systolic') || h === 'sysmmhg' || h === 'sys mmhg' || h === 'sys');
    const sysVal = sysRaw != null ? parseFloat(String(sysRaw).replace(/[^0-9.\-]/g, '')) : NaN;
    if (Number.isFinite(sysVal) && sysVal > 0) out.push({ user_id: userId, type: 'blood_pressure_systolic_mmhg', value: sysVal, timestamp: ts, raw: JSON.stringify({ source: 'ihealth_csv', row: idx + 2, value: sysRaw }) });
    const diaRaw = pickRowValue(row, h => h.includes('diastolic') || h === 'diammhg' || h === 'dia mmhg' || h === 'dia');
    const diaVal = diaRaw != null ? parseFloat(String(diaRaw).replace(/[^0-9.\-]/g, '')) : NaN;
    if (Number.isFinite(diaVal) && diaVal > 0) out.push({ user_id: userId, type: 'blood_pressure_diastolic_mmhg', value: diaVal, timestamp: ts, raw: JSON.stringify({ source: 'ihealth_csv', row: idx + 2, value: diaRaw }) });
    const hrRaw = pickRowValue(row, h => h.includes('heart rate') || h.includes('pulse') || h === 'heartrate' || h.includes('beatsmin'));
    const hrVal = hrRaw != null ? parseFloat(String(hrRaw).replace(/[^0-9.\-]/g, '')) : NaN;
    if (Number.isFinite(hrVal) && hrVal > 0) out.push({ user_id: userId, type: 'heart_rate_avg_countmin', value: hrVal, timestamp: ts, raw: JSON.stringify({ source: 'ihealth_csv', row: idx + 2, value: hrRaw }) });
    const irregRaw = pickRowValue(row, h => h.includes('irregular'));
    if (irregRaw != null && String(irregRaw).trim() !== '') {
      const irregVal = /yes|true|1|detected/i.test(String(irregRaw)) ? 1 : 0;
      out.push({ user_id: userId, type: 'irregular_heartbeat_flag', value: irregVal, timestamp: ts, raw: JSON.stringify({ source: 'ihealth_csv', row: idx + 2, value: irregRaw }) });
    }
  });
  return out;
};

/* ── HAE REST API type normalisation (ported from autoHealthPull.js) ───── */
const HK_PREFIX_RE = /^HK(?:Quantity|Category|Characteristic)TypeIdentifier/i;
function hkNameToSnake(name) {
  const stripped = String(name).replace(HK_PREFIX_RE, '');
  return stripped.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function normalizeHAEUnit(units) {
  if (!units) return '';
  return String(units).toLowerCase().replace(/[\[\]()\.\u00B7\u22C5\u2022\/]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
const HAE_TYPE_REMAP = {
  basal_energy_burned_kcal:'resting_energy_kcal',basal_energy_burned:'resting_energy_kcal',
  body_mass_lb:'weight_lb',body_mass_kg:'weight_kg',body_mass_pounds:'weight_lb',body_mass:'weight_lb',
  height_cm:'height_cm',height_in:'height_in',height_m:'height_cm',height:'height_cm',
  heart_rate_bpm:'heart_rate_avg_countmin',heart_rate:'heart_rate_avg_countmin',
  resting_heart_rate_bpm:'resting_heart_rate_countmin',
  heart_rate_variability_sdnn_ms:'heart_rate_variability_ms',heart_rate_variability_sdnn:'heart_rate_variability_ms',
  walking_heart_rate_average_bpm:'walking_heart_rate_average_countmin',
  blood_pressure_systolic:'blood_pressure_systolic_mmhg',blood_pressure_diastolic:'blood_pressure_diastolic_mmhg',
  blood_pressure_systolic_mm_hg:'blood_pressure_systolic_mmhg',blood_pressure_diastolic_mm_hg:'blood_pressure_diastolic_mmhg',
  oxygen_saturation_percent:'oxygen_saturation_percent',oxygen_saturation:'oxygen_saturation_percent',blood_oxygen:'oxygen_saturation_percent',
  cardio_fitness_mlkgmin:'vo2_max_mlkgmin',cardio_fitness:'vo2_max_mlkgmin',vo2_max_mlkg_min:'vo2_max_mlkgmin',
  dietary_fat_total_g:'total_fat_g',dietary_fat_total:'total_fat_g',
  dietary_carbohydrates_g:'carbohydrates_g',dietary_carbohydrates:'carbohydrates_g',
  dietary_protein_g:'protein_g',dietary_protein:'protein_g',
  dietary_fiber_g:'fiber_g',dietary_fiber:'fiber_g',dietary_sugar_g:'sugar_g',dietary_sugar:'sugar_g',
  dietary_sodium_mg:'sodium_mg',dietary_sodium:'sodium_mg',
  dietary_fat_saturated_g:'saturated_fat_g',dietary_fat_polyunsaturated_g:'polyunsaturated_fat_g',
  dietary_fat_monounsaturated_g:'monounsaturated_fat_g',dietary_cholesterol_mg:'cholesterol_mg',
  dietary_potassium_mg:'potassium_mg',dietary_calcium_mg:'calcium_mg',dietary_magnesium_mg:'magnesium_mg',
  dietary_iron_mg:'iron_mg',dietary_zinc_mg:'zinc_mg',
  dietary_vitamin_a_mcg:'vitamin_a_mcg',dietary_vitamin_b12_mcg:'vitamin_b12_mcg',
  dietary_vitamin_b6_mg:'vitamin_b6_mg',dietary_vitamin_c_mg:'vitamin_c_mg',
  dietary_vitamin_d_mcg:'vitamin_d_mcg',dietary_vitamin_e_mg:'vitamin_e_mg',dietary_vitamin_k_mcg:'vitamin_k_mcg',
  dietary_caffeine_mg:'caffeine_mg',dietary_water_fl__oz:'water_fl_oz_us',dietary_water_fl_oz:'water_fl_oz_us',dietary_water:'water_fl_oz_us',
  dietary_chromium_mcg:'chromium_mcg',dietary_copper_mg:'copper_mg',dietary_iodine_mcg:'iodine_mcg',
  dietary_manganese_mg:'manganese_mg',dietary_molybdenum_mcg:'molybdenum_mcg',dietary_selenium_mcg:'selenium_mcg',
  dietary_pantothenic_acid_mg:'pantothenic_acid_mg',dietary_niacin_mg:'niacin_mg',dietary_riboflavin_mg:'riboflavin_mg',
  dietary_thiamin_mg:'thiamin_mg',dietary_biotin_mcg:'biotin_mcg',dietary_folate_mcg:'folate_mcg',
};

const HAE_SLEEP_STAGE_MAP = {
  asleepcore:'sleep_analysis_core_hr',asleeprem:'sleep_analysis_rem_hr',asleepdeep:'sleep_analysis_deep_hr',
  asleep:'sleep_analysis_total_sleep_hr',asleepunspecified:'sleep_analysis_total_sleep_hr',
  awake:'sleep_analysis_awake_hr',inbed:'sleep_analysis_in_bed_hr',
};

function aggregateHAESleepIntoSamples(stageData, outSamples) {
  if (!Array.isArray(stageData)) return;
  const nightMap = new Map();
  for (const entry of stageData) {
    const startStr = entry.startDate || entry.start_date || entry.startdate;
    const endStr = entry.endDate || entry.end_date || entry.enddate;
    if (!startStr || !endStr) continue;
    const start = new Date(startStr), end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    const durationHr = (end - start) / 3_600_000;
    const normalized = String(entry.value || '').replace(/^HKCategoryValueSleepAnalysis/i, '').toLowerCase().replace(/[^a-z]/g, '');
    const sleepType = HAE_SLEEP_STAGE_MAP[normalized];
    if (!sleepType) continue;
    let nightDate = end.toISOString().slice(0, 10);
    if (end.getHours() < 12) { const d = new Date(end); d.setDate(d.getDate() - 1); nightDate = d.toISOString().slice(0, 10); }
    if (!nightMap.has(nightDate)) nightMap.set(nightDate, new Map());
    const byType = nightMap.get(nightDate);
    byType.set(sleepType, (byType.get(sleepType) || 0) + durationHr);
  }
  for (const [nightDate, byType] of nightMap) {
    const ts = `${nightDate}T23:59:00.000Z`;
    const stageTot = ['sleep_analysis_core_hr', 'sleep_analysis_rem_hr', 'sleep_analysis_deep_hr'].reduce((s, t) => s + (byType.get(t) || 0), 0);
    const unspec = byType.get('sleep_analysis_total_sleep_hr') || 0;
    if (!byType.has('sleep_analysis_total_sleep_hr') && stageTot > 0) byType.set('sleep_analysis_total_sleep_hr', Math.round((stageTot + unspec) * 10000) / 10000);
    for (const [sleepType, hours] of byType) {
      outSamples.push({ type: sleepType, value: Math.round(hours * 10000) / 10000, timestamp: ts, source: 'hae_rest' });
    }
  }
}

function flattenHAEMetrics(metrics) {
  const samples = [];
  if (!Array.isArray(metrics)) return samples;
  for (const metric of metrics) {
    if (!metric || !Array.isArray(metric.data)) continue;
    const rawName = String(metric.name || '');
    if (!rawName) continue;
    if (/sleep_analysis|SleepAnalysis/i.test(rawName)) { aggregateHAESleepIntoSamples(metric.data, samples); continue; }
    const baseName = hkNameToSnake(rawName);
    if (!baseName) continue;
    const unitSuffix = normalizeHAEUnit(metric.units || '');
    const constructed = unitSuffix ? `${baseName}_${unitSuffix}` : baseName;
    const typeKey = HAE_TYPE_REMAP[constructed] || HAE_TYPE_REMAP[baseName] || constructed;
    for (const entry of metric.data) {
      const date = entry.date || entry.startDate || entry.endDate;
      if (!date) continue;
      const value = entry.qty ?? entry.Avg ?? entry.average ?? entry.Sum ?? entry.sum ?? entry.value ?? null;
      if (value == null) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      samples.push({ type: typeKey, value: num, timestamp: String(date), source: 'hae_rest' });
    }
  }
  return samples;
}

/* ── Sleep helpers ───────────────────────────────────────────────────────── */
const SLEEP_BASE_TYPES = new Set([
  'sleep_analysis_total_sleep_hr', 'sleep_analysis_asleep_hr', 'sleep_analysis_in_bed_hr',
  'sleep_analysis_core_hr', 'sleep_analysis_rem_hr', 'sleep_analysis_deep_hr',
  'sleep_analysis_awake_hr', 'sleep_analysis_quality_hr',
]);
const canonicalSleepType = (rawType) => {
  const t = String(rawType || '');
  const base = t.startsWith('macrofactor_') ? t.slice('macrofactor_'.length) : t;
  return SLEEP_BASE_TYPES.has(base) ? base : null;
};
const sleepHours = (type, value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (!String(type).endsWith('_hr')) return n;
  if (n > 240) return n / 3600;
  if (n > 24) return n / 60;
  return n;
};
const dayKeyWithOffset = (isoTimestamp, offsetMinutes = 0) => {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() - offsetMinutes * 60000);
  return shifted.toISOString().slice(0, 10);
};

/* ── Dedup ───────────────────────────────────────────────────────────────── */
async function filterDuplicateStats(db, userId, inputRecords) {
  if (!inputRecords.length) return [];
  const uploadRecords = [];
  const seenInUpload = new Set();
  for (const rec of inputRecords) {
    const ts = normalizeStatTimestamp(rec.timestamp);
    if (!ts) continue;
    const normalized = { ...rec, timestamp: ts, value: normalizeStatValue(rec.value) };
    if (typeof normalized.value !== 'number') continue;
    const key = statKey(normalized);
    if (seenInUpload.has(key)) continue;
    seenInUpload.add(key);
    uploadRecords.push(normalized);
  }
  if (!uploadRecords.length) return [];

  // For sleep records, dedupe by night/day+type
  const nonSleepUpload = [];
  const sleepLatestByNight = new Map();
  for (const rec of uploadRecords) {
    const sleepType = canonicalSleepType(rec.type);
    if (!sleepType) { nonSleepUpload.push(rec); continue; }
    const nightKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
    const prev = sleepLatestByNight.get(nightKey);
    if (!prev || String(rec.timestamp) > String(prev.timestamp)) sleepLatestByNight.set(nightKey, rec);
  }
  const normalizedUpload = [...nonSleepUpload, ...sleepLatestByNight.values()];
  if (!normalizedUpload.length) return [];

  const types = new Set();
  for (const r of normalizedUpload) {
    types.add(r.type);
    const sleepType = canonicalSleepType(r.type);
    if (sleepType) { types.add(sleepType); types.add(`macrofactor_${sleepType}`); }
  }
  let minTs = normalizedUpload[0].timestamp, maxTs = normalizedUpload[0].timestamp;
  for (let i = 1; i < normalizedUpload.length; i++) {
    if (normalizedUpload[i].timestamp < minTs) minTs = normalizedUpload[i].timestamp;
    if (normalizedUpload[i].timestamp > maxTs) maxTs = normalizedUpload[i].timestamp;
  }
  const queryMinTs = `${minTs.slice(0, 10)}T00:00:00.000Z`;
  const queryMaxTs = `${maxTs.slice(0, 10)}T23:59:59.999Z`;

  // Fetch existing records in the time range (paginated)
  const typeArr = [...types];
  const existing = await db.find('health_data', [
    Query.equal('user_id', userId),
    Query.equal('type', typeArr),
    Query.greaterThanEqual('timestamp', queryMinTs),
    Query.lessThanEqual('timestamp', queryMaxTs),
  ], 5000);

  const existingKeyCounts = new Map();
  for (const row of existing) existingKeyCounts.set(statKey(row), (existingKeyCounts.get(statKey(row)) || 0) + 1);

  const existingSleepNightSources = new Map();
  const existingCsvDayTypes = new Set();
  for (const row of existing) {
    let source = 'unknown';
    try { source = JSON.parse(String(row.raw || '{}')).source || 'unknown'; } catch (_) {}
    const sleepType = canonicalSleepType(row.type);
    if (sleepType) {
      const nightKey = `${sleepType}|${String(row.timestamp).slice(0, 10)}`;
      if (!existingSleepNightSources.has(nightKey) || source === 'autosleep_csv') existingSleepNightSources.set(nightKey, source);
    } else if (source.endsWith('_csv')) {
      existingCsvDayTypes.add(`${row.type}|${String(row.timestamp).slice(0, 10)}`);
    }
  }

  const replacedSleepNights = new Set();
  const keep = [];
  for (const rec of normalizedUpload) {
    const sleepType = canonicalSleepType(rec.type);
    if (sleepType) {
      const nightKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
      let incomingSource = 'unknown';
      try { incomingSource = JSON.parse(String(rec.raw || '{}')).source || 'unknown'; } catch (_) {}
      const existingSource = existingSleepNightSources.get(nightKey);
      if (existingSource === 'autosleep_csv' && incomingSource === 'hae_rest') continue;
      if (existingSleepNightSources.has(nightKey)) {
        const deleteKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
        if (!replacedSleepNights.has(deleteKey)) {
          const day = String(rec.timestamp).slice(0, 10);
          // Delete existing records for this sleep type + day
          const toDelete = existing.filter(e => {
            const et = canonicalSleepType(e.type);
            return (et === sleepType || e.type === `macrofactor_${sleepType}`) && String(e.timestamp).slice(0, 10) === day;
          });
          for (const d of toDelete) { try { await db.remove('health_data', d.$id); } catch (_) {} }
          replacedSleepNights.add(deleteKey);
        }
      }
      keep.push(rec);
      continue;
    }
    const key = statKey(rec);
    const existingCount = existingKeyCounts.get(key) || 0;
    if (existingCount > 0) { existingKeyCounts.set(key, existingCount - 1); continue; }
    let incomingSource = 'unknown';
    try { incomingSource = JSON.parse(String(rec.raw || '{}')).source || 'unknown'; } catch (_) {}
    if (incomingSource === 'hae_rest') {
      const dayTypeKey = `${rec.type}|${String(rec.timestamp).slice(0, 10)}`;
      if (existingCsvDayTypes.has(dayTypeKey)) continue;
    }
    keep.push(rec);
  }
  return keep;
}

/* ── Ingest key auth helper ─────────────────────────────────────────────── */
async function resolveUserByIngestKey(db, ingestKey) {
  if (!ingestKey) return null;
  const keyHash = hashIngestKey(ingestKey);
  const profile = await db.findOne('user_profiles', [Query.equal('ingest_key_hash', keyHash)]);
  if (!profile) return null;
  await db.update('user_profiles', profile.$id, { ingest_key_last_used_at: new Date().toISOString() });
  return profile.user_id;
}

/* ── Normalise key for MacroFactor columns ───────────────────────────────── */
const normalizeKey = k => String(k).trim().toLowerCase()
  .replace(/\s+/g, '_').replace(/[\[\]\(\)\.\/%]/g, '').replace(/[^a-z0-9_]/g, '_');

const toRecord = (userId, typeKey, val, ts, meta = {}) => {
  if (/^sleep_analysis_/i.test(typeKey)) return null;
  const num = parseFloat(String(val).replace(/[^0-9eE+\-.]/g, ''));
  if (!Number.isFinite(num)) return null;
  return { user_id: userId, type: 'macrofactor_' + typeKey, value: num, timestamp: ts, raw: JSON.stringify({ column: typeKey, value: val, ...meta }) };
};

/* ── MacroFactor lenient CSV parser ──────────────────────────────────────── */
const parseCsvLineLenient = (line) => {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i], next = line[i + 1];
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    if (ch === '"') {
      if (!inQ) { inQ = true; continue; }
      if (next === '"') {
        const n2 = line[i + 2];
        if (n2 === ',' || n2 === undefined) { cur += '"'; inQ = false; i += 1; continue; }
        cur += '"'; i += 1; continue;
      }
      if (next === ',' || next === undefined) { inQ = false; continue; }
      cur += '"'; continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
};
const parseCsvTextLenient = (text) => {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLineLenient(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLineLenient(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c++) row[headers[c]] = vals[c] ?? '';
    rows.push(row);
  }
  return rows;
};

/* ────────────────────────────────────────────────────────────────────────── */
export async function handleHealth({ req, res, db, storage, userId: headerUserId, body, method, path, log, error }) {
  const q = req.query || {};

  // Resolve userId: check ingest key header first, fall back to session user
  let userId = headerUserId;
  const ingestKey = (req.headers || {})['x-ingest-key'];
  if (!userId && ingestKey) {
    userId = await resolveUserByIngestKey(db, ingestKey);
    if (!userId) return res.json({ error: 'invalid ingest key' }, 401);
  }
  if (!userId) return res.json({ error: 'authentication required' }, 401);

  // ── GET /api/health/dashboard ───────────────────────────────────────────
  // Batched endpoint: returns health data, imports, today's food, and profile
  // prefs in a single function call to eliminate cold-start/round-trip overhead.
  // Fetches in parallel with a 2000-record cap — enough for ~30–90 day views.
  if (method === 'GET' && path === '/api/health/dashboard') {
    const endIsoD = q.end && !q.end.includes('T') ? `${q.end}T23:59:59.999Z` : q.end;
    const healthQ = [Query.equal('user_id', userId), Query.orderDesc('timestamp')];
    if (q.start) healthQ.push(Query.greaterThanEqual('timestamp', q.start));
    if (endIsoD) healthQ.push(Query.lessThanEqual('timestamp', endIsoD));
    healthQ.push(Query.select(['type', 'value', 'timestamp', 'raw', 'import_id']));

    const todayStr = q.today || new Date().toISOString().slice(0, 10);
    const medQ = [Query.equal('user_id', userId)];
    if (q.start) medQ.push(Query.greaterThanEqual('date', q.start.slice(0, 10)));
    if (endIsoD) medQ.push(Query.lessThanEqual('date', (endIsoD || '').slice(0, 10)));

    const t0 = Date.now();
    const [rows, medEntries, importsRaw, todayFood, profile] = await Promise.all([
      db.find('health_data', healthQ, 2000),
      db.find('medication_entries', medQ, 2000).catch(() => []),
      db.find('health_imports', [Query.equal('user_id', userId), Query.orderDesc('imported_at')], 100),
      db.find('food_log_entries', [
        Query.equal('user_id', userId),
        Query.equal('date', todayStr),
      ], 100).catch(() => []),
      db.findOne('user_profiles', [Query.equal('user_id', userId)]).catch(() => null),
    ]);
    log(`dashboard: userId=${userId} rows=${rows.length} meds=${medEntries.length} imports=${importsRaw.length} food=${todayFood.length} dbMs=${Date.now()-t0}`);

    // Merge supplement entries from medication log
    const suppRows = medEntries.map(e => medicationEntryToHealthRow({ ...e, id: e.$id })).filter(Boolean);
    const allRows = [...rows.map(r => ({ id: r.$id, ...strip$(r) })), ...suppRows];

    // Deduplicate to one record per (type, date) — keeps max value per day.
    const byKey = {};
    for (const r of allRows) {
      const date = (r.timestamp || '').slice(0, 10);
      if (!date) continue;
      const v = parseFloat(r.value);
      if (!Number.isFinite(v)) continue;
      let isIHealth = false;
      try { isIHealth = JSON.parse(String(r.raw || '{}')).source === 'ihealth_csv'; } catch (_) {}
      const key = isIHealth ? `${r.type}::${r.timestamp}` : `${r.type}::${date}`;
      if (!byKey[key] || v > parseFloat(byKey[key].value)) byKey[key] = r;
    }
    const dedupedRows = Object.values(byKey);
    dedupedRows.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    // Aggregate today's food into daily summary
    const todayAgg = {};
    for (const row of todayFood) {
      for (const [k, v] of Object.entries(strip$(row))) {
        if (k === 'date' || k === 'import_id' || k === 'food_name' || k === 'meal' || k === 'quantity' || k === 'note') continue;
        const n = parseFloat(v);
        if (Number.isFinite(n)) todayAgg[k] = (todayAgg[k] || 0) + n;
      }
    }
    todayAgg.date = todayStr;

    return res.json({
      data: dedupedRows,
      imports: importsRaw.map(i => ({ id: i.$id, ...strip$(i) })),
      todayFood: Object.keys(todayAgg).length > 1 ? todayAgg : null,
      prefs: {
        hidden_health_types: profile?.hidden_health_types || [],
        health_stat_order: profile?.health_stat_order || [],
      },
    });
  }

  // ── GET /api/health ─────────────────────────────────────────────────────
  // Normalise end-date so "2026-04-06" becomes "2026-04-06T23:59:59.999Z"
  // (ISO timestamps like "2026-04-06T12:00:00Z" > "2026-04-06" in string order,
  //  so a bare date would exclude every record ON that day.)
  const endIsoQ = q.end && !q.end.includes('T') ? `${q.end}T23:59:59.999Z` : q.end;

  if (method === 'GET' && path === '/api/health') {
    const queries = [Query.equal('user_id', userId), Query.orderDesc('timestamp')];
    if (q.start) queries.push(Query.greaterThanEqual('timestamp', q.start));
    if (endIsoQ) queries.push(Query.lessThanEqual('timestamp', endIsoQ));
    // Return only the fields the client needs (skip heavy system attrs)
    queries.push(Query.select(['type', 'value', 'timestamp', 'raw', 'import_id']));
    // Optional type filter — e.g. ?types=heart_rate_avg_countmin,weight_lb
    // Automatically includes macrofactor_ and apple_ prefixed variants
    if (q.types) {
      const baseTypes = String(q.types).split(',').map(t => t.trim()).filter(Boolean);
      const expanded = new Set(baseTypes);
      for (const t of baseTypes) {
        expanded.add(`macrofactor_${t}`);
        expanded.add(`apple_${t}`);
      }
      const typeArr = [...expanded];
      // Appwrite limits Query.equal to 100 values; batch if needed
      if (typeArr.length <= 100) {
        queries.push(Query.equal('type', typeArr));
      }
      // If > 100, skip server filter and let client filter (rare edge case)
    }
    // Run health data + medication queries in parallel for speed
    let medQueries = [Query.equal('user_id', userId)];
    if (q.start) medQueries.push(Query.greaterThanEqual('date', q.start.slice(0, 10)));
    if (endIsoQ) medQueries.push(Query.lessThanEqual('date', (endIsoQ || '').slice(0, 10)));

    const t0 = Date.now();
    const [rows, medEntries] = await Promise.all([
      db.find('health_data', queries, 2000),
      db.find('medication_entries', medQueries, 2000).catch(() => []),
    ]);
    log(`health GET: userId=${userId} rows=${rows.length} meds=${medEntries.length} start=${q.start||'ALL'} end=${q.end||'ALL'} types=${q.types ? 'filtered' : 'all'} dbMs=${Date.now()-t0}`);

    // Merge supplement entries from medication log
    const suppRows = medEntries.map(e => medicationEntryToHealthRow({ ...e, id: e.$id })).filter(Boolean);
    const allRows = [...rows.map(r => ({ id: r.$id, ...strip$(r) })), ...suppRows];

    // Deduplicate to one record per (type, date) — keeps max value per day.
    // iHealth records (source=ihealth_csv in raw) are keyed by full timestamp
    // so every individual reading is preserved for the Vitals page.
    const byKey = {};
    for (const r of allRows) {
      const date = (r.timestamp || '').slice(0, 10);
      if (!date) continue;
      const v = parseFloat(r.value);
      if (!Number.isFinite(v)) continue;
      // Preserve individual iHealth readings by keying on full timestamp
      let isIHealth = false;
      try { isIHealth = JSON.parse(String(r.raw || '{}')).source === 'ihealth_csv'; } catch (_) {}
      const key = isIHealth ? `${r.type}::${r.timestamp}` : `${r.type}::${date}`;
      if (!byKey[key] || v > parseFloat(byKey[key].value)) {
        byKey[key] = r;
      }
    }
    const dedupedRows = Object.values(byKey);
    dedupedRows.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    return res.json({ data: dedupedRows });
  }

  // ── GET /api/health/hero ─────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/health/hero') {
    const HERO_TYPES = [
      'dietary_energy_kcal', 'macrofactor_energy', 'macrofactor_calories',
      'step_count_count', 'macrofactor_steps',
      'weight_lb', 'macrofactor_weight', 'macrofactor_weight_lb',
      'sleep_analysis_total_sleep_hr',
    ];
    const rows = await db.find('health_data', [
      Query.equal('user_id', userId), Query.equal('type', HERO_TYPES), Query.orderDesc('timestamp'),
      Query.select(['type', 'value', 'timestamp']),
    ], 5000);
    return res.json({ data: rows.map(r => ({ id: r.$id, ...strip$(r) })) });
  }

  // ── GET /api/health/sleep/daily ──────────────────────────────────────────
  if (method === 'GET' && path === '/api/health/sleep/daily') {
    const daysRaw = Number.parseInt(q.days, 10);
    const days = Number.isFinite(daysRaw) ? Math.max(7, Math.min(730, daysRaw)) : 180;
    const tzOffsetRaw = Number.parseInt(q.tzOffsetMinutes, 10);
    const tzOffsetMinutes = Number.isFinite(tzOffsetRaw) ? tzOffsetRaw : 0;
    const endIso = new Date().toISOString();
    const startDate = new Date(); startDate.setUTCDate(startDate.getUTCDate() - days);
    const startIso = startDate.toISOString();

    const AUTOSLEEP_EXTRA = [
      'sleep_efficiency_percent', 'sleep_sessions_count', 'sleep_heart_rate_bpm', 'waking_heart_rate_bpm',
      'day_heart_rate_bpm', 'sleep_hrv_ms', 'heart_rate_variability_ms',
      'blood_oxygen_saturation__', 'blood_oxygen_min__', 'blood_oxygen_max__',
      'respiratory_rate_countmin', 'resp_rate_min_countmin', 'resp_rate_max_countmin',
      'breathing_disturbances_count', 'sleeping_wrist_temperature_degf', 'fell_asleep_in_hr',
    ];

    const SLEEP_ANALYSIS_TYPES = [
      'sleep_analysis_total_sleep_hr', 'sleep_analysis_in_bed_hr', 'sleep_analysis_deep_hr',
      'sleep_analysis_rem_hr', 'sleep_analysis_awake_hr', 'sleep_analysis_quality_hr',
      'sleep_analysis_core_hr', 'sleep_analysis_asleep_hr',
      'macrofactor_sleep_analysis_total_sleep_hr', 'macrofactor_sleep_analysis_in_bed_hr',
      'macrofactor_sleep_analysis_deep_hr', 'macrofactor_sleep_analysis_rem_hr',
      'macrofactor_sleep_analysis_awake_hr', 'macrofactor_sleep_analysis_quality_hr',
      'macrofactor_sleep_analysis_core_hr', 'macrofactor_sleep_analysis_asleep_hr',
    ];
    const ALL_SLEEP_TYPES = [...SLEEP_ANALYSIS_TYPES, ...AUTOSLEEP_EXTRA];

    // Fetch only sleep-related records by type (avoids fetching all 40K+ health records)
    const rows = await db.find('health_data', [
      Query.equal('user_id', userId),
      Query.greaterThanEqual('timestamp', startIso),
      Query.lessThanEqual('timestamp', endIso),
      Query.equal('type', ALL_SLEEP_TYPES),
      Query.select(['type', 'value', 'timestamp']),
    ], 2000);

    const byDay = new Map(), byDayExtra = new Map();
    for (const row of rows) {
      const day = dayKeyWithOffset(row.timestamp, tzOffsetMinutes);
      if (!day) continue;
      const type = canonicalSleepType(row.type);
      if (type) {
        const value = sleepHours(type, row.value);
        if (value == null) continue;
        let bucket = byDay.get(day);
        if (!bucket) { bucket = { day, _raw: Object.create(null) }; byDay.set(day, bucket); }
        const prev = bucket._raw[type];
        if (!prev || String(row.timestamp) > String(prev.timestamp)) bucket._raw[type] = { timestamp: row.timestamp, value };
      } else if (AUTOSLEEP_EXTRA.includes(row.type)) {
        const value = Number(row.value);
        if (!Number.isFinite(value)) continue;
        if (!byDayExtra.has(day)) byDayExtra.set(day, {});
        const extra = byDayExtra.get(day);
        const prevTs = extra[`${row.type}__ts`];
        if (!prevTs || String(row.timestamp) > prevTs) { extra[row.type] = value; extra[`${row.type}__ts`] = String(row.timestamp); }
      }
    }

    const allSleepDays = new Set([...byDay.keys(), ...byDayExtra.keys()]);
    const daily = [...allSleepDays].map(day => {
      const d = byDay.get(day) || { day, _raw: Object.create(null) };
      const extra = byDayExtra.get(day) || {};
      const total = d._raw.sleep_analysis_total_sleep_hr?.value;
      const asleep = d._raw.sleep_analysis_asleep_hr?.value;
      const inBed = d._raw.sleep_analysis_in_bed_hr?.value;
      const core = d._raw.sleep_analysis_core_hr?.value || 0;
      const rem = d._raw.sleep_analysis_rem_hr?.value || 0;
      const deep = d._raw.sleep_analysis_deep_hr?.value || 0;
      const awake = d._raw.sleep_analysis_awake_hr?.value;
      const quality = d._raw.sleep_analysis_quality_hr?.value;
      let interpretedTotal = total;
      if (!Number.isFinite(interpretedTotal)) {
        const staged = core + rem + deep;
        interpretedTotal = staged > 0 ? staged : asleep;
      }
      return {
        day, total_sleep_hr: Number.isFinite(interpretedTotal) ? interpretedTotal : null,
        asleep_hr: Number.isFinite(asleep) ? asleep : null, in_bed_hr: Number.isFinite(inBed) ? inBed : null,
        core_hr: core || null, rem_hr: rem || null, deep_hr: deep || null,
        awake_hr: Number.isFinite(awake) ? awake : null, quality_hr: Number.isFinite(quality) ? quality : null,
        efficiency: extra.sleep_efficiency_percent ?? null, sessions: extra.sleep_sessions_count ?? null,
        sleep_bpm: extra.sleep_heart_rate_bpm ?? null, waking_bpm: extra.waking_heart_rate_bpm ?? null,
        hrv: extra.heart_rate_variability_ms ?? null, sleep_hrv: extra.sleep_hrv_ms ?? null,
        spo2: extra.blood_oxygen_saturation__ ?? null, resp_rate: extra.respiratory_rate_countmin ?? null,
        breath_dist: extra.breathing_disturbances_count ?? null, wrist_temp: extra.sleeping_wrist_temperature_degf ?? null,
        fell_asleep_in: extra.fell_asleep_in_hr ?? null,
      };
    }).sort((a, b) => a.day.localeCompare(b.day));

    const totals = daily.map(d => d.total_sleep_hr).filter(v => Number.isFinite(v));
    const avgTotal = totals.length ? totals.reduce((s, n) => s + n, 0) / totals.length : null;
    return res.json({ range: { start: startIso, end: endIso, days }, nights: daily.length, average_total_sleep_hr: avgTotal, data: daily });
  }

  // ── GET /api/health/imports ──────────────────────────────────────────────
  if (method === 'GET' && path === '/api/health/imports') {
    const imports = await db.find('health_imports', [Query.equal('user_id', userId), Query.orderDesc('imported_at')]);
    return res.json({ imports: imports.map(i => ({ id: i.$id, ...strip$(i) })) });
  }

  // ── DELETE /api/health/imports (clear all) ───────────────────────────────
  if (method === 'DELETE' && path === '/api/health/imports') {
    await db.removeMany('health_data', [Query.equal('user_id', userId)]);
    await db.removeMany('food_log_entries', [Query.equal('user_id', userId)]);
    await db.removeMany('health_imports', [Query.equal('user_id', userId)]);
    return res.json({ ok: true });
  }

  // ── DELETE /api/health/imports/:id ───────────────────────────────────────
  const delImportMatch = path.match(/^\/api\/health\/imports\/([^/]+)$/);
  if (method === 'DELETE' && delImportMatch) {
    const importId = delImportMatch[1];
    const row = await db.findOne('health_imports', [Query.equal('$id', importId), Query.equal('user_id', userId)]);
    if (!row) return res.json({ error: 'not found' }, 404);
    await db.removeMany('health_data', [Query.equal('user_id', userId), Query.equal('import_id', importId)]);
    await db.removeMany('food_log_entries', [Query.equal('user_id', userId), Query.equal('import_id', importId)]);
    await db.remove('health_imports', importId);
    return res.json({ deleted: importId });
  }

  // ── GET /api/health/auto-pull/status ─────────────────────────────────────
  if (method === 'GET' && path === '/api/health/auto-pull/status') {
    return res.json({ configured: false, enabled: false, running: false, last_run_at: null, last_error: null });
  }

  // ── POST /api/health/import ──────────────────────────────────────────────
  if (method === 'POST' && path === '/api/health/import') {
    return await handleHealthImport({ db, storage, userId, body, req, res, log });
  }

  // ── POST /api/health/macro/import ────────────────────────────────────────
  if (method === 'POST' && path === '/api/health/macro/import') {
    return await handleMacroImport({ db, storage, userId, body, req, res, log });
  }

  return res.json({ error: 'Not found' }, 404);
}

/* ── Health Import (JSON / CSV) ─────────────────────────────────────────── */
async function handleHealthImport({ db, storage, userId, body, req, res, log }) {
  const uploadFilename = resolveImportFilename('ArfidWatch Import', body.filename, (req.headers || {})['x-upload-filename']);

  // Determine input type
  const _rawSamples = Array.isArray(body) ? body
    : (Array.isArray(body.samples) ? body.samples
      : (Array.isArray(body.data) ? body.data
        : (Array.isArray(body.records) ? body.records : null)));
  const _haeMetrics = !_rawSamples && (
    (body.data && Array.isArray(body.data.metrics)) ? body.data.metrics
    : Array.isArray(body.metrics) ? body.metrics : null
  );
  const sampleArray = _rawSamples || (_haeMetrics ? flattenHAEMetrics(_haeMetrics) : null);

  if (sampleArray) {
    const records = sampleArray.map(s => ({
      user_id: userId,
      type: s.type || s.dataType || s.name,
      value: s.value,
      timestamp: s.startDate || s.timestamp || s.date,
      raw: JSON.stringify(s),
    })).filter(r => {
      if (!r.type || !r.timestamp || r.value === undefined || r.value === null) return false;
      if (/^sleep_analysis_/i.test(String(r.type))) {
        try { return JSON.parse(r.raw || '{}').source === 'hae_rest'; } catch (_) { return false; }
      }
      return true;
    });

    const dedupedRaw = await filterDuplicateStats(db, userId, records);
    const deduped = preAggregateDailyRecords(dedupedRaw);

    if (_haeMetrics) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dtLabel = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const displayFilename = `Auto Export (${dtLabel}).csv`;

      const importDoc = await db.create('health_imports', {
        user_id: userId, filename: displayFilename, source: 'health',
        imported_at: now.toISOString(), record_count: deduped.length,
      }, userId);

      if (deduped.length > 0) {
        const tagged = deduped.map(r => ({ ...r, import_id: importDoc.$id }));
        await db.createMany('health_data', tagged, userId);
      }
      return res.json({ imported: deduped.length, skipped_duplicates: records.length - deduped.length, source: 'hae_rest_api', filename: displayFilename });
    }

    if (deduped.length > 0) {
      await db.createMany('health_data', deduped, userId);
    }
    return res.json({ imported: deduped.length, skipped_duplicates: records.length - deduped.length });
  }

  // CSV text
  const csvText = body.csv || (typeof body === 'string' ? body : null);
  if (!csvText) return res.json({ error: 'no data provided' }, 400);

  let fileHash = null;
  try { fileHash = crypto.createHash('sha256').update(csvText).digest('hex'); } catch (_) {}

  try {
    const rows = csvParseFn(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const isAutoSleep = isAutoSleepCsvHeaders(headers);
    const isIHealth = !isAutoSleep && isIHealthCsvHeaders(headers);
    const records = [];

    if (isAutoSleep) records.push(...buildAutoSleepRecords(rows, userId));
    if (isIHealth) records.push(...buildIHealthRecords(rows, userId));

    if (!isAutoSleep && !isIHealth) {
      const tsCandidates = ['startDate', 'endDate', 'timestamp', 'date', 'time'];
      for (const row of rows) {
        let ts = null;
        for (const k of Object.keys(row)) {
          if (tsCandidates.includes(k) || /date|time|timestamp/i.test(k)) {
            const v = row[k]; if (v) { const d = new Date(v); if (!isNaN(d.getTime())) { ts = d.toISOString(); break; } }
          }
        }
        if (!ts) ts = new Date().toISOString();
        for (const [k, v] of Object.entries(row)) {
          if (!k || /^\s*$/.test(k) || /date|time|timestamp/i.test(k)) continue;
          if (v === undefined || v === null || String(v).trim() === '') continue;
          const typeKey = String(k).trim().toLowerCase().replace(/\s+/g, '_').replace(/[\[\]()\./\u00B7\u22C5\u2022]/g, '').replace(/[^a-z0-9_]/g, '_');
          if (/^sleep_analysis_/i.test(typeKey)) continue;
          const num = parseFloat(String(v).replace(/[^0-9eE+\-.]/g, ''));
          if (!Number.isFinite(num)) continue;
          records.push({ user_id: userId, type: typeKey, value: num, timestamp: ts, raw: JSON.stringify({ column: k, value: v }) });
        }
      }
    }

    if (isAutoSleep) {
      // AutoSleep: replace nights then insert
      let normalized = [];
      const seenUp = new Set();
      for (const rec of records) {
        const ts = normalizeStatTimestamp(rec.timestamp); if (!ts) continue;
        const nr = { ...rec, timestamp: ts, value: normalizeStatValue(rec.value) };
        if (typeof nr.value !== 'number') continue;
        const key = statKey(nr);
        if (seenUp.has(key)) continue; seenUp.add(key);
        normalized.push(nr);
      }
      const nightTypeMap = new Map();
      for (const rec of normalized) {
        const day = String(rec.timestamp).slice(0, 10);
        if (!nightTypeMap.has(day)) nightTypeMap.set(day, new Set());
        nightTypeMap.get(day).add(rec.type);
        const sa = canonicalSleepType(rec.type);
        if (sa && sa !== rec.type) nightTypeMap.get(day).add(`macrofactor_${sa}`);
      }
      // Delete existing for each night/type
      for (const [day, types] of nightTypeMap) {
        const typesArr = [...types];
        const existing = await db.find('health_data', [
          Query.equal('user_id', userId), Query.equal('type', typesArr),
          Query.greaterThanEqual('timestamp', `${day}T00:00:00.000Z`),
          Query.lessThanEqual('timestamp', `${day}T23:59:59.999Z`),
        ], 5000);
        for (const e of existing) { try { await db.remove('health_data', e.$id); } catch (_) {} }
      }
      if (normalized.length > 0) {
        const importDoc = await db.create('health_imports', {
          user_id: userId, filename: uploadFilename, source: 'health',
          imported_at: new Date().toISOString(), record_count: normalized.length,
          ...(fileHash ? { file_hash: fileHash } : {}),
        }, userId);
        const tagged = normalized.map(r => ({ ...r, import_id: importDoc.$id }));
        await db.createMany('health_data', tagged, userId);
      }
      return res.json({ imported: normalized.length, skipped_duplicates: records.length - normalized.length, source: 'autosleep_csv' });
    }

    if (isIHealth) {
      let normalized = [];
      const seenUp = new Set();
      for (const rec of records) {
        const ts = normalizeStatTimestamp(rec.timestamp); if (!ts) continue;
        const nr = { ...rec, timestamp: ts, value: normalizeStatValue(rec.value) };
        if (typeof nr.value !== 'number') continue;
        const key = statKey(nr); if (seenUp.has(key)) continue; seenUp.add(key);
        normalized.push(nr);
      }
      // Delete existing matching type+minute-timestamp
      const tsTypeKeys = new Map();
      for (const rec of normalized) tsTypeKeys.set(`${rec.type}|${rec.timestamp.slice(0, 16)}`, true);
      for (const compound of tsTypeKeys.keys()) {
        const [type, tsPrefix] = compound.split('|');
        const existing = await db.find('health_data', [
          Query.equal('user_id', userId), Query.equal('type', type),
          Query.greaterThanEqual('timestamp', `${tsPrefix}:00.000Z`),
          Query.lessThanEqual('timestamp', `${tsPrefix}:59.999Z`),
        ], 100);
        for (const e of existing) { try { await db.remove('health_data', e.$id); } catch (_) {} }
      }
      if (normalized.length > 0) {
        const importDoc = await db.create('health_imports', {
          user_id: userId, filename: uploadFilename, source: 'health',
          imported_at: new Date().toISOString(), record_count: normalized.length,
          ...(fileHash ? { file_hash: fileHash } : {}),
        }, userId);
        const tagged = normalized.map(r => ({ ...r, import_id: importDoc.$id }));
        await db.createMany('health_data', tagged, userId);
      }
      return res.json({ imported: normalized.length, skipped_duplicates: records.length - normalized.length, source: 'ihealth_csv' });
    }

    // Generic CSV
    const dedupedRaw2 = await filterDuplicateStats(db, userId, records);
    const deduped2 = preAggregateDailyRecords(dedupedRaw2);
    if (deduped2.length > 0) {
      const importDoc = await db.create('health_imports', {
        user_id: userId, filename: uploadFilename, source: 'health',
        imported_at: new Date().toISOString(), record_count: deduped2.length,
        ...(fileHash ? { file_hash: fileHash } : {}),
      }, userId);
      const tagged = deduped2.map(r => ({ ...r, import_id: importDoc.$id }));
      await db.createMany('health_data', tagged, userId);
    }
    return res.json({ imported: deduped2.length, skipped_duplicates: records.length - deduped2.length, source: 'health_csv' });
  } catch (err) {
    return res.json({ error: 'failed to parse csv', detail: err.message }, 500);
  }
}

/* ── MacroFactor Import ─────────────────────────────────────────────────── */
async function handleMacroImport({ db, storage, userId, body, req, res, log }) {
  // Support inline base64 file (faster path, no Storage round-trip) or Storage fileId
  const { fileId, fileBase64, filename: bodyFilename, bucketId } = body;
  if (!fileId && !fileBase64) return res.json({ error: 'no file (fileId or fileBase64 required)' }, 400);

  const BUCKET_ID = bucketId || 'uploads';
  let fileBuffer;
  if (fileBase64) {
    fileBuffer = Buffer.from(fileBase64, 'base64');
  } else {
    try {
      fileBuffer = await storage.getFileDownload(BUCKET_ID, fileId);
    } catch (e) {
      return res.json({ error: 'could not read uploaded file' }, 400);
    }
  }

  const originalFilename = bodyFilename || 'import';
  const ext = (originalFilename.match(/\.[^.]+$/) || ['.csv'])[0].toLowerCase();
  const uploadFilename = resolveImportFilename('ArfidWatch Import', originalFilename);
  const fileText = typeof fileBuffer === 'string' ? fileBuffer : Buffer.from(fileBuffer).toString('utf8');
  const fileHash = crypto.createHash('sha256').update(fileText).digest('hex');

  const records = [];
  const tsCandidates = /date|time|day/i;
  let parsedRowsForFoodLog = [];
  let isFoodLogFile = false;
  let foodLogInserted = 0;

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      // Use exceljs for xlsx parsing
      const exceljs = await import('exceljs');
      const workbook = new exceljs.default.Workbook();
      await workbook.xlsx.load(fileBuffer);
      if (!workbook.worksheets.length) return res.json({ error: 'no sheets found in xlsx' }, 400);

      const toCellValue = (v) => {
        if (v == null) return '';
        if (typeof v === 'object') {
          if (v.text != null) return String(v.text);
          if (v.result != null) return String(v.result);
          if (v.richText && Array.isArray(v.richText)) return v.richText.map(rt => rt.text || '').join('');
        }
        return v;
      };

      for (const sheet of workbook.worksheets) {
        if (!sheet || sheet.rowCount < 2) continue;
        const headers = [];
        sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = String(cell.value || '').trim(); });
        if (isAutoSleepCsvHeaders(headers)) continue;

        sheet.eachRow((row, rowNum) => {
          if (rowNum === 1) return;
          const rowObj = {};
          headers.forEach((h, col) => { if (h) rowObj[h] = toCellValue(row.getCell(col).value); });
          parsedRowsForFoodLog.push(rowObj);
          let ts = null;
          headers.forEach((h, col) => {
            if (!ts && tsCandidates.test(h)) {
              const v = toCellValue(row.getCell(col).value);
              if (v) { const d = v instanceof Date ? v : new Date(v); if (!isNaN(d.getTime())) ts = d.toISOString(); }
            }
          });
          if (!ts) ts = new Date().toISOString();
          headers.forEach((h, col) => {
            if (!h || tsCandidates.test(h)) return;
            const cellVal = toCellValue(row.getCell(col).value);
            if (cellVal === null || cellVal === undefined || cellVal === '') return;
            const rec = toRecord(userId, normalizeKey(h), cellVal, ts, { rowNum, source: 'macro_xlsx' });
            if (rec) records.push(rec);
          });
        });
      }
    } else if (ext === '.numbers') {
      const XLSX = await import('xlsx');
      const wb = XLSX.default.read(fileBuffer, { type: 'buffer' });
      if (!wb.SheetNames.length) return res.json({ error: 'no sheet found in Numbers file' }, 400);
      const allRows = [];
      let firstHeaders = null;
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]; if (!sheet) continue;
        const rows = XLSX.default.utils.sheet_to_json(sheet, { defval: '', raw: false });
        if (!rows.length) continue;
        if (!firstHeaders) firstHeaders = Object.keys(rows[0]);
        allRows.push(...rows);
      }
      if (!allRows.length) return res.json({ error: 'empty Numbers file' }, 400);
      parsedRowsForFoodLog = allRows;
      let rowNum = 1;
      for (const row of allRows) {
        rowNum++;
        let ts = null;
        const datePart = row.Date || row.date, timePart = row.Time || row.time;
        if (datePart && timePart) { const d = new Date(`${datePart} ${timePart}`); if (!isNaN(d.getTime())) ts = d.toISOString(); }
        for (const [k, v] of Object.entries(row)) {
          if (!ts && tsCandidates.test(k) && v) { const d = new Date(v); if (!isNaN(d.getTime())) { ts = d.toISOString(); break; } }
        }
        if (!ts) ts = new Date().toISOString();
        for (const [k, v] of Object.entries(row)) {
          if (tsCandidates.test(k) || !v || String(v).trim() === '') continue;
          const rec = toRecord(userId, normalizeKey(k), v, ts, { rowNum, source: 'numbers' });
          if (rec) records.push(rec);
        }
      }
    } else {
      // CSV
      const parsedRows = parseCsvTextLenient(fileText);
      const csvHeaders = parsedRows.length ? Object.keys(parsedRows[0]) : [];
      if (isAutoSleepCsvHeaders(csvHeaders)) return res.json({ error: 'AutoSleep file detected; use /api/health/import' }, 400);
      parsedRowsForFoodLog = parsedRows;
      let csvRowNum = 1;
      for (const row of parsedRows) {
        csvRowNum++;
        let ts = null;
        const datePart = row.Date || row.date, timePart = row.Time || row.time;
        if (datePart && timePart) { const d = new Date(`${datePart} ${timePart}`); if (!isNaN(d.getTime())) ts = d.toISOString(); }
        for (const [k, v] of Object.entries(row)) {
          if (!ts && tsCandidates.test(k) && v) { const d = new Date(v); if (!isNaN(d.getTime())) { ts = d.toISOString(); break; } }
        }
        if (!ts) ts = new Date().toISOString();
        for (const [k, v] of Object.entries(row)) {
          if (tsCandidates.test(k) || !v || String(v).trim() === '') continue;
          const rec = toRecord(userId, normalizeKey(k), v, ts, { rowNum: csvRowNum, source: 'macro_csv' });
          if (rec) records.push(rec);
        }
      }
    }

    // Food log extraction
    if (parsedRowsForFoodLog.length > 0) {
      const headers = Object.keys(parsedRowsForFoodLog[0]);
      const findH = (...tests) => headers.find(h => tests.some(t => t.test(String(h).trim())));
      const numOrNull = v => { if (v == null || String(v).trim() === '') return null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
      const normDate = v => { if (v == null) return null; const d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
      const foodCol = findH(/^food name$/i, /^food$/i);
      const mealCol = findH(/^meal$/i);
      const timeCol = findH(/^time$/i);
      const calCol = findH(/calorie|kcal|energy/i);
      const proteinCol = findH(/^protein/i);
      const carbsCol = findH(/carb/i);
      const fatCol = findH(/^fat\b/i);
      const amtCol = findH(/^amount$|^serving$|^quantity$/i);
      const dateCol = findH(/^date$/i, /date/i, /day/i);

      if (foodCol) {
        isFoodLogFile = true;
        // Build new entries first to determine affected date range
        const foodEntries = parsedRowsForFoodLog.map(row => {
          const datePart = dateCol ? row[dateCol] : (row.Date || row.date);
          const dateStr = normDate(datePart);
          const foodName = String(row[foodCol] || '').trim();
          if (!foodName || !dateStr) return null;
          return {
            user_id: userId, import_id: null, date: dateStr,
            meal: mealCol ? String(row[mealCol] || '').trim() : timeCol ? String(row[timeCol] || '').trim() : '',
            food_name: foodName, quantity: amtCol ? String(row[amtCol] || '').trim() : '',
            calories: calCol ? numOrNull(row[calCol]) : null,
            protein_g: proteinCol ? numOrNull(row[proteinCol]) : null,
            carbs_g: carbsCol ? numOrNull(row[carbsCol]) : null,
            fat_g: fatCol ? numOrNull(row[fatCol]) : null,
            note: null,
          };
        }).filter(Boolean);

        // Determine the date range covered by the upload
        const uploadDates = new Set(foodEntries.map(e => e.date));
        const sortedDates = [...uploadDates].sort();
        const minDate = sortedDates[0];
        const maxDate = sortedDates[sortedDates.length - 1];

        // Only wipe entries within the uploaded date range; preserve all others
        if (minDate && maxDate) {
          // Fetch existing entries in the date range to preserve notes
          const existingInRange = await db.find('food_log_entries', [
            Query.equal('user_id', userId),
            Query.greaterThanEqual('date', minDate),
            Query.lessThanEqual('date', maxDate),
          ], 5000);

          // Build note map from existing entries in range
          const noteMap = new Map();
          for (const n of existingInRange) {
            if (!n.note) continue;
            const key = `${n.date}|${(n.meal || '').trim().toLowerCase()}|${(n.food_name || '').trim().toLowerCase()}`;
            noteMap.set(key, n.note);
          }

          // Restore notes onto new entries
          for (const entry of foodEntries) {
            const noteKey = `${entry.date}|${(entry.meal || '').trim().toLowerCase()}|${entry.food_name.toLowerCase()}`;
            entry.note = noteMap.get(noteKey) || null;
          }

          // Delete only entries within the uploaded date range
          await db.removeMany('food_log_entries', [
            Query.equal('user_id', userId),
            Query.greaterThanEqual('date', minDate),
            Query.lessThanEqual('date', maxDate),
          ]);
        }

        if (foodEntries.length > 0) {
          const foodImportDoc = await db.create('health_imports', {
            user_id: userId, filename: uploadFilename, source: 'foodlog',
            file_hash: fileHash, imported_at: new Date().toISOString(), record_count: foodEntries.length,
          }, userId);
          const taggedFood = foodEntries.map(e => ({ ...e, import_id: foodImportDoc.$id }));
          await db.createMany('food_log_entries', taggedFood, userId);
          foodLogInserted = foodEntries.length;
        }
      }
    }

    const deduped = isFoodLogFile ? [] : await filterDuplicateStats(db, userId, records);

    if (deduped.length > 0) {
      // Clean up previous imports of same file hash
      const prevImports = await db.find('health_imports', [
        Query.equal('user_id', userId), Query.equal('file_hash', fileHash),
        Query.equal('source', 'macro'),
      ], 100);
      for (const pi of prevImports) {
        await db.removeMany('health_data', [Query.equal('user_id', userId), Query.equal('import_id', pi.$id)]);
        await db.remove('health_imports', pi.$id);
      }

      const importDoc = await db.create('health_imports', {
        user_id: userId, filename: uploadFilename, source: 'macro',
        file_hash: fileHash, imported_at: new Date().toISOString(), record_count: deduped.length,
      }, userId);
      const tagged = deduped.map(r => ({ ...r, import_id: importDoc.$id }));
      await db.createMany('health_data', tagged, userId);
    }

    return res.json({ imported: isFoodLogFile ? foodLogInserted : deduped.length, isFoodLogFile, skipped_duplicates: records.length - deduped.length });
  } catch (err) {
    return res.json({ error: 'failed to import', detail: err.message }, 500);
  } finally {
    // Clean up the uploaded file from Storage (only if we used Storage)
    if (fileId) { try { await storage.deleteFile(BUCKET_ID, fileId); } catch (_) {} }
  }
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, user_id, ...rest } = doc;
  return rest;
}
