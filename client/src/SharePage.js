import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import './SharePage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';
import { avgOf, avgOfPeriod, latestOf, minOf, maxOf, countOf } from './utils/metricUtils';

// ── Vitals chart config for share page (15 most important) ────────────────────
const SHARE_VITALS = [
  { key: 'resting_heart_rate_countmin',    label: 'Resting HR',    unit: 'bpm',   dp: 0, color: '#e74c3c' },
  { key: 'heart_rate_avg_countmin',        label: 'Avg HR',        unit: 'bpm',   dp: 0, color: '#ef4444' },
  { key: 'blood_pressure_systolic_mmhg',   label: 'BP Systolic',   unit: 'mmHg',  dp: 0, color: '#f97316' },
  { key: 'blood_pressure_diastolic_mmhg',  label: 'BP Diastolic',  unit: 'mmHg',  dp: 0, color: '#fb923c' },
  { key: 'heart_rate_variability_ms',      label: 'HRV',           unit: 'ms',    dp: 1, color: '#9b59b6' },
  { key: 'blood_oxygen_saturation__',      label: 'Blood O\u2082', unit: '%',     dp: 1, color: '#22d3ee' },
  { key: 'weight_lb',                      label: 'Weight',        unit: 'lb',    dp: 1, color: '#a78bfa', altKeys: ['weight_kg'] },
  { key: 'body_fat_percentage__',          label: 'Body Fat',      unit: '%',     dp: 1, color: '#eab308' },
  { key: 'body_mass_index_count',          label: 'BMI',           unit: '',      dp: 1, color: '#94a3b8' },
  { key: 'body_temperature_degf',          label: 'Body Temp',     unit: '\u00b0F', dp: 1, color: '#f472b6' },
  { key: 'blood_glucose_mgdl',            label: 'Blood Glucose', unit: 'mg/dL', dp: 0, color: '#34d399' },
  { key: 'respiratory_rate_countmin',      label: 'Resp. Rate',    unit: '/min',  dp: 1, color: '#67e8f9' },
  { key: 'vo2_max_mlkgmin',               label: 'VO\u2082 Max',  unit: 'ml/kg/min', dp: 1, color: '#14b8a6', altKeys: ['vo2_max_mlkg_min'] },
  { key: 'step_count_count',              label: 'Steps',         unit: '',      dp: 0, color: '#22c55e', altKeys: ['steps'] },
  { key: 'active_energy_kcal',            label: 'Active Energy', unit: 'kcal',  dp: 0, color: '#f59e0b' },
];

const SHARE_GRAPH_GROUPS = [
  { id: 'pulse', title: 'Pulse',          unit: 'bpm',  keys: ['heart_rate_avg_countmin', 'resting_heart_rate_countmin'], labels: ['Avg', 'Resting'] },
  { id: 'bp',    title: 'Blood Pressure', unit: 'mmHg', keys: ['blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg'], labels: ['SYS', 'DIA'] },
  { id: 'wt',    title: 'Weight',         unit: 'lb',   keys: ['weight_lb'], labels: ['Weight'] },
  { id: 'hrv',   title: 'HRV',            unit: 'ms',   keys: ['heart_rate_variability_ms'], labels: ['HRV'] },
  { id: 'spo2',  title: 'Blood O\u2082',  unit: '%',    keys: ['blood_oxygen_saturation__'], labels: ['SpO\u2082'] },
];

const lightenHex = hex => {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.min(255, ((n >> s) & 0xFF) + Math.round((255 - ((n >> s) & 0xFF)) * 0.4)).toString(16).padStart(2, '0')).join('');
};

// ── Type helpers ──────────────────────────────────────────────────────────────
const canonical = t => {
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};

const getSource = r => { try { return JSON.parse(String(r.raw || '{}')).source || ''; } catch (_) { return ''; } };
const fmtLocalDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtLocalDateTime = d => `${fmtLocalDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const toLocalDate = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : fmtLocalDate(d); };
const toLocalDateTime = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : fmtLocalDateTime(d); };
const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

// Maps post-canonical type names → the canonical key used in SECTIONS metrics.
// Covers MacroFactor column name variants that differ from Apple Health names.
const TYPE_ALIASES = {
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
  'vo2_max_mlkg_min':       'vo2_max_mlkgmin',           // CSV middle-dot variant
  'physical_effort_kcalhr_kg': 'physical_effort_kcalhrkg', // CSV middle-dot variant
  // heart
  'resting_heart_rate':     'resting_heart_rate_countmin',
};

function buildMaps(rows) {
  // iHealth-priority keys: when iHealth data exists for a day, ignore auto health for that day
  const IH_PRIORITY = new Set([
    'heart_rate_avg_countmin', 'resting_heart_rate_countmin',
    'blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg',
    'heart_rate', 'heartrate', 'pulse', 'heart_ratebeatsmin',
    'systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg',
    'diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg',
  ]);
  const maps = {};
  // Track which (type, day) pairs have iHealth data to suppress auto health
  const ihDays = {};  // { ct: Set(day) }
  // First pass: collect iHealth rows
  rows.forEach(r => {
    if (getSource(r) !== 'ihealth_csv') return;
    const raw = canonical(r.type);
    const ct  = TYPE_ALIASES[raw] || raw;
    if (!IH_PRIORITY.has(ct)) return;
    const v   = parseFloat(r.value);
    if (!Number.isFinite(v)) return;
    const day = String(r.timestamp || '').slice(0, 10);
    if (!day) return;
    if (!ihDays[ct]) ihDays[ct] = new Set();
    ihDays[ct].add(day);
    if (!maps[ct]) maps[ct] = {};
    // For iHealth, average multiple readings per day
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
  // Second pass: all rows (auto health fills gaps where iHealth is absent)
  rows.forEach(r => {
    const raw = canonical(r.type);
    const ct  = TYPE_ALIASES[raw] || raw;
    const v   = parseFloat(r.value);
    if (!Number.isFinite(v)) return;
    const day = String(r.timestamp || '').slice(0, 10);
    if (!day) return;
    // Skip auto health for iHealth-priority types where iHealth has data that day
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

const stdDev = (nums) => {
  if (!nums.length) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
};

const fmtSleepHr = (v) => {
  if (v == null || !Number.isFinite(v)) return '–';
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

/* ── Sleep stage graph for share page ── */
const SHARE_STAGE_COLORS = {
  deep: '#3d5afe', rem: '#9d7aff', core: '#5b8fd9', awake: '#e57150',
};

const ShareSleepGraph = ({ d }) => {
  const stages = [
    { key: 'deep',  label: 'Deep Sleep',  hr: d.deep  || 0, color: SHARE_STAGE_COLORS.deep  },
    { key: 'rem',   label: 'REM Sleep',   hr: d.rem   || 0, color: SHARE_STAGE_COLORS.rem   },
    { key: 'core',  label: 'Core Sleep',  hr: d.core  || 0, color: SHARE_STAGE_COLORS.core  },
    { key: 'awake', label: 'Awake',       hr: d.awake || 0, color: SHARE_STAGE_COLORS.awake },
  ];
  const tot = stages.reduce((s, st) => s + st.hr, 0);
  if (tot <= 0) return null;

  let cumDeg = 0;
  const stops = stages.map(s => {
    const start = cumDeg;
    cumDeg += (s.hr / tot) * 360;
    return `${s.color} ${start.toFixed(1)}deg ${cumDeg.toFixed(1)}deg`;
  }).join(', ');

  return (
    <div className="shs-sgraph">
      <div className="shs-sgraph-top">
        <div className="shs-donut" style={{ background: `conic-gradient(${stops})` }}>
          <div className="shs-donut-inner">
            <span className="shs-donut-total">{fmtSleepHr(d.total)}</span>
            <span className="shs-donut-sub">Total</span>
          </div>
        </div>
        <div className="shs-sgraph-bars">
          {stages.map(s => {
            const pct = (s.hr / tot) * 100;
            return (
              <div key={s.key} className="shs-sbar-row">
                <div className="shs-sbar-head">
                  <span className="shs-sbar-dot" style={{ background: s.color }} />
                  <span className="shs-sbar-name">{s.label}</span>
                  <span className="shs-sbar-pct">{pct.toFixed(0)}%</span>
                </div>
                <div className="shs-sbar-track">
                  <div className="shs-sbar-fill" style={{ width: `${pct}%`, background: s.color }} />
                </div>
                <span className="shs-sbar-time">{fmtSleepHr(s.hr)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="shs-sgraph-metrics">
        {d.efficiency    != null && <div className="shs-metric"><strong className={d.efficiency < 75 ? 'shs-warn' : undefined}>{d.efficiency.toFixed(0)}%</strong><span>Efficiency</span></div>}
        {d.quality       != null && <div className="shs-metric"><strong>{fmtSleepHr(d.quality)}</strong><span>Quality Sleep</span></div>}
        {d.fellAsleepIn  != null && <div className="shs-metric"><strong>{Math.round(d.fellAsleepIn * 60)} min</strong><span>Onset Latency</span></div>}
        {d.sleepHR       != null && <div className="shs-metric"><strong>{Math.round(d.sleepHR)} bpm</strong><span>Sleep HR</span></div>}
        {d.wakingHR      != null && <div className="shs-metric"><strong>{Math.round(d.wakingHR)} bpm</strong><span>Waking HR</span></div>}
        {d.hrv           != null && <div className="shs-metric"><strong>{Math.round(d.hrv)} ms</strong><span>HRV</span></div>}
        {d.sleepHRV      != null && <div className="shs-metric"><strong>{Math.round(d.sleepHRV)} ms</strong><span>Sleep HRV</span></div>}
        {d.spo2          != null && <div className="shs-metric"><strong className={d.spo2 < 96 ? 'shs-warn' : undefined}>{d.spo2.toFixed(1)}%</strong><span>SpO₂</span></div>}
        {d.minSpo2       != null && <div className="shs-metric"><strong className={d.minSpo2 < 90 ? 'shs-crit' : d.minSpo2 < 94 ? 'shs-warn' : undefined}>{d.minSpo2.toFixed(1)}%</strong><span>Min SpO₂</span></div>}
        {d.respRate      != null && <div className="shs-metric"><strong>{d.respRate.toFixed(1)}</strong><span>Resp /min</span></div>}
        {d.breathDist    != null && <div className="shs-metric"><strong className={d.breathDist > 15 ? 'shs-warn' : undefined}>{Math.round(d.breathDist)}</strong><span>Disturbances</span></div>}
        {d.wristTemp     != null && <div className="shs-metric"><strong>{d.wristTemp.toFixed(1)}°F</strong><span>Wrist Temp</span></div>}
      </div>
    </div>
  );
};

function pick(maps, ...keys) {
  for (const k of keys) { if (maps[k]) return maps[k]; }
  return null;
}

// ── Section definitions ───────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'nutrition',
    title: 'Nutrition',
    defaultOpen: true,
    metrics: [
      { keys: ['saturated_fat_g'],                                    label: 'Saturated Fat', unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['trans_fat_g'],                                        label: 'Trans Fat',     unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['fiber_g', 'fiber'],                                   label: 'Fiber',         unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['sugar_g', 'sugar'],                                   label: 'Sugar',         unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['added_sugar_g'],                                      label: 'Added Sugar',   unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['sodium_mg', 'sodium'],                                label: 'Sodium',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['cholesterol_mg'],                                     label: 'Cholesterol',   unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['potassium_mg', 'potassium'],                          label: 'Potassium',     unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['calcium_mg', 'calcium'],                              label: 'Calcium',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['iron_mg', 'iron'],                                    label: 'Iron',          unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['magnesium_mg', 'magnesium'],                          label: 'Magnesium',     unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['zinc_mg', 'zinc'],                                    label: 'Zinc',          unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['vitamin_a_mcg', 'vitamin_a'],                         label: 'Vitamin A',     unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['vitamin_c_mg', 'vitamin_c'],                          label: 'Vitamin C',     unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['vitamin_d_mcg', 'vitamin_d'],                         label: 'Vitamin D',     unit: 'mcg',  dp: 1, mode: 'avg' },
      { keys: ['vitamin_b12_mcg', 'vitamin_b12'],                     label: 'Vitamin B12',   unit: 'mcg',  dp: 1, mode: 'avg' },
      { keys: ['vitamin_b6_mg'],                                       label: 'Vitamin B6',    unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['vitamin_e_mg'],                                        label: 'Vitamin E',     unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['vitamin_k_mcg'],                                       label: 'Vitamin K',     unit: 'mcg',  dp: 1, mode: 'avg' },
      { keys: ['folate_mcg', 'folic_acid_mcg'],                       label: 'Folate',        unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['biotin_mcg'],                                          label: 'Biotin',        unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['niacin_mg'],                                           label: 'Niacin',        unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['pantothenic_acid_mg'],                                 label: 'Pantothenic Acid', unit: 'mg', dp: 1, mode: 'avg' },
      { keys: ['riboflavin_mg'],                                       label: 'Riboflavin',    unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['thiamin_mg'],                                          label: 'Thiamin',       unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['chromium_mcg'],                                        label: 'Chromium',      unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['copper_mg'],                                           label: 'Copper',        unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['iodine_mcg'],                                          label: 'Iodine',        unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['manganese_mg'],                                        label: 'Manganese',     unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['molybdenum_mcg'],                                      label: 'Molybdenum',    unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['selenium_mcg'],                                        label: 'Selenium',      unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['monounsaturated_fat_g'],                               label: 'Monounsat. Fat',unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['polyunsaturated_fat_g'],                               label: 'Polyunsat. Fat',unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['caffeine_mg', 'caffeine'],                            label: 'Caffeine',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['water_fl_oz_us', 'water'],                            label: 'Water',         unit: 'fl oz',dp: 1, mode: 'avg' },
    ],
  },
  {
    id: 'body_activity',
    title: 'Body & Activity',
    defaultOpen: true,
    metrics: [
      { keys: ['weight_lb', 'weight_lb', 'weight'],                  label: 'Weight',        unit: 'lb',   dp: 1, mode: 'latest' },
      { keys: ['weight_kg'],                                          label: 'Weight',        unit: 'kg',   dp: 1, mode: 'latest' },
      { keys: ['body_fat_percentage__', 'body_fat'],                  label: 'Body Fat',      unit: '%',    dp: 1, mode: 'latest' },
      { keys: ['lean_body_mass_lb', 'lean_mass'],                     label: 'Lean Mass',     unit: 'lb',   dp: 1, mode: 'latest' },
      { keys: ['body_mass_index_count'],                              label: 'BMI',           unit: '',     dp: 1, mode: 'latest' },
      { keys: ['waist_circumference_in'],                             label: 'Waist',         unit: 'in',   dp: 1, mode: 'latest' },
      { keys: ['resting_heart_rate_countmin'],                        label: 'Resting HR',    unit: 'bpm',  dp: 0, mode: 'latest' },
      { keys: ['heart_rate_avg_countmin'],                            label: 'Avg HR',        unit: 'bpm',  dp: 0, mode: 'latest' },
      { keys: ['heart_rate_variability_ms'],                          label: 'HRV',           unit: 'ms',   dp: 1, mode: 'latest' },
      { keys: ['blood_oxygen_saturation__'],                          label: 'Blood O\u2082', unit: '%',    dp: 1, mode: 'latest' },
      { keys: ['blood_pressure_systolic_mmhg'],                       label: 'Systolic BP',   unit: 'mmHg', dp: 0, mode: 'latest' },
      { keys: ['blood_pressure_diastolic_mmhg'],                      label: 'Diastolic BP',  unit: 'mmHg', dp: 0, mode: 'latest' },
      { keys: ['blood_glucose_mgdl'],                                 label: 'Blood Glucose', unit: 'mg/dL',dp: 0, mode: 'latest' },
      { keys: ['body_temperature_degf'],                              label: 'Body Temp',     unit: '\u00b0F', dp: 1, mode: 'latest' },
      { keys: ['basal_body_temperature_degf'],                         label: 'Basal Temp',    unit: '\u00b0F', dp: 1, mode: 'latest' },
      { keys: ['atrial_fibrillation_burden__'],                        label: 'AFib Burden',   unit: '%',    dp: 1, mode: 'latest' },
      // ── Activity ──
      { keys: ['step_count_count', 'steps'],                          label: 'Steps',          unit: '',           dp: 0, mode: 'latest' },
      { keys: ['exercise_time_min'],                                  label: 'Exercise Time',  unit: 'min',        dp: 0, mode: 'latest' },
      { keys: ['active_energy_kcal'],                                 label: 'Active Energy',  unit: 'kcal',       dp: 0, mode: 'latest' },
      { keys: ['resting_energy_kcal'],                                label: 'Resting Energy', unit: 'kcal',       dp: 0, mode: 'latest' },
      { keys: ['walking___running_distance_mi'],                      label: 'Walk+Run Dist.', unit: 'mi',         dp: 2, mode: 'latest' },
      { keys: ['flights_climbed_count'],                              label: 'Flights Climbed',unit: '',           dp: 0, mode: 'latest' },
      { keys: ['stand_time_min'],                                     label: 'Stand Time',     unit: 'min',        dp: 0, mode: 'latest' },
      { keys: ['stand_hour_count'],                                   label: 'Stand Hours',    unit: 'hr',         dp: 0, mode: 'latest' },
      { keys: ['move_time_min'],                                      label: 'Move Time',      unit: 'min',        dp: 0, mode: 'latest' },
      { keys: ['vo2_max_mlkgmin', 'vo2_max_mlkg_min'],                label: 'VO\u2082 Max',   unit: 'ml/kg/min',  dp: 1, mode: 'latest' },
      { keys: ['expenditure', 'energy_expenditure'],                  label: 'Expenditure',    unit: 'kcal',       dp: 0, mode: 'latest' },
      { keys: ['physical_effort_kcalhrkg', 'physical_effort_kcalhr_kg'], label: 'Physical Effort', unit: 'kcal/hr\u00B7kg', dp: 1, mode: 'latest' },
      { keys: ['cardio_recovery_countmin'],                           label: 'Cardio Recovery',unit: 'bpm',        dp: 0, mode: 'latest' },
      { keys: ['walking_speed_mihr'],                                 label: 'Walking Speed',  unit: 'mph',        dp: 2, mode: 'latest' },
      { keys: ['walking_step_length_in'],                             label: 'Step Length',    unit: 'in',         dp: 1, mode: 'latest' },
      { keys: ['walking_asymmetry_percentage__'],                     label: 'Walk Asymmetry', unit: '%',          dp: 1, mode: 'latest' },
      { keys: ['walking_double_support_percentage__'],                label: 'Double Support', unit: '%',          dp: 1, mode: 'latest' },
      { keys: ['walking_heart_rate_average_countmin'],                label: 'Walking HR',     unit: 'bpm',        dp: 0, mode: 'latest' },
      { keys: ['running_speed_mihr'],                                 label: 'Running Speed',  unit: 'mph',        dp: 2, mode: 'latest' },
      { keys: ['running_power_w'],                                    label: 'Running Power',  unit: 'W',          dp: 0, mode: 'latest' },
      { keys: ['running_stride_length_m'],                            label: 'Stride Length',  unit: 'm',          dp: 2, mode: 'latest' },
      { keys: ['running_ground_contact_time_ms'],                     label: 'Ground Contact', unit: 'ms',         dp: 0, mode: 'latest' },
      { keys: ['running_vertical_oscillation_cm'],                    label: 'Vert. Oscillation', unit: 'cm',     dp: 1, mode: 'latest' },
      { keys: ['cycling_distance_mi'],                                label: 'Cycling Distance',unit: 'mi',        dp: 2, mode: 'latest' },
      { keys: ['cycling_speed_mihr'],                                 label: 'Cycling Speed',  unit: 'mph',        dp: 1, mode: 'latest' },
      { keys: ['cycling_power_w'],                                    label: 'Cycling Power',  unit: 'W',          dp: 0, mode: 'latest' },
      { keys: ['cycling_cadence_countmin'],                           label: 'Cycling Cadence',unit: 'rpm',        dp: 0, mode: 'latest' },
      { keys: ['stair_speed__down_fts'],                              label: 'Stair Speed Down',unit: 'ft/s',      dp: 2, mode: 'latest' },
      { keys: ['stair_speed__up_fts'],                                label: 'Stair Speed Up', unit: 'ft/s',       dp: 2, mode: 'latest' },
      { keys: ['six_minute_walking_test_distance_m'],                 label: '6-Min Walk Test',unit: 'm',          dp: 0, mode: 'latest' },
      { keys: ['time_in_daylight_min'],                               label: 'Time in Daylight',unit: 'min',       dp: 0, mode: 'latest' },
      { keys: ['mindful_minutes_min'],                                label: 'Mindful Minutes',unit: 'min',        dp: 0, mode: 'latest' },
      { keys: ['handwashing_s'],                                      label: 'Handwashing',    unit: 's',          dp: 0, mode: 'latest' },
      { keys: ['toothbrushing_s'],                                    label: 'Toothbrushing',  unit: 's',          dp: 0, mode: 'latest' },
      { keys: ['environmental_audio_exposure_dbaspl'],                label: 'Env. Audio',     unit: 'dB',         dp: 0, mode: 'latest' },
      { keys: ['headphone_audio_exposure_dbaspl'],                    label: 'Headphone Audio',unit: 'dB',         dp: 0, mode: 'latest' },
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    defaultOpen: true,
    metrics: [
      { keys: ['sleep_analysis_total_sleep_hr'],   label: 'Total Sleep',     unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_asleep_hr'],        label: 'Asleep',          unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_in_bed_hr'],        label: 'In Bed',          unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_quality_hr'],       label: 'Sleep Quality',   unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_efficiency_percent'],        label: 'Efficiency',      unit: '%',    dp: 1, mode: 'avg' },
      { keys: ['fell_asleep_in_hr'],               label: 'Fell Asleep In',  unit: 'hr',   dp: 2, mode: 'avg' },
      { keys: ['sleep_sessions_count'],            label: 'Sessions',        unit: '',     dp: 0, mode: 'avg' },
      { keys: ['sleep_analysis_core_hr'],          label: 'Core Sleep',      unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_rem_hr'],           label: 'REM Sleep',       unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_deep_hr'],          label: 'Deep Sleep',      unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_awake_hr'],         label: 'Awake (sleep)',   unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_heart_rate_bpm'],            label: 'Sleep HR',        unit: 'bpm',  dp: 0, mode: 'avg' },
      { keys: ['waking_heart_rate_bpm'],           label: 'Waking HR',       unit: 'bpm',  dp: 0, mode: 'avg' },
      { keys: ['heart_rate_variability_ms'],       label: 'HRV',             unit: 'ms',   dp: 0, mode: 'avg' },
      { keys: ['sleep_hrv_ms'],                    label: 'Sleep HRV',       unit: 'ms',   dp: 0, mode: 'avg' },
      { keys: ['blood_oxygen_saturation__'],       label: 'Blood O\u2082',   unit: '%',    dp: 1, mode: 'avg' },
      { keys: ['respiratory_rate_countmin'],       label: 'Resp. Rate',      unit: '/min', dp: 1, mode: 'avg' },
      { keys: ['breathing_disturbances_count'],    label: 'Breathing Dist.', unit: '',     dp: 0, mode: 'avg' },
      { keys: ['sleeping_wrist_temperature_degf'], label: 'Wrist Temp',      unit: '\u00b0F', dp: 1, mode: 'avg' },
    ],
  },
  {
    id: 'supplements',
    title: 'Supplements \u0026 Amino Acids',
    defaultOpen: true,
    metrics: [
      // ── Amino Acids ───────────────────────────────────────────────────────
      { keys: ['creatine_g'],             label: 'Creatine',          unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['l_glutamine_mg'],         label: 'L-Glutamine',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_arginine_mg'],          label: 'L-Arginine',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_lysine_mg'],            label: 'L-Lysine',          unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_leucine_mg'],           label: 'L-Leucine',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_isoleucine_mg'],        label: 'L-Isoleucine',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_valine_mg'],            label: 'L-Valine',          unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['bcaa_mg'],                label: 'BCAAs',             unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_tryptophan_mg'],        label: 'L-Tryptophan',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_tyrosine_mg'],          label: 'L-Tyrosine',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_phenylalanine_mg'],     label: 'L-Phenylalanine',   unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_methionine_mg'],        label: 'L-Methionine',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_threonine_mg'],         label: 'L-Threonine',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_histidine_mg'],         label: 'L-Histidine',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['nac_mg'],                 label: 'NAC',               unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_cysteine_mg'],          label: 'L-Cysteine',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_carnitine_mg'],         label: 'L-Carnitine',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_citrulline_mg'],        label: 'L-Citrulline',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['l_theanine_mg'],          label: 'L-Theanine',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['beta_alanine_mg'],        label: 'Beta-Alanine',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['taurine_mg'],             label: 'Taurine',           unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['glycine_mg'],             label: 'Glycine',           unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['gaba_mg'],                label: 'GABA',              unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['five_htp_mg'],            label: '5-HTP',             unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Performance / Longevity ───────────────────────────────────────────
      { keys: ['coq10_mg'],               label: 'CoQ10',             unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['omega_3_mg'],             label: 'Omega-3',           unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['epa_mg'],                 label: 'EPA',               unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['dha_mg'],                 label: 'DHA',               unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['alpha_lipoic_acid_mg'],   label: 'Alpha Lipoic Acid', unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['ashwagandha_mg'],         label: 'Ashwagandha',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['curcumin_mg'],            label: 'Curcumin',          unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['resveratrol_mg'],         label: 'Resveratrol',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['quercetin_mg'],           label: 'Quercetin',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['berberine_mg'],           label: 'Berberine',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['inositol_mg'],            label: 'Inositol',          unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Sleep / Mood ─────────────────────────────────────────────────────
      { keys: ['melatonin_mg'],           label: 'Melatonin',         unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['valerian_mg'],            label: 'Valerian',          unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Joint / Structural ───────────────────────────────────────────────
      { keys: ['collagen_g'],             label: 'Collagen',          unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['glucosamine_mg'],         label: 'Glucosamine',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['chondroitin_mg'],         label: 'Chondroitin',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['hyaluronic_acid_mg'],     label: 'Hyaluronic Acid',   unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Botanicals / Herbs ───────────────────────────────────────────────
      { keys: ['silymarin_mg'],           label: 'Milk Thistle',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['elderberry_mg'],          label: 'Elderberry',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['ginseng_mg'],             label: 'Ginseng',           unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['maca_mg'],                label: 'Maca',              unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['echinacea_mg'],           label: 'Echinacea',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['st_johns_wort_mg'],       label: "St. John's Wort",   unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['saw_palmetto_mg'],        label: 'Saw Palmetto',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['dhea_mg'],                label: 'DHEA',              unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Algae / Antioxidants ─────────────────────────────────────────────
      { keys: ['spirulina_mg'],           label: 'Spirulina',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['chlorella_mg'],           label: 'Chlorella',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['green_tea_extract_mg'],   label: 'Green Tea Extract', unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['pycnogenol_mg'],          label: 'Pycnogenol',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['lycopene_mg'],            label: 'Lycopene',          unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['lutein_mg'],              label: 'Lutein',            unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['astaxanthin_mg'],         label: 'Astaxanthin',       unit: 'mg',   dp: 1, mode: 'avg' },
      { keys: ['phosphatidylserine_mg'],  label: 'Phosphatidylserine',unit: 'mg',   dp: 0, mode: 'avg' },
      // ── Mushrooms ────────────────────────────────────────────────────────
      { keys: ['lions_mane_mg'],          label: "Lion's Mane",       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['reishi_mg'],              label: 'Reishi',            unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['cordyceps_mg'],           label: 'Cordyceps',         unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['chaga_mg'],               label: 'Chaga',             unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['turkey_tail_mg'],         label: 'Turkey Tail',       unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['shilajit_mg'],            label: 'Shilajit',          unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['probiotics_bcfu'],        label: 'Probiotics',        unit: 'B CFU',dp: 1, mode: 'avg' },
    ],
  },
];

const MOOD_LABEL = { 1: 'Very Bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
const MOOD_COLOR = { 1: '#c0392b', 2: '#e67e22', 3: '#f1c40f', 4: '#27ae60', 5: '#2ecc71' };
const PERIOD_LABEL = { today: 'Today', week: 'Last 7 days', two_weeks: 'Last 14 days', month: 'Last 30 days', ninety: 'Last 90 days', custom: 'Custom' };

function groupFoodLog(entries) {
  const byDate = {};
  entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = {};
    const mealKey = (e.meal || '').trim() || 'Other';
    if (!byDate[e.date][mealKey]) byDate[e.date][mealKey] = [];
    byDate[e.date][mealKey].push(e);
  });
  return Object.keys(byDate).sort().reverse().map(date => ({
    date,
    meals: Object.entries(byDate[date]).map(([meal, items]) => ({ meal, items })),
  }));
}

function groupMedications(entries) {
  const byDate = {};
  entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  return Object.keys(byDate).sort().reverse().map(date => ({
    date,
    items: byDate[date].sort((a, b) => String(a.taken_at || '') > String(b.taken_at || '') ? 1 : -1),
  }));
}

function fmt(v, dp) {
  if (v === null || !Number.isFinite(v)) return null;
  return dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp);
}

function localDateStr(isoStr) {
  const s = String(isoStr).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="share-group">
      <button className="share-group-header" onClick={() => setOpen(o => !o)}>
        <span className="share-group-title">{title}</span>
        {badge != null && <span className="share-group-badge">{badge}</span>}
        <span className="share-group-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="share-group-body">{children}</div>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
function SharePage() {
  const { shareToken } = useParams();
  const [phase,      setPhase]      = useState('loading');
  const [meta,       setMeta]       = useState(null);
  const [passcode,   setPasscode]   = useState('');
  const [healthInfo, setHealthInfo] = useState(null);
  const [errMsg,     setErrMsg]     = useState('');
  const [unlocking,  setUnlocking]  = useState(false);
  const [activeTab,  setActiveTab]  = useState('vitals');
  const [showJournal, setShowJournal] = useState(false);
  const [showFoodNotes, setShowFoodNotes] = useState(true);
  const [shareJwt,    setShareJwt]    = useState(null);
  const [activePeriod, setActivePeriod] = useState('week');
  const [periodLoading, setPeriodLoading] = useState(false);
  const [sleepOpenCards, setSleepOpenCards] = useState(new Set());
  const [vitalsExpanded, setVitalsExpanded] = useState({});
  const [vitalsCardOpen, setVitalsCardOpen] = useState(null);

  const toggleSleepCard = useCallback((date) => {
    setSleepOpenCards(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }, []);

  const setSleepAllOpen = useCallback((open) => {
    if (open && healthInfo) {
      // expand all valid sleep nights
      const maps   = buildMaps(healthInfo.data || []);
      const dates  = (healthInfo.data || []).map(r => String(r.timestamp || '').slice(0, 10)).filter(Boolean);
      const unique = [...new Set(dates)].filter(d => maps['sleep_analysis_total_sleep_hr']?.[d] != null);
      setSleepOpenCards(new Set(unique));
    } else {
      setSleepOpenCards(new Set());
    }
  }, [healthInfo]);

  useEffect(() => {
    authFetch(`${API_BASE}/api/share/${shareToken}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrMsg(d.error); setPhase('error'); return; }
        setMeta(d);
        if (!d.has_passcode) doUnlock('', true);
        else setPhase('passcode');
      })
      .catch(() => { setErrMsg('Could not reach server.'); setPhase('error'); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken]);

  const fetchData = async (jwt, period = 'week') => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const url = `${API_BASE}/api/share/${shareToken}/data?period=${encodeURIComponent(period)}&today=${today}`;
    const dr = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
    const dd = await dr.json();
    if (!dr.ok) { setErrMsg(dd.error || 'Failed to load data.'); return false; }
    setHealthInfo(dd);
    setActivePeriod(dd.export_period || period);
    return true;
  };

  const doUnlock = async (code, autoUnlock = false) => {
    setUnlocking(true); setErrMsg('');
    try {
      const res = await authFetch(`${API_BASE}/api/share/${shareToken}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      });
      const d = await res.json();
      if (!res.ok) {
        // If auto-unlock fails (no passcode set but something went wrong), show error
        if (autoUnlock) { setErrMsg(d.error || 'Could not load data.'); setPhase('error'); }
        else { setErrMsg(d.error || 'Incorrect passcode.'); }
        setUnlocking(false); return;
      }
      setShareJwt(d.token);
      const ok = await fetchData(d.token, 'week');
      if (ok) setPhase('data');
    } catch {
      setErrMsg('Error loading data.');
    } finally {
      setUnlocking(false);
    }
  };

  const changePeriod = async (period) => {
    if (!shareJwt) return;
    setPeriodLoading(true);
    await fetchData(shareJwt, period);
    setPeriodLoading(false);
  };

  // ── Vitals chart computation (must be before early returns for Rules of Hooks) ──
  const mapsEarly = useMemo(() => buildMaps(healthInfo?.data || []), [healthInfo]);

  const vitalsMetrics = useMemo(() => {
    const rawData = healthInfo?.data || [];
    // Build key set for all vitals keys + altKeys
    const allKeys = new Set();
    SHARE_VITALS.forEach(m => { allKeys.add(m.key); (m.altKeys || []).forEach(k => allKeys.add(k)); });

    // Split: auto health → daily averages, iHealth → individual readings
    const autoByType = {};   // { [ct]: { [day]: { sum, count } } }
    const ihByType = {};     // { [ct]: [{ ts, dt, day, v }] }
    rawData.forEach(r => {
      const ct = canonical(r.type);
      if (!allKeys.has(ct)) return;
      const v = toNum(r.value);
      if (!Number.isFinite(v)) return;
      const day = toLocalDate(r.timestamp);
      if (!day) return;
      if (getSource(r) === 'ihealth_csv') {
        const dt = toLocalDateTime(r.timestamp);
        if (!dt) return;
        if (!ihByType[ct]) ihByType[ct] = [];
        ihByType[ct].push({ ts: r.timestamp, dt, day, v });
      } else {
        if (!autoByType[ct]) autoByType[ct] = {};
        if (!autoByType[ct][day]) autoByType[ct][day] = { sum: 0, count: 0 };
        autoByType[ct][day].sum += v;
        autoByType[ct][day].count += 1;
      }
    });
    for (const arr of Object.values(ihByType)) arr.sort((a, b) => a.ts.localeCompare(b.ts));

    return SHARE_VITALS.map(m => {
      const autoData = autoByType[m.key] || (m.altKeys ? m.altKeys.reduce((f, k) => f || autoByType[k], null) : null);
      const ihData = ihByType[m.key] || (m.altKeys ? m.altKeys.reduce((f, k) => f || ihByType[k], null) : null);
      if (!autoData && (!ihData || !ihData.length)) return null;

      // Auto: daily averages
      const autoReadings = [];
      if (autoData) {
        for (const [day, { sum, count }] of Object.entries(autoData))
          autoReadings.push({ day, v: Math.round((sum / count) * 100) / 100 });
        autoReadings.sort((a, b) => a.day.localeCompare(b.day));
      }
      const ihReadings = ihData || [];

      const allVals = [...autoReadings.map(r => r.v), ...ihReadings.map(r => r.v)];
      if (!allVals.length) return null;
      const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);

      const lastA = autoReadings.length ? autoReadings[autoReadings.length - 1] : null;
      const lastI = ihReadings.length ? ihReadings[ihReadings.length - 1] : null;
      const ihMoreRecent = lastI && (!lastA || lastI.ts > lastA.day + 'T23:59:59');
      const latest = ihMoreRecent ? lastI.v : lastA ? lastA.v : lastI.v;
      const latestDay = ihMoreRecent ? lastI.dt : lastA ? lastA.day : lastI.dt;

      let unit = m.unit;
      if (m.key === 'weight_lb' && !autoByType['weight_lb'] && autoByType['weight_kg']) unit = 'kg';

      // Unified chart: auto → v, iHealth → vIh
      const pts = [];
      autoReadings.forEach(r => pts.push({ sortKey: r.day, day: r.day, v: r.v }));
      ihReadings.forEach(r => pts.push({ sortKey: r.ts, day: r.dt, vIh: Math.round(r.v * 100) / 100 }));
      pts.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const chart = pts.map(({ sortKey, ...rest }) => rest);

      // dayMaps for graph groups
      const dayMap = {};
      autoReadings.forEach(r => { dayMap[r.day] = r.v; });
      const dayMapIh = {};
      ihReadings.forEach(r => { dayMapIh[r.dt] = r.v; });

      return {
        ...m, unit, dayMap, dayMapIh, chart, avg, min, max,
        latest, latestDay, count: allVals.length,
        hasAuto: autoReadings.length > 0, hasIh: ihReadings.length > 0,
      };
    }).filter(Boolean);
  }, [healthInfo]);

  const vitalsGraphs = useMemo(() => {
    if (!vitalsMetrics.length) return [];
    return SHARE_GRAPH_GROUPS.map(g => {
      const resolved = g.keys.map(k => vitalsMetrics.find(x => x.key === k) || null);
      if (resolved.every(r => !r)) return null;
      // Collect all time points: dates (auto) + datetimes (iHealth)
      const allTimes = new Set();
      resolved.forEach(m => {
        if (m) {
          Object.keys(m.dayMap).forEach(d => allTimes.add(d));
          Object.keys(m.dayMapIh).forEach(d => allTimes.add(d));
        }
      });
      const sorted = [...allTimes].sort();
      if (!sorted.length) return null;
      const chartData = sorted.map(dt => {
        const pt = { day: dt.length > 10 ? dt.slice(5) : dt.slice(5) };
        resolved.forEach((m, i) => {
          if (m) {
            if (m.dayMap[dt] !== undefined) pt[`v${i}`] = Math.round(m.dayMap[dt] * 100) / 100;
            if (m.dayMapIh[dt] !== undefined) pt[`v${i}Ih`] = Math.round(m.dayMapIh[dt] * 100) / 100;
          }
        });
        return pt;
      });
      const legends = resolved.map((m, i) => {
        if (!m) return null;
        return { label: g.labels[i], color: m.color, min: m.min, max: m.max, dp: m.dp, hasIh: m.hasIh };
      }).filter(Boolean);
      return { ...g, chartData, legends, resolvedMetrics: resolved.filter(Boolean) };
    }).filter(Boolean);
  }, [vitalsMetrics]);

  const toggleVitalsGraph = id => setVitalsExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (phase === 'loading') return (
    <div className="share-page share-page--centered">
      <div className="share-spinner"><div className="share-spinner-ring" /><span>Loading\u2026</span></div>
    </div>
  );

  if (phase === 'error') return (
    <div className="share-page share-page--centered">
      <div className="share-not-found">
        <div className="share-unlock-icon">🔗</div>
        <div className="share-logo-mark">ArfidWatch</div>
        <p>{errMsg || 'This share link is invalid or has been removed.'}</p>
      </div>
    </div>
  );

  if (phase === 'passcode') return (
    <div className="share-page share-page--centered">
      <div className="share-unlock-card">
        <div className="share-unlock-icon">🔒</div>
        <div className="share-logo-mark">ArfidWatch</div>
        <h2>Private Health Summary</h2>
        <p className="share-unlock-sub">
          <strong>{meta?.username}</strong> has shared their health data with you.
          Enter the passcode to continue.
        </p>
        {errMsg && <p className="share-error">{errMsg}</p>}
        <input
          type="password"
          className="share-passcode-input"
          placeholder="Passcode"
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doUnlock(passcode)}
          autoFocus
        />
        <button className="share-unlock-btn" onClick={() => doUnlock(passcode)} disabled={unlocking}>
          {unlocking ? 'Verifying\u2026' : 'Unlock'}
        </button>
      </div>
    </div>
  );

  // ── Data view ────────────────────────────────────────────────────────────────
  const maps         = mapsEarly;
  const journal      = healthInfo?.journal || [];
  const foodLog      = healthInfo?.food_log || [];
  const medications  = healthInfo?.medications || [];
  const periodLabel  = PERIOD_LABEL[healthInfo?.export_period] || healthInfo?.export_period;

  // Total days in the view period — used for zero-filled calorie/macro rolling averages
  const periodDays = (() => {
    const s = healthInfo?.start;
    const e = healthInfo?.end;
    if (!s || !e) return null;
    const diff = (new Date(e) - new Date(s)) / (1000 * 60 * 60 * 24);
    return Math.round(diff) + 1;
  })();

  // All YYYY-MM-DD dates in the period, most-recent-first
  const allPeriodDates = (() => {
    if (!healthInfo?.start || !healthInfo?.end) return [];
    const dates = [];
    const cur = new Date(healthInfo.start + 'T00:00:00');
    const end = new Date(healthInfo.end   + 'T00:00:00');
    while (cur <= end) {
      dates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
      cur.setDate(cur.getDate() + 1);
    }
    return dates.reverse();
  })();

  // Build daily macro data — zero-fill every day in the period
  const macroDays = allPeriodDates.map(date => ({
    date,
    empty: !maps['dietary_energy_kcal']?.[date] && !maps['protein_g']?.[date] && !maps['carbohydrates_g']?.[date] && !maps['total_fat_g']?.[date],
    kcal:    maps['dietary_energy_kcal']?.[date] ?? 0,
    protein: maps['protein_g']?.[date]           ?? 0,
    carbs:   maps['carbohydrates_g']?.[date]     ?? 0,
    fat:     maps['total_fat_g']?.[date]         ?? 0,
  }));

  const dayBar = (d) => {
    const p = (d.protein || 0) * 4;
    const c = (d.carbs || 0) * 4;
    const f = (d.fat || 0) * 9;
    const tot = p + c + f;
    if (!tot) return null;
    return { p: Math.round(p / tot * 100), c: Math.round(c / tot * 100), f: Math.round(f / tot * 100) };
  };

  // Build daily sleep data from health maps
  const SLEEP_KEYS = [
    'sleep_analysis_total_sleep_hr', 'sleep_analysis_asleep_hr',
    'sleep_analysis_in_bed_hr', 'sleep_analysis_core_hr',
    'sleep_analysis_rem_hr', 'sleep_analysis_deep_hr',
    'sleep_analysis_awake_hr', 'sleep_analysis_quality_hr',
    'sleep_efficiency_percent', 'fell_asleep_in_hr', 'sleep_sessions_count',
    'sleep_heart_rate_bpm', 'waking_heart_rate_bpm',
    'heart_rate_variability_ms', 'sleep_hrv_ms',
    'blood_oxygen_saturation__', 'blood_oxygen_min__', 'blood_oxygen_max__',
    'respiratory_rate_countmin', 'breathing_disturbances_count',
    'sleeping_wrist_temperature_degf',
  ];
  const sleepDays = allPeriodDates.map(date => ({
      empty: !SLEEP_KEYS.some(k => maps[k]?.[date] != null),
      date,
      total:        maps['sleep_analysis_total_sleep_hr']?.[date],
      asleep:       maps['sleep_analysis_asleep_hr']?.[date],
      inBed:        maps['sleep_analysis_in_bed_hr']?.[date],
      core:         maps['sleep_analysis_core_hr']?.[date],
      rem:          maps['sleep_analysis_rem_hr']?.[date],
      deep:         maps['sleep_analysis_deep_hr']?.[date],
      awake:        maps['sleep_analysis_awake_hr']?.[date],
      quality:      maps['sleep_analysis_quality_hr']?.[date],
      efficiency:   maps['sleep_efficiency_percent']?.[date],
      fellAsleepIn: maps['fell_asleep_in_hr']?.[date],
      sessions:     maps['sleep_sessions_count']?.[date],
      sleepHR:      maps['sleep_heart_rate_bpm']?.[date],
      wakingHR:     maps['waking_heart_rate_bpm']?.[date],
      hrv:          maps['heart_rate_variability_ms']?.[date],
      sleepHRV:     maps['sleep_hrv_ms']?.[date],
      spo2:         maps['blood_oxygen_saturation__']?.[date],
      minSpo2:      maps['blood_oxygen_min__']?.[date],
      respRate:     maps['respiratory_rate_countmin']?.[date],
      breathDist:   maps['breathing_disturbances_count']?.[date],
      wristTemp:    maps['sleeping_wrist_temperature_degf']?.[date],
  }));

  const sleepStageBar = (d) => {
    const c = d.core || 0;
    const r = d.rem || 0;
    const dp = d.deep || 0;
    const a = d.awake || 0;
    const tot = c + r + dp + a;
    if (!tot) return null;
    return {
      core: Math.round(c / tot * 100),
      rem:  Math.round(r / tot * 100),
      deep: Math.round(dp / tot * 100),
      awake: Math.round(a / tot * 100),
    };
  };

  // Helper to render a metric section
  const renderMetricSection = (section) => {
    const rows = section.metrics
      .map(m => {
        const map  = pick(maps, ...m.keys);
        const v    = map ? (m.mode === 'latest' ? latestOf(map) : avgOf(map)) : null;
        const days = map ? countOf(map) : 0;
        const lo   = map ? minOf(map) : null;
        const hi   = map ? maxOf(map) : null;
        const hasData = v !== null && Number.isFinite(v);
        return { ...m, v: hasData ? v : null, days, lo, hi, hasData };
      })
      .filter((r, i, arr) => arr.findIndex(x => x.label === r.label) === i)
      .filter(r => r.hasData);

    if (rows.length === 0) return null;

    return (
      <Section key={section.id} title={section.title} badge={rows.length} defaultOpen={section.defaultOpen}>
        <div className="share-metrics">
          {rows.map(row => (
            <div key={row.label + row.unit} className="share-metric-row">
              <span className="share-metric-name">{row.label}</span>
              <span className="share-metric-right">
                <span className="share-metric-value">{fmt(row.v, row.dp)}{row.unit && <span className="share-metric-unit"> {row.unit}</span>}</span>
                <span className="share-metric-range">
                  {row.mode === 'avg'
                    ? (row.days > 1 && row.lo !== null && row.hi !== null
                        ? `${fmt(row.lo, row.dp)}\u2013${fmt(row.hi, row.dp)} ${row.unit} \u00b7 ${row.days}d`
                        : `avg \u00b7 ${row.days}d`)
                    : 'latest'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Section>
    );
  };

  return (
    <div className="share-page">
      <div className="share-header">
        <div className="share-header-inner">
          <span className="share-logo">ArfidWatch</span>
          <span className="share-tagline">Read-only health summary</span>
        </div>
      </div>

      <div className="share-body">
        {/* Patient card */}
        <div className="share-patient-card">
          <div className="share-patient-top">
            <div className="share-patient-name">{healthInfo.username}</div>
            {(() => {
              const wMap = pick(maps, 'weight_lb', 'weight_kg');
              if (!wMap) return null;
              const w = latestOf(wMap);
              if (w == null || !Number.isFinite(w)) return null;
              const isKg = !maps['weight_lb'] && maps['weight_kg'];
              return <div className="share-patient-weight">{w.toFixed(1)} {isKg ? 'kg' : 'lb'}</div>;
            })()}
            {(() => {
              const hMap = pick(maps, 'height_cm', 'height_in');
              if (!hMap) return null;
              const h = latestOf(hMap);
              if (h == null || !Number.isFinite(h)) return null;
              const isIn = !maps['height_cm'] && maps['height_in'];
              return <div className="share-patient-weight" style={{ marginLeft: 8 }}>{isIn ? `${h.toFixed(1)} in` : `${Math.round(h)} cm`}</div>;
            })()}
          </div>
          {/* Period selector — shown if user hasn't locked it */}
          {!healthInfo.period_locked ? (
            <div className="share-period-row">
              {['week', 'two_weeks', 'month', 'ninety'].map(p => (
                <button
                  key={p}
                  className={`share-period-btn${activePeriod === p ? ' share-period-btn--active' : ''}`}
                  onClick={() => changePeriod(p)}
                  disabled={periodLoading}
                >
                  {p === 'week' ? '1 week' : p === 'two_weeks' ? '2 weeks' : p === 'month' ? '30 days' : '90 days'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="share-period">
            {periodLoading ? 'Loading\u2026' : <>Rolling avg&nbsp;&middot;&nbsp;{periodLabel}&nbsp;&middot;&nbsp;{healthInfo.start}&nbsp;&ndash;&nbsp;{healthInfo.end}</>}
          </div>
          {(() => {
            const avgCals    = avgOfPeriod(maps['dietary_energy_kcal'], periodDays);
            const avgProtein = avgOfPeriod(maps['protein_g'], periodDays);
            const avgCarbs   = avgOfPeriod(maps['carbohydrates_g'], periodDays);
            const avgFat     = avgOfPeriod(maps['total_fat_g'], periodDays);
            if (avgCals == null && avgProtein == null && avgCarbs == null && avgFat == null) return null;
            return (
              <div className="share-patient-macros">
                {avgCals != null && <span className="share-pm-chip"><strong>{Math.round(avgCals).toLocaleString()}</strong> kcal</span>}
                {avgProtein != null && <span className="share-pm-chip share-pm--p"><strong>{avgProtein.toFixed(1)}g</strong> P</span>}
                {avgCarbs != null && <span className="share-pm-chip share-pm--c"><strong>{avgCarbs.toFixed(1)}g</strong> C</span>}
                {avgFat != null && <span className="share-pm-chip share-pm--f"><strong>{avgFat.toFixed(1)}g</strong> F</span>}
              </div>
            );
          })()}
          {(() => {
            const rhr    = avgOf(maps['resting_heart_rate_countmin']);
            const bpSys  = avgOf(maps['blood_pressure_systolic_mmhg']);
            const bpDia  = avgOf(maps['blood_pressure_diastolic_mmhg']);
            const hrv    = avgOf(maps['heart_rate_variability_ms']);
            if (rhr == null && bpSys == null && hrv == null) return null;
            return (
              <div className="share-patient-macros share-patient-vitals">
                {rhr != null && <span className="share-pm-chip share-pm--hr"><strong>{Math.round(rhr)}</strong> bpm rHR</span>}
                {bpSys != null && bpDia != null && <span className="share-pm-chip share-pm--bp"><strong>{Math.round(bpSys)}/{Math.round(bpDia)}</strong> mmHg</span>}
                {hrv != null && <span className="share-pm-chip share-pm--hrv"><strong>{hrv.toFixed(1)}</strong> ms HRV</span>}
              </div>
            );
          })()}
        </div>

        {/* Tabs */}
        <div className="share-tabs-scroll">
        <div className="share-tabs">
          <button
            className={`share-tab${activeTab === 'vitals' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('vitals')}
          >Vitals</button>
          <button
            className={`share-tab${activeTab === 'daily' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >Daily Macros{macroDays.length > 0 ? ` (${macroDays.length})` : ''}</button>
          <button
            className={`share-tab${activeTab === 'sleep' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('sleep')}
          >Sleep{sleepDays.length > 0 ? ` (${sleepDays.length})` : ''}</button>
          <button
            className={`share-tab${activeTab === 'log' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('log')}
          >Food Log</button>
          {healthInfo.share_medications && (
            <button
              className={`share-tab${activeTab === 'meds' ? ' share-tab--active' : ''}`}
              onClick={() => setActiveTab('meds')}
            >Medications{medications.length > 0 ? ` (${medications.length})` : ''}</button>
          )}
          <button
            className={`share-tab${activeTab === 'overview' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >Extra Stats</button>
        </div>
        </div>

        {activeTab === 'vitals' && <>
          {vitalsMetrics.length === 0 && <p className="share-empty">No vitals data for this period.</p>}
          {vitalsMetrics.length > 0 && <>
            {/* Graph tiles */}
            <div className="sv-graphs-grid">
              {vitalsGraphs.map(g => {
                const isOpen = !!vitalsExpanded[g.id];
                return (
                  <div key={g.id} className={`sv-graph-tile${isOpen ? ' sv-graph-tile--expanded' : ''}`}
                       onClick={() => !isOpen && toggleVitalsGraph(g.id)}>
                    <div className="sv-graph-head" onClick={isOpen ? () => toggleVitalsGraph(g.id) : undefined}>
                      <span className="sv-graph-title">{g.title} <small className="sv-graph-unit">{g.unit}</small></span>
                      <span className="sv-graph-legend">
                        {g.legends.map((l, i) => (
                          <span key={i} className="sv-graph-legend-item">
                            <span className="sv-graph-dot" style={{ background: l.color }} />
                            {l.label} {l.dp === 0 ? Math.round(l.min) : l.min.toFixed(l.dp)}–{l.dp === 0 ? Math.round(l.max) : l.max.toFixed(l.dp)}
                          </span>
                        ))}
                      </span>
                    </div>
                    {!isOpen && (
                      <div className="sv-graph-mini">
                        <ResponsiveContainer width="100%" height={60}>
                          <LineChart data={g.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                            {g.resolvedMetrics.map((m, i) => {
                              const ki = g.keys.indexOf(m.key);
                              return (
                                <React.Fragment key={m.key}>
                                  <Line type="monotone" dataKey={`v${ki}`}
                                    stroke={m.color} strokeWidth={1.5} dot={false}
                                    name={g.labels[ki] || m.label} connectNulls />
                                  {m.hasIh && (
                                    <Line type="monotone" dataKey={`v${ki}Ih`}
                                      stroke={lightenHex(m.color)} strokeWidth={1} strokeDasharray="3 2"
                                      dot={false} name={`${g.labels[ki]} (Individual)`}
                                      connectNulls={false} />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {isOpen && (
                      <div className="sv-graph-body">
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={g.chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={38} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} />
                            {g.resolvedMetrics.map((m, i) => {
                              const ki = g.keys.indexOf(m.key);
                              return (
                                <React.Fragment key={m.key}>
                                  <Line type="monotone" dataKey={`v${ki}`}
                                    stroke={m.color} strokeWidth={2}
                                    dot={{ r: g.chartData.length < 30 ? 3 : 0, fill: m.color }}
                                    name={m.hasIh ? `${g.labels[ki]} (Daily Avg)` : (g.labels[ki] || m.label)} connectNulls />
                                  {m.hasIh && (
                                    <Line type="monotone" dataKey={`v${ki}Ih`}
                                      stroke={lightenHex(m.color)} strokeWidth={1.5} strokeDasharray="5 3"
                                      dot={{ r: 4, fill: lightenHex(m.color), stroke: '#fff', strokeWidth: 1 }}
                                      name={`${g.labels[ki]} (Individual)`}
                                      connectNulls={false} />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Stat cards */}
            <div className="sv-cards">
              {vitalsMetrics.map(m => {
                const isCardOpen = vitalsCardOpen === m.key;
                return (
                  <div key={m.key} className={`sv-stat-card${isCardOpen ? ' sv-stat-card--expanded' : ''}`}
                       style={{ borderLeftColor: m.color }}
                       onClick={() => setVitalsCardOpen(isCardOpen ? null : m.key)}>
                    <div className="sv-stat-label">{m.label}</div>
                    <div className="sv-stat-row">
                      <span className="sv-stat-latest">{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)} <small>{m.unit}</small></span>
                      <span className="sv-stat-range">
                        {m.dp === 0 ? Math.round(m.min) : m.min.toFixed(m.dp)}–{m.dp === 0 ? Math.round(m.max) : m.max.toFixed(m.dp)} · avg {m.dp === 0 ? Math.round(m.avg) : m.avg.toFixed(m.dp)} · {m.count}
                      </span>
                    </div>
                    {isCardOpen && (
                      <div className="sv-stat-chart">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={m.chart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" tickFormatter={d => d.length > 10 ? d.slice(6) : d.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={38} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} />
                            <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={2}
                              dot={{ r: m.chart.filter(p => p.v != null).length < 30 ? 3 : 0, fill: m.color }}
                              name={m.hasIh ? `${m.label} (Daily Avg)` : m.label} connectNulls />
                            {m.hasIh && (
                              <Line type="monotone" dataKey="vIh" stroke={lightenHex(m.color)} strokeWidth={1.5}
                                strokeDasharray="5 3"
                                dot={{ r: 4, fill: lightenHex(m.color), stroke: '#fff', strokeWidth: 1 }}
                                name={`${m.label} (Individual)`} connectNulls={false} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>}
        </>}

        {activeTab === 'overview' && <>
        {SECTIONS.filter(s => s.id !== 'sleep').map(s => renderMetricSection(s))}
        </>}

        {activeTab === 'log' && (() => {
          // Build a unified day-keyed map — always include every day in the period
          const logAllDays = new Set([
            ...allPeriodDates,
            ...foodLog.map(e => e.date),
            ...(showJournal ? journal.map(e => e.date) : []),
          ]);

          const foodByDate = {};
          groupFoodLog(foodLog).forEach(g => { foodByDate[g.date] = g.meals; });

          const journalByDate = {};
          journal.forEach(e => { journalByDate[e.date] = e; });

          const sortedLogDays = [...logAllDays].sort().reverse();

          if (sortedLogDays.length === 0) {
            return <p className="share-empty">No entries for this period.</p>;
          }

          return (
            <>
            <div className="share-log-controls">
              {journal.length > 0 && (
                <label className="share-toggle">
                  <span>Journal</span>
                  <span className={`share-toggle-track${showJournal ? ' share-toggle-track--on' : ''}`} onClick={() => setShowJournal(v => !v)}>
                    <span className="share-toggle-thumb" />
                  </span>
                </label>
              )}
            </div>
            <div className="share-combined-log">
              {sortedLogDays.map(date => {
                const meals   = foodByDate[date];
                const jEntry  = showJournal ? journalByDate[date] : null;
                return (
                  <div key={date} className="share-combined-day">
                    <div className="share-combined-day-header">{localDateStr(date)}</div>

                    {jEntry && (
                      <div className="share-combined-section">
                        <div className="share-combined-section-label">Journal</div>
                        <div className="share-journal-header">
                          {jEntry.mood && (
                            <span className="share-journal-mood" style={{ color: MOOD_COLOR[jEntry.mood] }}>
                              {MOOD_LABEL[jEntry.mood]}
                            </span>
                          )}
                        </div>
                        {jEntry.title && <div className="share-journal-title">{jEntry.title}</div>}
                      </div>
                    )}

                    {meals ? (
                      <div className="share-combined-section">
                        <div className="share-combined-section-label">Food Log</div>
                        {meals.map(({ meal, items }) => (
                          <div key={meal} className="share-foodlog-meal">
                            <div className="share-foodlog-meal-name">{meal}</div>
                            <div className="share-food-items">
                              {items.map((item, i) => (
                                <div key={i} className="share-food-row">
                                  <span className="share-food-name">{item.food_name}</span>
                                  <span className="share-food-right">
                                    {item.quantity && <span className="share-food-qty">{item.quantity}</span>}
                                    {item.calories != null && <span className="share-food-cals">{Math.round(item.calories)} kcal</span>}
                                    <span className="share-food-macros">
                                      {[
                                        item.protein_g != null ? `P ${Math.round(item.protein_g)}g` : null,
                                        item.carbs_g   != null ? `C ${Math.round(item.carbs_g)}g`   : null,
                                        item.fat_g     != null ? `F ${Math.round(item.fat_g)}g`     : null,
                                      ].filter(Boolean).join(' \u00b7 ')}
                                    </span>
                                  </span>
                                  {showFoodNotes && item.note && (
                                    <div className="share-food-note">{item.note}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !jEntry ? (
                      <div className="share-combined-section share-foodlog-empty-day">
                        <span>No food logged · 0 kcal</span>
                      </div>
                    ) : null}


                  </div>
                );
              })}
            </div>
            </>
          );
        })()}

        {/* ── Medications tab ── */}
        {activeTab === 'meds' && (() => {
          const medByDate = {};
          groupMedications(medications).forEach(g => { medByDate[g.date] = g.items; });
          const medDays = allPeriodDates.map(date => ({
            date,
            empty: !medByDate[date],
            items: medByDate[date] || [],
          }));
          return (
            <div className="share-daily-tab">
              <div className="share-daily-list">
                {medDays.map(day => (
                  <div key={day.date} className={`share-daily-card share-med-card${day.empty ? ' share-med-card--empty' : ''}`}>
                    <div className="share-daily-header">
                      <span className="share-daily-date">{localDateStr(day.date)}</span>
                      {!day.empty && <span className="share-med-count">{day.items.length} {day.items.length === 1 ? 'entry' : 'entries'}</span>}
                    </div>
                    {day.empty ? (
                      <div className="share-med-empty-note">No medications recorded</div>
                    ) : (
                      <div className="share-food-items">
                        {day.items.map((item, i) => (
                          <div key={i} className="share-food-row">
                            <span className="share-food-name">{item.medication_name}</span>
                            <span className="share-food-right">
                              {item.dosage && <span className="share-food-qty">{item.dosage}</span>}
                              {item.time && <span className="share-food-cals">{item.time}</span>}
                              {item.notes && <span className="share-food-macros">{item.notes}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Daily Nutrient Data tab ── */}
        {activeTab === 'daily' && (
          <div className="share-daily-tab">
            {macroDays.length === 0 ? (
              <p className="share-empty">No daily nutrient data for this period.</p>
            ) : (
              <div className="share-daily-list">
                {macroDays.map(d => {
                  const bar = dayBar(d);
                  return (
                    <div key={d.date} className="share-daily-card">
                      <div className="share-daily-header">
                        <span className="share-daily-date">{localDateStr(d.date)}</span>
                        <span className={`share-daily-cals${d.empty ? ' share-daily-cals--zero' : ''}`}>{Math.round(d.kcal).toLocaleString()} kcal</span>
                      </div>
                      <div className="share-daily-chips">
                        {[
                          { val: d.kcal,    label: 'Calories', unit: 'kcal', dp: 0 },
                          { val: d.protein,  label: 'Protein',  unit: 'g',    dp: 1 },
                          { val: d.carbs,    label: 'Carbs',    unit: 'g',    dp: 1 },
                          { val: d.fat,      label: 'Fat',      unit: 'g',    dp: 1 },
                        ].map(m => (
                          <div key={m.label} className={`share-daily-chip${d.empty ? ' share-daily-chip--zero' : ''}`}>
                            <strong>{m.dp === 0 ? Math.round(m.val).toLocaleString() : m.val.toFixed(m.dp)} {m.unit}</strong>
                            <span>{m.label}</span>
                          </div>
                        ))}
                      </div>
                      {bar && (
                        <div className="share-daily-bar-wrap">
                          <div className="share-daily-bar">
                            <div className="share-daily-bar-p" style={{ width: bar.p + '%' }} />
                            <div className="share-daily-bar-c" style={{ width: bar.c + '%' }} />
                            <div className="share-daily-bar-f" style={{ width: bar.f + '%' }} />
                          </div>
                          <span className="share-daily-bar-legend">
                            <em style={{ color: '#16a085' }}>P {bar.p}%</em>
                            <em style={{ color: '#2980b9' }}>C {bar.c}%</em>
                            <em style={{ color: '#d35400' }}>F {bar.f}%</em>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sleep' && (() => {
          const validNights = sleepDays.filter(d => !d.empty && d.total != null);
          if (validNights.length === 0) return <p className="share-empty">No sleep data for this period.</p>;

          const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

          const totals      = validNights.map(d => d.total);
          const avgTotal    = avg(totals);
          const consistency = stdDev(totals);
          const goalHits    = validNights.filter(d => d.total >= 7 && d.total <= 9).length;
          const goalRate    = Math.round(goalHits / validNights.length * 100);

          const effs        = validNights.map(d => d.efficiency).filter(v => v != null);
          const avgEff      = avg(effs);

          const spo2s       = validNights.map(d => d.spo2).filter(v => v != null);
          const avgSpo2     = avg(spo2s);
          const minSpo2s    = validNights.map(d => d.minSpo2).filter(v => v != null);
          const loSpo2      = minSpo2s.length ? Math.min(...minSpo2s) : null;

          const respRates   = validNights.map(d => d.respRate).filter(v => v != null);
          const avgRespRate = avg(respRates);

          const hrvs        = validNights.map(d => d.hrv ?? d.sleepHRV).filter(v => v != null);
          const avgHRV      = hrvs.length ? Math.round(avg(hrvs)) : null;

          const sleepHRs    = validNights.map(d => d.sleepHR).filter(v => v != null);
          const avgSleepHR  = sleepHRs.length ? Math.round(avg(sleepHRs)) : null;

          const wakingHRs   = validNights.map(d => d.wakingHR).filter(v => v != null);
          const avgWakingHR = wakingHRs.length ? Math.round(avg(wakingHRs)) : null;

          const latencies   = validNights.map(d => d.fellAsleepIn).filter(v => v != null);
          const avgLatency  = latencies.length ? Math.round(avg(latencies) * 60) : null;

          const bdists      = validNights.map(d => d.breathDist).filter(v => v != null);
          const avgBDist    = bdists.length ? Math.round(avg(bdists)) : null;
          const totalBDist  = bdists.length ? Math.round(bdists.reduce((a, b) => a + b, 0)) : null;

          const alerts = [];
          if (avgSpo2 != null && avgSpo2 < 93)
            alerts.push({ type: 'critical', msg: `Avg SpO₂ ${avgSpo2.toFixed(1)}% — evaluate for hypoxemia or sleep-disordered breathing.` });
          else if (avgSpo2 != null && avgSpo2 < 96)
            alerts.push({ type: 'warning', msg: `Avg SpO₂ ${avgSpo2.toFixed(1)}% is below optimal — consider sleep apnea screening.` });
          if (loSpo2 != null && loSpo2 < 90)
            alerts.push({ type: 'critical', msg: `SpO₂ dipped to ${loSpo2.toFixed(1)}% — possible hypoxic episodes detected.` });
          if (avgEff != null && avgEff < 75)
            alerts.push({ type: 'warning', msg: `Sleep efficiency averaged ${avgEff.toFixed(0)}% — may indicate fragmented sleep or insomnia.` });
          if (avgLatency != null && avgLatency > 30)
            alerts.push({ type: 'info', msg: `Avg sleep onset latency ${avgLatency} min — elevated; consider insomnia evaluation.` });
          if (avgBDist != null && avgBDist > 15)
            alerts.push({ type: 'warning', msg: `Avg ${avgBDist} breathing disturbances/night — warrants investigation for sleep-disordered breathing.` });
          if (avgTotal != null && avgTotal < 6)
            alerts.push({ type: 'warning', msg: `Avg sleep ${fmtSleepHr(avgTotal)} is below the recommended 7–9 hours.` });

          return (
            <>
              {/* ── Clinical Summary ── */}
              <div className="shs-summary">
                <div className="shs-summary-hdr">
                  <span className="shs-summary-title">Clinical Sleep Summary</span>
                  <span className="shs-summary-badge">{validNights.length} nights · {periodLabel}</span>
                </div>
                <div className="shs-stat-grid">
                  <div className="shs-stat">
                    <span className="shs-stat-val">{fmtSleepHr(avgTotal)}</span>
                    <span className="shs-stat-lbl">Avg Sleep</span>
                  </div>
                  <div className="shs-stat">
                    <span className="shs-stat-val">{fmtSleepHr(consistency)}</span>
                    <span className="shs-stat-lbl">Consistency</span>
                    <span className="shs-stat-hint">std dev</span>
                  </div>
                  <div className="shs-stat">
                    <span className="shs-stat-val">{goalRate}<span className="shs-stat-unit">%</span></span>
                    <span className="shs-stat-lbl">7–9h Nights</span>
                  </div>
                  {avgEff != null && (
                    <div className="shs-stat">
                      <span className={`shs-stat-val${avgEff < 75 ? ' shs-stat-val--warn' : ''}`}>
                        {avgEff.toFixed(0)}<span className="shs-stat-unit">%</span>
                      </span>
                      <span className="shs-stat-lbl">Avg Efficiency</span>
                    </div>
                  )}
                  {avgSpo2 != null && (
                    <div className="shs-stat">
                      <span className={`shs-stat-val${avgSpo2 < 96 ? ' shs-stat-val--warn' : ''}`}>
                        {avgSpo2.toFixed(1)}<span className="shs-stat-unit">%</span>
                      </span>
                      <span className="shs-stat-lbl">Avg SpO₂</span>
                    </div>
                  )}
                  {loSpo2 != null && (
                    <div className="shs-stat">
                      <span className={`shs-stat-val${loSpo2 < 90 ? ' shs-stat-val--crit' : loSpo2 < 94 ? ' shs-stat-val--warn' : ''}`}>
                        {loSpo2.toFixed(1)}<span className="shs-stat-unit">%</span>
                      </span>
                      <span className="shs-stat-lbl">Lowest SpO₂</span>
                    </div>
                  )}
                  {avgRespRate != null && (
                    <div className="shs-stat">
                      <span className="shs-stat-val">
                        {avgRespRate.toFixed(1)}<span className="shs-stat-unit">/min</span>
                      </span>
                      <span className="shs-stat-lbl">Resp. Rate</span>
                    </div>
                  )}
                  {avgHRV != null && (
                    <div className="shs-stat">
                      <span className="shs-stat-val">{avgHRV}<span className="shs-stat-unit"> ms</span></span>
                      <span className="shs-stat-lbl">Avg HRV</span>
                    </div>
                  )}
                  {avgSleepHR != null && (
                    <div className="shs-stat">
                      <span className="shs-stat-val">{avgSleepHR}<span className="shs-stat-unit"> bpm</span></span>
                      <span className="shs-stat-lbl">Sleep HR</span>
                    </div>
                  )}
                  {avgWakingHR != null && (
                    <div className="shs-stat">
                      <span className="shs-stat-val">{avgWakingHR}<span className="shs-stat-unit"> bpm</span></span>
                      <span className="shs-stat-lbl">Waking HR</span>
                    </div>
                  )}
                  {avgLatency != null && (
                    <div className="shs-stat">
                      <span className="shs-stat-val">{avgLatency}<span className="shs-stat-unit"> min</span></span>
                      <span className="shs-stat-lbl">Onset Latency</span>
                    </div>
                  )}
                  {totalBDist != null && (
                    <div className="shs-stat">
                      <span className={`shs-stat-val${avgBDist != null && avgBDist > 15 ? ' shs-stat-val--warn' : ''}`}>{totalBDist}</span>
                      <span className="shs-stat-lbl">Total Dist.</span>
                      {avgBDist != null && <span className="shs-stat-hint">{avgBDist}/night</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Clinical Alerts ── */}
              {alerts.length > 0 && (
                <div className="shs-alerts">
                  {alerts.map((a, i) => (
                    <div key={i} className={`shs-alert shs-alert--${a.type}`}>
                      <span className="shs-alert-icon">{a.type === 'critical' ? '⚠' : a.type === 'warning' ? '◈' : 'ℹ'}</span>
                      <span>{a.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              <hr className="shs-divider" />

              {/* ── Nightly Detail ── */}
              <div className="shs-nights-hdr">
                <div>
                  Nightly Detail
                  <span className="shs-nights-badge">{validNights.length}</span>
                </div>
                <div className="shs-collapse-btns">
                  <button className="shs-collapse-btn" onClick={() => setSleepAllOpen(true)}>Expand All</button>
                  <button className="shs-collapse-btn" onClick={() => setSleepAllOpen(false)}>Collapse All</button>
                </div>
              </div>
              <div className="shs-nights-list">
                {sleepDays.filter(d => !d.empty && d.total != null).map(d => {
                  const stg = sleepStageBar(d);
                  const isOpen = sleepOpenCards.has(d.date);
                  return (
                    <div key={d.date} className={`shs-night-card${isOpen ? ' shs-night-card--open' : ''}`}
                         onClick={() => toggleSleepCard(d.date)} style={{ cursor: 'pointer' }}>
                      <div className="shs-night-hdr">
                        <div className="shs-night-left">
                          <span className="shs-night-date">{localDateStr(d.date)}</span>
                          <span className="shs-night-total">{fmtSleepHr(d.total)}</span>
                          {d.inBed != null && <span className="shs-night-inbed">In bed {fmtSleepHr(d.inBed)}</span>}
                        </div>
                        <div className="shs-night-right-wrap">
                          {d.efficiency != null && (
                            <span className={`shs-eff-badge${d.efficiency < 75 ? ' shs-eff-badge--low' : d.efficiency >= 85 ? ' shs-eff-badge--high' : ''}`}>
                              {d.efficiency.toFixed(0)}% eff
                            </span>
                          )}
                          <span className="shs-night-chevron">{isOpen ? '▾' : '›'}</span>
                        </div>
                      </div>
                      {!isOpen && stg && (
                        <>
                          <div className="shs-stage-bar">
                            <div className="shs-seg shs-seg--deep"  style={{ width: stg.deep  + '%' }} />
                            <div className="shs-seg shs-seg--rem"   style={{ width: stg.rem   + '%' }} />
                            <div className="shs-seg shs-seg--core"  style={{ width: stg.core  + '%' }} />
                            <div className="shs-seg shs-seg--awake" style={{ width: stg.awake + '%' }} />
                          </div>
                          <div className="shs-stage-chips">
                            {d.deep  != null && <span className="shs-chip shs-chip--deep"><span  className="shs-chip-dot" />Deep {fmtSleepHr(d.deep)}</span>}
                            {d.rem   != null && <span className="shs-chip shs-chip--rem"><span   className="shs-chip-dot" />REM {fmtSleepHr(d.rem)}</span>}
                            {d.core  != null && <span className="shs-chip shs-chip--core"><span  className="shs-chip-dot" />Core {fmtSleepHr(d.core)}</span>}
                            {d.awake != null && <span className="shs-chip shs-chip--awake"><span className="shs-chip-dot" />Awake {fmtSleepHr(d.awake)}</span>}
                          </div>
                        </>
                      )}
                      {isOpen && <ShareSleepGraph d={d} />}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        <p className="share-footer">
          ArfidWatch &mdash; read-only view &mdash; {periodLabel.toLowerCase()}
        </p>
      </div>
    </div>
  );
}

export default SharePage;
