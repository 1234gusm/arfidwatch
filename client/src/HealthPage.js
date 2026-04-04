import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import './HealthPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

function HealthPage({ token }) {
  const [data, setData] = useState([]);
  const [imports, setImports] = useState([]);
  const [todayFood, setTodayFood] = useState(null);
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [expandedType, setExpandedType] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [statOrder, setStatOrder] = useState([]);
  const [dragOver, setDragOver] = useState(null);
  const dragSrc = useRef(null);
  const uploadInputRef = useRef(null);

  // date range for charts (YYYY-MM-DD) — local time, NOT UTC
  const formatDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const toLocalDate = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : formatDate(d); };
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [startDate, setStartDate] = useState(formatDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(new Date()));
  const [overviewPeriod, setOverviewPeriod] = useState(7);

  const fetchData = async () => {
    const res = await authFetch(`${API_BASE}/api/health`, {
      credentials: 'include',
    });
    const json = await res.json();
    setData(json.data || []);
  };

  const fetchImports = async () => {
    const res = await authFetch(`${API_BASE}/api/health/imports`, {
      credentials: 'include',
    });
    const json = await res.json();
    setImports(json.imports || []);
  };

  const fetchTodayFood = async () => {
    try {
      const today = formatDate(new Date());
      const params = new URLSearchParams({ start: today, end: today });
      const res = await authFetch(`${API_BASE}/api/food-log/daily?${params}`, {
        credentials: 'include',
      });
      const json = await res.json();
      const row = (json.data || []).find(r => r.date === today);
      setTodayFood(row || null);
    } catch (_) { /* best-effort */ }
  };

  const persistDashboardPrefs = async (nextHiddenTypes, nextStatOrder) => {
    try {
      await authFetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hidden_health_types: [...nextHiddenTypes],
          health_stat_order: nextStatOrder,
        }),
      });
    } catch (_) {
      // Keep current UI state if preference save fails.
    }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;

    const loadDashboardPrefs = async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/profile`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!active) return;
        setHiddenTypes(new Set(Array.isArray(d.hidden_health_types) ? d.hidden_health_types : []));
        setStatOrder(Array.isArray(d.health_stat_order) ? d.health_stat_order : []);
      } catch (_) {
        if (!active) return;
        setHiddenTypes(new Set());
        setStatOrder([]);
      }
    };

    loadDashboardPrefs();
    return () => { active = false; };
  }, [token]);

  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const deleteImport = async (id) => {
    if (!window.confirm('Delete this import and all its data?')) return;
    await authFetch(`${API_BASE}/api/health/imports/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    fetchData();
    fetchImports();
  };

  const deleteAllImports = async () => {
    await authFetch(`${API_BASE}/api/health/imports`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setDeleteAllConfirm(false);
    fetchData();
    fetchImports();
  };

  const hideType = (t) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.add(t);
      persistDashboardPrefs(next, statOrder);
      return next;
    });
  };

  const showType = (t) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.delete(t);
      persistDashboardPrefs(next, statOrder);
      return next;
    });
  };

  const buildImportAlertMessage = ({ imported, label, skipped, skipped_duplicates, duplicateFile }) => {
    const malformed = skipped ? ` (${skipped} malformed row${skipped === 1 ? '' : 's'} skipped)` : '';
    const dupStats = skipped_duplicates ? `; ${skipped_duplicates} duplicate stat${skipped_duplicates === 1 ? '' : 's'} ignored` : '';
    const dupFile = duplicateFile ? ' (same file re-uploaded)' : '';
    return `Imported ${imported} ${label}${malformed}${dupStats}${dupFile}`;
  };

  // Unified file import — auto-detects format from extension / CSV header
  const handleUnifiedUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      // MacroFactor Excel export
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await authFetch(`${API_BASE}/api/health/macro/import`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) { alert('Failed to import MacroFactor file: ' + await res.text()); return; }
        const r = await res.json();
        const label = r.isFoodLogFile ? 'food log entries' : 'MacroFactor records';
        alert(buildImportAlertMessage({ ...r, label }));
        fetchData(); fetchImports(); fetchTodayFood();
      } catch (err) {
        console.error('MacroFactor import error:', err);
        alert('Error importing MacroFactor file');
      }
      return;
    }

    // CSV: read text and sniff header to determine route
    let text;
    try { text = await file.text(); } catch { alert('Could not read file'); return; }
    const firstLine = text.split('\n')[0].toLowerCase();

    // Health Auto Export headers: row-per-measurement shape ("Source Name", "Start Date") or
    // daily aggregate shape where the first column is "Date/Time" followed by metric columns.
    const isHealthAutoExport =
      /(source\s*name|start\s*date|end\s*date|creation\s*date)/i.test(firstLine) ||
      (/^"?date\/time"?[,;]/i.test(firstLine.trimStart()) &&
        /(active.energy|heart.rate|step.count|blood.oxygen|walking.*running)/i.test(firstLine));
    const isAutoSleepHeaderShape = /(iso8601,.*fromdate,.*todate|\binbed\b|\bfellasleepin\b|\basleepavg7\b|\befficiencyavg7\b)/i.test(firstLine.replace(/\s+/g, ''));
    const isAutoSleepCsv = isAutoSleepHeaderShape || /\bautosleep\b/i.test(firstLine);
    if (isHealthAutoExport) {
      // Health Auto Export CSV
      try {
        const res = await authFetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: text, filename: file.name }),
        });
        if (!res.ok) { alert('Failed to import CSV: ' + await res.text()); return; }
        const r = await res.json();
        alert(buildImportAlertMessage({ ...r, label: 'health records' }));
        fetchData(); fetchImports(); fetchTodayFood();
      } catch (err) {
        console.error('CSV import error:', err);
        alert('Error importing CSV');
      }
      return;
    }

    if (isAutoSleepCsv) {
      // AutoSleep CSV maps into canonical sleep metrics server-side.
      try {
        const res = await authFetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: text, filename: file.name }),
        });
        if (!res.ok) { alert('Failed to import AutoSleep CSV: ' + await res.text()); return; }
        const r = await res.json();
        alert(buildImportAlertMessage({ ...r, label: 'sleep records' }));
        fetchData(); fetchImports(); fetchTodayFood();
      } catch (err) {
        console.error('AutoSleep CSV import error:', err);
        alert('Error importing AutoSleep CSV');
      }
      return;
    }

    // MacroFactor CSV — food log if header contains "meal" or "food"
    const isFoodLog = /\bmeal\b|\bfood\b/.test(firstLine);
    const form = new FormData();
    form.append('file', file);
    try {
      const url = `${API_BASE}/api/health/macro/import` + (isFoodLog ? '?source=foodlog' : '');
      const res = await authFetch(url, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) { alert('Failed to import MacroFactor file: ' + await res.text()); return; }
      const r = await res.json();
      const label = r.isFoodLogFile ? 'food log entries' : 'MacroFactor records';
      alert(buildImportAlertMessage({ ...r, label }));
      fetchData(); fetchImports(); fetchTodayFood();
    } catch (err) {
      console.error('MacroFactor import error:', err);
      alert('Error importing MacroFactor CSV');
    }
  };

  // helpers: normalize numeric value
  const toNum = v => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return v;
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const rd = (n) => Math.round(n * 100) / 100;
  const groupStats = (items) => {
    const vals = items.map(i => toNum(i.value)).filter(n => !Number.isNaN(n));
    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      count: vals.length,
      avg: rd(sum / vals.length),
      min: rd(Math.min(...vals)),
      max: rd(Math.max(...vals)),
      latest: rd(vals[vals.length - 1]),
    };
  };

  // Comprehensive mapping from normalized Health Auto Export type keys → display info
  const typeMeta = {
    // Heart
    heart_rate_min_countmin: { label: 'Heart Rate (Min)', unit: 'bpm', group: 'Heart' },
    heart_rate_avg_countmin: { label: 'Heart Rate (Avg)', unit: 'bpm', group: 'Heart' },
    heart_rate_max_countmin: { label: 'Heart Rate (Max)', unit: 'bpm', group: 'Heart' },
    heart_rate_variability_ms: { label: 'HRV', unit: 'ms', group: 'Heart' },
    resting_heart_rate_countmin: { label: 'Resting HR', unit: 'bpm', group: 'Heart' },
    walking_heart_rate_average_countmin: { label: 'Walking HR', unit: 'bpm', group: 'Heart' },
    cardio_recovery_countmin: { label: 'Cardio Recovery', unit: 'bpm', group: 'Heart' },
    atrial_fibrillation_burden__: { label: 'AFib Burden', unit: '%', group: 'Heart' },
    // Activity
    active_energy_kcal: { label: 'Active Energy', unit: 'kcal', group: 'Activity' },
    resting_energy_kcal: { label: 'Resting Energy', unit: 'kcal', group: 'Activity' },
    step_count_count: { label: 'Steps', unit: 'steps', group: 'Activity' },
    flights_climbed_count: { label: 'Flights Climbed', unit: '', group: 'Activity' },
    walking___running_distance_mi: { label: 'Walk+Run Distance', unit: 'mi', group: 'Activity' },
    apple_exercise_time_min: { label: 'Exercise Time', unit: 'min', group: 'Activity' },
    apple_stand_time_min: { label: 'Stand Time', unit: 'min', group: 'Activity' },
    apple_stand_hour_count: { label: 'Stand Hours', unit: 'hr', group: 'Activity' },
    apple_move_time_min: { label: 'Move Time', unit: 'min', group: 'Activity' },
    vo2_max_mlkgmin: { label: 'VO₂ Max', unit: 'ml/kg/min', group: 'Activity' },
    physical_effort_kcalhrkg: { label: 'Physical Effort', unit: 'kcal/hr·kg', group: 'Activity' },
    // Body
    weight_lb: { label: 'Weight', unit: 'lb', group: 'Body' },
    body_fat_percentage__: { label: 'Body Fat', unit: '%', group: 'Body' },
    body_mass_index_count: { label: 'BMI', unit: '', group: 'Body' },
    lean_body_mass_lb: { label: 'Lean Body Mass', unit: 'lb', group: 'Body' },
    waist_circumference_in: { label: 'Waist', unit: 'in', group: 'Body' },
    height_cm: { label: 'Height', unit: 'cm', group: 'Body' },
    body_temperature_degf: { label: 'Body Temp', unit: '°F', group: 'Body' },
    basal_body_temperature_degf: { label: 'Basal Temp', unit: '°F', group: 'Body' },
    apple_sleeping_wrist_temperature_degf: { label: 'Wrist Temp (Sleep)', unit: '°F', group: 'Body' },
    // Sleep
    sleep_analysis_total_sleep_hr: { label: 'Total Sleep', unit: 'hr', group: 'Sleep' },
    sleep_analysis_asleep_hr: { label: 'Asleep', unit: 'hr', group: 'Sleep' },
    sleep_analysis_in_bed_hr: { label: 'In Bed', unit: 'hr', group: 'Sleep' },
    sleep_analysis_core_hr: { label: 'Core Sleep', unit: 'hr', group: 'Sleep' },
    sleep_analysis_rem_hr: { label: 'REM Sleep', unit: 'hr', group: 'Sleep' },
    sleep_analysis_deep_hr: { label: 'Deep Sleep', unit: 'hr', group: 'Sleep' },
    sleep_analysis_awake_hr: { label: 'Awake (Sleep)', unit: 'hr', group: 'Sleep' },
    breathing_disturbances_count: { label: 'Breathing Disturbances', unit: '', group: 'Sleep' },
    respiratory_rate_countmin: { label: 'Respiratory Rate', unit: '/min', group: 'Sleep' },
    mindful_minutes_min: { label: 'Mindful Minutes', unit: 'min', group: 'Sleep' },
    // Nutrition
    dietary_energy_kcal: { label: 'Calories', unit: 'kcal', group: 'Nutrition' },
    carbohydrates_g: { label: 'Carbs', unit: 'g', group: 'Nutrition' },
    protein_g: { label: 'Protein', unit: 'g', group: 'Nutrition' },
    total_fat_g: { label: 'Total Fat', unit: 'g', group: 'Nutrition' },
    saturated_fat_g: { label: 'Saturated Fat', unit: 'g', group: 'Nutrition' },
    sugar_g: { label: 'Sugar', unit: 'g', group: 'Nutrition' },
    fiber_g: { label: 'Fiber', unit: 'g', group: 'Nutrition' },
    sodium_mg: { label: 'Sodium', unit: 'mg', group: 'Nutrition' },
    cholesterol_mg: { label: 'Cholesterol', unit: 'mg', group: 'Nutrition' },
    water_fl_oz_us: { label: 'Water', unit: 'fl oz', group: 'Nutrition' },
    caffeine_mg: { label: 'Caffeine', unit: 'mg', group: 'Nutrition' },
    // Vitals
    blood_glucose_mgdl: { label: 'Blood Glucose', unit: 'mg/dL', group: 'Vitals' },
    blood_oxygen_saturation__: { label: 'Blood O₂', unit: '%', group: 'Vitals' },
    blood_pressure_systolic_mmhg: { label: 'BP Systolic', unit: 'mmHg', group: 'Vitals' },
    blood_pressure_diastolic_mmhg: { label: 'BP Diastolic', unit: 'mmHg', group: 'Vitals' },
    // Environment / Other
    environmental_audio_exposure_dbaspl: { label: 'Environmental Audio', unit: 'dB', group: 'Vitals' },
    headphone_audio_exposure_dbaspl: { label: 'Headphone Audio', unit: 'dB', group: 'Vitals' },
    time_in_daylight_min: { label: 'Time in Daylight', unit: 'min', group: 'Activity' },
    walking_speed_mihr: { label: 'Walking Speed', unit: 'mph', group: 'Activity' },
    walking_step_length_in: { label: 'Step Length', unit: 'in', group: 'Activity' },
    // Vitamins & B-vitamins
    vitamin_a_mcg:           { label: 'Vitamin A',          unit: 'mcg',         group: 'Nutrition' },
    vitamin_b12_mcg:         { label: 'Vitamin B12',        unit: 'mcg',         group: 'Nutrition' },
    vitamin_b6_mg:           { label: 'Vitamin B6',         unit: 'mg',          group: 'Nutrition' },
    vitamin_c_mg:            { label: 'Vitamin C',          unit: 'mg',          group: 'Nutrition' },
    vitamin_d_mcg:           { label: 'Vitamin D',          unit: 'mcg',         group: 'Nutrition' },
    vitamin_e_mg:            { label: 'Vitamin E',          unit: 'mg',          group: 'Nutrition' },
    vitamin_k_mcg:           { label: 'Vitamin K',          unit: 'mcg',         group: 'Nutrition' },
    biotin_mcg:              { label: 'Biotin',             unit: 'mcg',         group: 'Nutrition' },
    niacin_mg:               { label: 'Niacin',             unit: 'mg',          group: 'Nutrition' },
    pantothenic_acid_mg:     { label: 'Pantothenic Acid',   unit: 'mg',          group: 'Nutrition' },
    riboflavin_mg:           { label: 'Riboflavin',         unit: 'mg',          group: 'Nutrition' },
    thiamin_mg:              { label: 'Thiamin',            unit: 'mg',          group: 'Nutrition' },
    // Minerals
    calcium_mg:              { label: 'Calcium',            unit: 'mg',          group: 'Nutrition' },
    folate_mcg:              { label: 'Folate',             unit: 'mcg',         group: 'Nutrition' },
    magnesium_mg:            { label: 'Magnesium',          unit: 'mg',          group: 'Nutrition' },
    zinc_mg:                 { label: 'Zinc',               unit: 'mg',          group: 'Nutrition' },
    chromium_mcg:            { label: 'Chromium',           unit: 'mcg',         group: 'Nutrition' },
    copper_mg:               { label: 'Copper',             unit: 'mg',          group: 'Nutrition' },
    iodine_mcg:              { label: 'Iodine',             unit: 'mcg',         group: 'Nutrition' },
    iron_mg:                 { label: 'Iron',               unit: 'mg',          group: 'Nutrition' },
    manganese_mg:            { label: 'Manganese',          unit: 'mg',          group: 'Nutrition' },
    molybdenum_mcg:          { label: 'Molybdenum',         unit: 'mcg',         group: 'Nutrition' },
    potassium_mg:            { label: 'Potassium',          unit: 'mg',          group: 'Nutrition' },
    selenium_mcg:            { label: 'Selenium',           unit: 'mcg',         group: 'Nutrition' },
    monounsaturated_fat_g:   { label: 'Monounsat. Fat',     unit: 'g',           group: 'Nutrition' },
    polyunsaturated_fat_g:   { label: 'Polyunsat. Fat',     unit: 'g',           group: 'Nutrition' },
    // Running
    running_speed_mihr:                  { label: 'Running Speed',       unit: 'mph',         group: 'Activity' },
    running_power_w:                     { label: 'Running Power',       unit: 'W',           group: 'Activity' },
    running_ground_contact_time_ms:      { label: 'Ground Contact',      unit: 'ms',          group: 'Activity' },
    running_stride_length_m:             { label: 'Stride Length',       unit: 'm',           group: 'Activity' },
    running_vertical_oscillation_cm:     { label: 'Vert. Oscillation',   unit: 'cm',          group: 'Activity' },
    // Cycling
    cycling_distance_mi:     { label: 'Cycling Distance',   unit: 'mi',          group: 'Activity' },
    cycling_speed_mihr:      { label: 'Cycling Speed',      unit: 'mph',         group: 'Activity' },
    cycling_power_w:         { label: 'Cycling Power',      unit: 'W',           group: 'Activity' },
    cycling_cadence_countmin:{ label: 'Cycling Cadence',    unit: 'rpm',         group: 'Activity' },
    // Walking extras
    walking_asymmetry_percentage__:      { label: 'Walk Asymmetry',       unit: '%',           group: 'Activity' },
    walking_double_support_percentage__: { label: 'Double Support',       unit: '%',           group: 'Activity' },
    stair_speed__down_fts:   { label: 'Stair Speed Down',   unit: 'ft/s',        group: 'Activity' },
    stair_speed__up_fts:     { label: 'Stair Speed Up',     unit: 'ft/s',        group: 'Activity' },
    six_minute_walking_test_distance_m: { label: '6-Min Walk Test', unit: 'm',  group: 'Activity' },
    // VO2 / Physical Effort — both the old key (with middle-dot → _) and new clean key
    vo2_max_mlkg_min:        { label: 'VO\u2082 Max',       unit: 'ml/kg/min',   group: 'Activity' },
    physical_effort_kcalhr_kg: { label: 'Physical Effort',  unit: 'kcal/hr\u00B7kg', group: 'Activity' },
    // Other
    handwashing_s:           { label: 'Handwashing',        unit: 's',           group: 'Vitals' },
    toothbrushing_s:         { label: 'Toothbrushing',      unit: 's',           group: 'Vitals' },
    // Dietary fatty acids & omegas (grams, from food tracking)
    omega_3_g:               { label: 'Omega-3',            unit: 'g',           group: 'Extra Nutritional Info' },
    omega_6_g:               { label: 'Omega-6',            unit: 'g',           group: 'Extra Nutritional Info' },
    omega_3_ala_g:           { label: 'ALA (Omega-3)',       unit: 'g',           group: 'Extra Nutritional Info' },
    omega_3_dha_g:           { label: 'DHA',                unit: 'g',           group: 'Extra Nutritional Info' },
    omega_3_epa_g:           { label: 'EPA',                unit: 'g',           group: 'Extra Nutritional Info' },
    // Added sugar
    sugars_added_g:          { label: 'Added Sugar',         unit: 'g',           group: 'Nutrition' },
    // Dietary amino acids (grams, from food tracking)
    lysine_g:                { label: 'Lysine',              unit: 'g',           group: 'Extra Nutritional Info' },
    methionine_g:            { label: 'Methionine',          unit: 'g',           group: 'Extra Nutritional Info' },
    phenylalanine_g:         { label: 'Phenylalanine',       unit: 'g',           group: 'Extra Nutritional Info' },
    threonine_g:             { label: 'Threonine',           unit: 'g',           group: 'Extra Nutritional Info' },
    tryptophan_g:            { label: 'Tryptophan',          unit: 'g',           group: 'Extra Nutritional Info' },
    tyrosine_g:              { label: 'Tyrosine',            unit: 'g',           group: 'Extra Nutritional Info' },
    valine_g:                { label: 'Valine',              unit: 'g',           group: 'Extra Nutritional Info' },
    leucine_g:               { label: 'Leucine',             unit: 'g',           group: 'Extra Nutritional Info' },
    isoleucine_g:            { label: 'Isoleucine',          unit: 'g',           group: 'Extra Nutritional Info' },
    histidine_g:             { label: 'Histidine',           unit: 'g',           group: 'Extra Nutritional Info' },
    arginine_g:              { label: 'Arginine',            unit: 'g',           group: 'Extra Nutritional Info' },
    cystine_g:               { label: 'Cystine',             unit: 'g',           group: 'Extra Nutritional Info' },
    cysteine_g:              { label: 'Cysteine',            unit: 'g',           group: 'Extra Nutritional Info' },
    glutamic_acid_g:         { label: 'Glutamic Acid',       unit: 'g',           group: 'Extra Nutritional Info' },
    aspartic_acid_g:         { label: 'Aspartic Acid',       unit: 'g',           group: 'Extra Nutritional Info' },
    glycine_g:               { label: 'Glycine',             unit: 'g',           group: 'Extra Nutritional Info' },
    proline_g:               { label: 'Proline',             unit: 'g',           group: 'Extra Nutritional Info' },
    serine_g:                { label: 'Serine',              unit: 'g',           group: 'Extra Nutritional Info' },
    alanine_g:               { label: 'Alanine',             unit: 'g',           group: 'Extra Nutritional Info' },
    glutamine_g:             { label: 'Glutamine',           unit: 'g',           group: 'Extra Nutritional Info' },
    carnitine_g:             { label: 'L-Carnitine',         unit: 'g',           group: 'Extra Nutritional Info' },
    citrulline_g:            { label: 'L-Citrulline',        unit: 'g',           group: 'Extra Nutritional Info' },
    theanine_g:              { label: 'L-Theanine',          unit: 'g',           group: 'Extra Nutritional Info' },
    // MacroFactor B-vitamin key variants (include B-number prefix)
    b1_thiamine_mg:          { label: 'B1 Thiamine',         unit: 'mg',          group: 'Nutrition' },
    b2_riboflavin_mg:        { label: 'B2 Riboflavin',       unit: 'mg',          group: 'Nutrition' },
    b3_niacin_mg:            { label: 'B3 Niacin',           unit: 'mg',          group: 'Nutrition' },
    b5_pantothenic_acid_mg:  { label: 'B5 Pantothenic Acid', unit: 'mg',          group: 'Nutrition' },
    b6_pyridoxine_mg:        { label: 'B6 Pyridoxine',       unit: 'mg',          group: 'Nutrition' },
    b12_cobalamin_mcg:       { label: 'B12 Cobalamin',       unit: 'mcg',         group: 'Nutrition' },
    choline_mg:              { label: 'Choline',             unit: 'mg',          group: 'Nutrition' },
    phosphorus_mg:           { label: 'Phosphorus',          unit: 'mg',          group: 'Nutrition' },
    // Supplements / Amino Acids
    creatine_g:              { label: 'Creatine',            unit: 'g',           group: 'Extra Nutritional Info' },
    l_glutamine_mg:          { label: 'L-Glutamine',         unit: 'mg',          group: 'Extra Nutritional Info' },
    l_arginine_mg:           { label: 'L-Arginine',          unit: 'mg',          group: 'Extra Nutritional Info' },
    l_lysine_mg:             { label: 'L-Lysine',            unit: 'mg',          group: 'Extra Nutritional Info' },
    l_leucine_mg:            { label: 'L-Leucine',           unit: 'mg',          group: 'Extra Nutritional Info' },
    l_isoleucine_mg:         { label: 'L-Isoleucine',        unit: 'mg',          group: 'Extra Nutritional Info' },
    l_valine_mg:             { label: 'L-Valine',            unit: 'mg',          group: 'Extra Nutritional Info' },
    bcaa_mg:                 { label: 'BCAAs',               unit: 'mg',          group: 'Extra Nutritional Info' },
    l_tryptophan_mg:         { label: 'Tryptophan',           unit: 'mg',          group: 'Extra Nutritional Info' },
    l_tyrosine_mg:           { label: 'L-Tyrosine',          unit: 'mg',          group: 'Extra Nutritional Info' },
    l_phenylalanine_mg:      { label: 'L-Phenylalanine',     unit: 'mg',          group: 'Extra Nutritional Info' },
    l_methionine_mg:         { label: 'L-Methionine',        unit: 'mg',          group: 'Extra Nutritional Info' },
    l_threonine_mg:          { label: 'L-Threonine',         unit: 'mg',          group: 'Extra Nutritional Info' },
    l_histidine_mg:          { label: 'L-Histidine',         unit: 'mg',          group: 'Extra Nutritional Info' },
    l_cysteine_mg:           { label: 'L-Cysteine',          unit: 'mg',          group: 'Extra Nutritional Info' },
    nac_mg:                  { label: 'NAC',                 unit: 'mg',          group: 'Extra Nutritional Info' },
    l_carnitine_mg:          { label: 'L-Carnitine',         unit: 'mg',          group: 'Extra Nutritional Info' },
    l_citrulline_mg:         { label: 'L-Citrulline',        unit: 'mg',          group: 'Extra Nutritional Info' },
    l_theanine_mg:           { label: 'L-Theanine',          unit: 'mg',          group: 'Extra Nutritional Info' },
    beta_alanine_mg:         { label: 'Beta-Alanine',        unit: 'mg',          group: 'Extra Nutritional Info' },
    taurine_mg:              { label: 'Taurine',             unit: 'mg',          group: 'Extra Nutritional Info' },
    glycine_mg:              { label: 'Glycine',             unit: 'mg',          group: 'Extra Nutritional Info' },
    gaba_mg:                 { label: 'GABA',                unit: 'mg',          group: 'Extra Nutritional Info' },
    five_htp_mg:             { label: '5-HTP',               unit: 'mg',          group: 'Extra Nutritional Info' },
    l_proline_mg:            { label: 'L-Proline',           unit: 'mg',          group: 'Extra Nutritional Info' },
    l_serine_mg:             { label: 'L-Serine',            unit: 'mg',          group: 'Extra Nutritional Info' },
    l_alanine_mg:            { label: 'L-Alanine',           unit: 'mg',          group: 'Extra Nutritional Info' },
    l_aspartate_mg:          { label: 'L-Aspartate',         unit: 'mg',          group: 'Extra Nutritional Info' },
    l_glutamate_mg:          { label: 'L-Glutamate',         unit: 'mg',          group: 'Extra Nutritional Info' },
    coq10_mg:                { label: 'CoQ10',               unit: 'mg',          group: 'Extra Nutritional Info' },
    omega_3_mg:              { label: 'Omega-3',             unit: 'mg',          group: 'Extra Nutritional Info' },
    epa_mg:                  { label: 'EPA',                 unit: 'mg',          group: 'Extra Nutritional Info' },
    dha_mg:                  { label: 'DHA',                 unit: 'mg',          group: 'Extra Nutritional Info' },
    alpha_lipoic_acid_mg:    { label: 'Alpha Lipoic Acid',   unit: 'mg',          group: 'Extra Nutritional Info' },
    melatonin_mg:            { label: 'Melatonin',           unit: 'mg',          group: 'Extra Nutritional Info' },
    ashwagandha_mg:          { label: 'Ashwagandha',         unit: 'mg',          group: 'Extra Nutritional Info' },
    curcumin_mg:             { label: 'Curcumin',            unit: 'mg',          group: 'Extra Nutritional Info' },
    collagen_g:              { label: 'Collagen',            unit: 'g',           group: 'Extra Nutritional Info' },
    glucosamine_mg:          { label: 'Glucosamine',         unit: 'mg',          group: 'Extra Nutritional Info' },
    chondroitin_mg:          { label: 'Chondroitin',         unit: 'mg',          group: 'Extra Nutritional Info' },
    resveratrol_mg:          { label: 'Resveratrol',         unit: 'mg',          group: 'Extra Nutritional Info' },
    quercetin_mg:            { label: 'Quercetin',           unit: 'mg',          group: 'Extra Nutritional Info' },
    berberine_mg:            { label: 'Berberine',           unit: 'mg',          group: 'Extra Nutritional Info' },
    inositol_mg:             { label: 'Inositol',            unit: 'mg',          group: 'Extra Nutritional Info' },
    dhea_mg:                 { label: 'DHEA',                unit: 'mg',          group: 'Extra Nutritional Info' },
    silymarin_mg:            { label: 'Milk Thistle',        unit: 'mg',          group: 'Extra Nutritional Info' },
    valerian_mg:             { label: 'Valerian',            unit: 'mg',          group: 'Extra Nutritional Info' },
    elderberry_mg:           { label: 'Elderberry',          unit: 'mg',          group: 'Extra Nutritional Info' },
    hyaluronic_acid_mg:      { label: 'Hyaluronic Acid',     unit: 'mg',          group: 'Extra Nutritional Info' },
    phosphatidylserine_mg:   { label: 'Phosphatidylserine',  unit: 'mg',          group: 'Extra Nutritional Info' },
    astaxanthin_mg:          { label: 'Astaxanthin',         unit: 'mg',          group: 'Extra Nutritional Info' },
    probiotics_bcfu:         { label: 'Probiotics',          unit: 'B CFU',       group: 'Extra Nutritional Info' },
    saw_palmetto_mg:         { label: 'Saw Palmetto',        unit: 'mg',          group: 'Extra Nutritional Info' },
    st_johns_wort_mg:        { label: "St. John's Wort",     unit: 'mg',          group: 'Extra Nutritional Info' },
    echinacea_mg:            { label: 'Echinacea',           unit: 'mg',          group: 'Extra Nutritional Info' },
    ginseng_mg:              { label: 'Ginseng',             unit: 'mg',          group: 'Extra Nutritional Info' },
    maca_mg:                 { label: 'Maca',                unit: 'mg',          group: 'Extra Nutritional Info' },
    spirulina_mg:            { label: 'Spirulina',           unit: 'mg',          group: 'Extra Nutritional Info' },
    chlorella_mg:            { label: 'Chlorella',           unit: 'mg',          group: 'Extra Nutritional Info' },
    matcha_mg:               { label: 'Matcha',              unit: 'mg',          group: 'Extra Nutritional Info' },
    green_tea_extract_mg:    { label: 'Green Tea Extract',   unit: 'mg',          group: 'Extra Nutritional Info' },
    pycnogenol_mg:           { label: 'Pycnogenol',          unit: 'mg',          group: 'Extra Nutritional Info' },
    lycopene_mg:             { label: 'Lycopene',            unit: 'mg',          group: 'Extra Nutritional Info' },
    lutein_mg:               { label: 'Lutein',              unit: 'mg',          group: 'Extra Nutritional Info' },
    zeaxanthin_mg:           { label: 'Zeaxanthin',          unit: 'mg',          group: 'Extra Nutritional Info' },
    shilajit_mg:             { label: 'Shilajit',            unit: 'mg',          group: 'Extra Nutritional Info' },
    lions_mane_mg:           { label: "Lion's Mane",         unit: 'mg',          group: 'Extra Nutritional Info' },
    reishi_mg:               { label: 'Reishi',              unit: 'mg',          group: 'Extra Nutritional Info' },
    cordyceps_mg:            { label: 'Cordyceps',           unit: 'mg',          group: 'Extra Nutritional Info' },
    chaga_mg:                { label: 'Chaga',               unit: 'mg',          group: 'Extra Nutritional Info' },
    turkey_tail_mg:          { label: 'Turkey Tail',         unit: 'mg',          group: 'Extra Nutritional Info' },
    // MacroFactor exports (prefix: macrofactor_)
    macrofactor_energy: { label: 'MF Energy', unit: 'kcal', group: 'Nutrition' },
    macrofactor_calories: { label: 'MF Calories', unit: 'kcal', group: 'Nutrition' },
    macrofactor_protein: { label: 'MF Protein', unit: 'g', group: 'Nutrition' },
    macrofactor_fat: { label: 'MF Fat', unit: 'g', group: 'Nutrition' },
    macrofactor_carbohydrates: { label: 'MF Carbs', unit: 'g', group: 'Nutrition' },
    macrofactor_carbs: { label: 'MF Carbs', unit: 'g', group: 'Nutrition' },
    macrofactor_fiber: { label: 'MF Fiber', unit: 'g', group: 'Nutrition' },
    macrofactor_sugar: { label: 'MF Sugar', unit: 'g', group: 'Nutrition' },
    macrofactor_sodium: { label: 'MF Sodium', unit: 'mg', group: 'Nutrition' },
    macrofactor_water: { label: 'MF Water', unit: 'fl oz', group: 'Nutrition' },
    macrofactor_weight: { label: 'MF Weight', unit: 'lb', group: 'Body' },
    macrofactor_weight_lb: { label: 'MF Weight', unit: 'lb', group: 'Body' },
    macrofactor_weight_kg: { label: 'MF Weight', unit: 'kg', group: 'Body' },
    macrofactor_body_fat: { label: 'MF Body Fat', unit: '%', group: 'Body' },
    macrofactor_lean_mass: { label: 'MF Lean Mass', unit: 'lb', group: 'Body' },
    macrofactor_steps: { label: 'MF Steps', unit: 'steps', group: 'Activity' },
    macrofactor_expenditure: { label: 'Expenditure', unit: 'kcal', group: 'Activity' },
    macrofactor_energy_expenditure: { label: 'Expenditure', unit: 'kcal', group: 'Activity' },
  };

  // Maps MacroFactor type keys → their canonical Apple Health equivalent key.
  // When both sources have data for the same metric they are merged into one card.
  const typeAliases = {
    macrofactor_energy:             'dietary_energy_kcal',
    macrofactor_calories:           'dietary_energy_kcal',
    macrofactor_calories_kcal:      'dietary_energy_kcal',
    macrofactor_protein:            'protein_g',
    macrofactor_protein_g:          'protein_g',
    macrofactor_fat:                'total_fat_g',
    macrofactor_fat_g:              'total_fat_g',
    macrofactor_carbohydrates:      'carbohydrates_g',
    macrofactor_carbs:              'carbohydrates_g',
    macrofactor_carbs_g:            'carbohydrates_g',
    macrofactor_fiber:              'fiber_g',
    macrofactor_fiber_g:            'fiber_g',
    macrofactor_sugar:              'sugar_g',
    macrofactor_sugars_g:           'sugar_g',
    macrofactor_sodium:             'sodium_mg',
    macrofactor_sodium_mg:          'sodium_mg',
    macrofactor_water:              'water_fl_oz_us',
    macrofactor_water_g:            'water_fl_oz_us',
    macrofactor_weight:             'weight_lb',
    macrofactor_weight_lb:          'weight_lb',
    macrofactor_body_fat:           'body_fat_percentage__',
    macrofactor_lean_mass:          'lean_body_mass_lb',
    macrofactor_steps:              'step_count_count',
    macrofactor_expenditure:        'active_energy_kcal',
    macrofactor_energy_expenditure: 'active_energy_kcal',
    macrofactor_weight_kg:          'weight_lb',
    macrofactor_sleep_analysis_total_sleep_hr: 'sleep_analysis_total_sleep_hr',
    macrofactor_sleep_analysis_asleep_hr:      'sleep_analysis_asleep_hr',
    macrofactor_sleep_analysis_in_bed_hr:      'sleep_analysis_in_bed_hr',
    macrofactor_sleep_analysis_core_hr:        'sleep_analysis_core_hr',
    macrofactor_sleep_analysis_rem_hr:         'sleep_analysis_rem_hr',
    macrofactor_sleep_analysis_deep_hr:        'sleep_analysis_deep_hr',
    macrofactor_sleep_analysis_awake_hr:       'sleep_analysis_awake_hr',
    // HealthAutoExport CSV with middle-dot in units produces these keys; alias to clean versions
    vo2_max_mlkg_min:            'vo2_max_mlkgmin',
    physical_effort_kcalhr_kg:   'physical_effort_kcalhrkg',
    // MacroFactor trend weight aliases to the same weight_lb card
    weight_lbs:                  'weight_lb',
    trend_weight_lbs:            'weight_lb',
    trend_weight_lb:             'weight_lb',
    // Amino acid aliases — all bare _mg, l_*_mg, and _g variants → canonical *_g key
    tyrosine_mg:                 'tyrosine_g',
    l_tyrosine_mg:               'tyrosine_g',
    tryptophan_mg:               'tryptophan_g',
    l_tryptophan_mg:             'tryptophan_g',
    glutamine_mg:                'glutamine_g',
    l_glutamine_mg:              'glutamine_g',
    arginine_mg:                 'arginine_g',
    l_arginine_mg:               'arginine_g',
    lysine_mg:                   'lysine_g',
    l_lysine_mg:                 'lysine_g',
    leucine_mg:                  'leucine_g',
    l_leucine_mg:                'leucine_g',
    isoleucine_mg:               'isoleucine_g',
    l_isoleucine_mg:             'isoleucine_g',
    valine_mg:                   'valine_g',
    l_valine_mg:                 'valine_g',
    phenylalanine_mg:            'phenylalanine_g',
    l_phenylalanine_mg:          'phenylalanine_g',
    methionine_mg:               'methionine_g',
    l_methionine_mg:             'methionine_g',
    threonine_mg:                'threonine_g',
    l_threonine_mg:              'threonine_g',
    histidine_mg:                'histidine_g',
    l_histidine_mg:              'histidine_g',
    cysteine_mg:                 'cystine_g',
    l_cysteine_mg:               'cystine_g',
    carnitine_mg:                'carnitine_g',
    l_carnitine_mg:              'carnitine_g',
    citrulline_mg:               'citrulline_g',
    l_citrulline_mg:             'citrulline_g',
    theanine_mg:                 'theanine_g',
    l_theanine_mg:               'theanine_g',
    proline_mg:                  'proline_g',
    l_proline_mg:                'proline_g',
    serine_mg:                   'serine_g',
    l_serine_mg:                 'serine_g',
    alanine_mg:                  'alanine_g',
    l_alanine_mg:                'alanine_g',
    aspartate_mg:                'aspartic_acid_g',
    l_aspartate_mg:              'aspartic_acid_g',
    glutamate_mg:                'glutamic_acid_g',
    l_glutamate_mg:              'glutamic_acid_g',
  };

  // Resolve a raw type key to its canonical key (or itself if no alias).
  // Any macrofactor_ key not explicitly aliased falls back to the bare suffix,
  // so unknown MacroFactor columns never surface with "macrofactor_" in their name.
  const canonical = t => {
    if (!t) return t;
    if (typeAliases[t]) return typeAliases[t];
    if (t.startsWith('macrofactor_')) {
      const stripped = t.slice('macrofactor_'.length);
      return typeAliases[stripped] || stripped;
    }
    return t;
  };

  // Auto-discover all unique canonical types from the actual imported data
  const allTypes = [...new Set(data.map(d => canonical(d.type)))].filter(Boolean);

  // Types permanently removed from the dashboard for all users — niche, redundant, or sleep-only metrics
  const PERMANENTLY_HIDDEN = new Set([
    'swimming_stroke_count_count',
    'wheelchair_distance_mi',
    'target_calories_kcal',
    'target_protein_g',
    'target_fat_g',
    'target_carbs_g',
    'target_carbs',
    'sleep_analysis_quality_hr',
    'fell_asleep_in_hr',
    'sleep_efficiency_percent',
    'sleep_sessions_count',
    'sleep_heart_rate_bpm',
    'waking_heart_rate_bpm',
    'sleep_hrv_ms',
    'resp_rate_min_countmin',
    'resp_rate_max_countmin',
    'day_heart_rate_bpm',
  ]);

  // Types to show: those that have at least one numeric value across all aliased sources.
  // Sleep metrics and permanently-hidden types are excluded.
  const typesOfInterest = allTypes.filter(t => {
    if (PERMANENTLY_HIDDEN.has(t)) return false;
    if (typeMeta[t]?.group === 'Sleep') return false;
    return data.some(d => canonical(d.type) === t && Number.isFinite(parseFloat(d.value)));
  });

  // Group order for display
  const groupOrder = ['Nutrition', 'Activity', 'Heart', 'Body', 'Vitals', 'Extra Nutritional Info'];

  // Within-group sort priority — lower number = shown first
  const typePriority = {
    dietary_energy_kcal: 0,
    protein_g:           1,
    carbohydrates_g:     2,
    total_fat_g:         3,
    weight_lb:           -1,
    step_count_count:    0,
    sleep_analysis_total_sleep_hr: 0,
  };

  // Build series for a canonical type, merging data from all aliased raw types.
  // When multiple sources have a value for the same date, keep the larger one.
  const seriesFor = (canonicalType) => {
    const byDate = {};
    data
      .filter(d => canonical(d.type) === canonicalType)
      .forEach(d => {
        const v = toNum(d.value);
        if (!Number.isFinite(v)) return;
        const dateKey = toLocalDate(d.timestamp);
        if (!dateKey) return;
        if (byDate[dateKey] === undefined || v > byDate[dateKey].value) {
          byDate[dateKey] = {
            date: new Date(d.timestamp),
            dateLabel: dateKey,
            value: rd(v),
          };
        }
      });
    return Object.values(byDate).sort((a, b) => a.date - b.date);
  };

  // Fill every calendar day in [start, end] — null for days with no data so charts show gaps
  const fillGaps = (series, start, end) => {
    const byDate = {};
    series.forEach(p => { byDate[p.dateLabel] = p.value; });
    const result = [];
    const cur = new Date(start + 'T12:00:00');
    const endD = new Date(end + 'T12:00:00');
    while (cur <= endD) {
      const key = formatDate(cur);
      result.push({ dateLabel: key, value: byDate[key] ?? null });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  };

  // build stats map for types
  const statsMap = {};
  typesOfInterest.forEach(t => {
    const s = seriesFor(t);
    statsMap[t] = s.length ? groupStats(s) : null;
  });

  // All hooks must be called at top level before any conditional returns
  useEffect(() => {
    if (token) { fetchData(); fetchImports(); fetchTodayFood(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Early return for unauthenticated users (after all hooks)
  if (!token) {
    return <div style={{padding: '20px', textAlign:'center'}}>Please log in</div>;
  }

  // ── Today's nutrition summary (from food_log_entries) ─────────────────
  const todayKey = formatDate(new Date());
  const todayNutrition = (() => {
    if (!todayFood) return { calories: null, protein: null, carbs: null, fat: null };
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    return {
      calories: num(todayFood.dietary_energy_kcal),
      protein:  num(todayFood.protein_g),
      carbs:    num(todayFood.carbohydrates_g),
      fat:      num(todayFood.total_fat_g),
    };
  })();
  const todayHasAnyFood = Object.values(todayNutrition).some(v => v !== null);

  // ── Rolling overview card data ─────────────────────────────────────────────
  const overviewCutoffKey = (() => {
    if (overviewPeriod === 0) return '2000-01-01';
    const d = new Date();
    d.setDate(d.getDate() - overviewPeriod + 1);
    return formatDate(d);
  })();
  const overviewData = (() => {
    const getRange = (ct) =>
      data
        .filter(r => canonical(r.type) === ct)
        .map(r => ({ v: toNum(r.value), day: toLocalDate(r.timestamp) }))
        .filter(x => x.day >= overviewCutoffKey && x.day <= todayKey && Number.isFinite(x.v));
    const avgZeroFill = (vals) => {
      if (!vals.length) return null;
      const byDay = {};
      vals.forEach(x => { if (byDay[x.day] === undefined || x.v > byDay[x.day]) byDay[x.day] = x.v; });
      return Object.values(byDay).reduce((a, b) => a + b, 0) / (overviewPeriod || Object.keys(byDay).length || 1);
    };
    const weightVals = data
      .filter(r => ['weight_lb', 'weight_kg'].includes(canonical(r.type)))
      .map(r => ({ v: toNum(r.value), day: toLocalDate(r.timestamp), unit: canonical(r.type) === 'weight_kg' ? 'kg' : 'lb' }))
      .filter(x => Number.isFinite(x.v))
      .sort((a, b) => b.day.localeCompare(a.day));
    const hrVals = getRange('resting_heart_rate_countmin').sort((a, b) => b.day.localeCompare(a.day));
    return {
      weight:     weightVals.length ? weightVals[0].v    : null,
      weightUnit: weightVals.length ? weightVals[0].unit : 'lb',
      kcal:       avgZeroFill(getRange('dietary_energy_kcal')),
      protein:    avgZeroFill(getRange('protein_g')),
      carbs:      avgZeroFill(getRange('carbohydrates_g')),
      fat:        avgZeroFill(getRange('total_fat_g')),
      restingHR:  hrVals.length ? hrVals[0].v : null,
    };
  })();

  // Build the current display order of all visible types.
  // groupOrder always wins at the group level; within a group, saved drag positions are preserved.
  const orderedVisible = (() => {
    const groupOf = t => {
      const g = typeMeta[t]?.group || 'Extra Nutritional Info';
      const idx = groupOrder.indexOf(g);
      return idx === -1 ? groupOrder.length : idx;
    };
    const savedPos = {};
    statOrder.forEach((t, i) => { savedPos[t] = i; });

    return typesOfInterest
      .filter(t => !hiddenTypes.has(t))
      .sort((a, b) => {
        const ga = groupOf(a), gb = groupOf(b);
        if (ga !== gb) return ga - gb;
        // Within the same group: respect saved drag order, then typePriority for new types
        const sa = savedPos[a] ?? Infinity;
        const sb = savedPos[b] ?? Infinity;
        if (sa !== sb) return sa - sb;
        return (typePriority[a] ?? 99) - (typePriority[b] ?? 99);
      });
  })();

  const handleDrop = (targetType) => {
    const src = dragSrc.current;
    if (!src || src === targetType) { setDragOver(null); return; }
    // Only allow reordering within the same group
    if ((typeMeta[src]?.group || 'Extra Nutritional Info') !== (typeMeta[targetType]?.group || 'Extra Nutritional Info')) {
      dragSrc.current = null; setDragOver(null); return;
    }
    const from = orderedVisible.indexOf(src);
    const to = orderedVisible.indexOf(targetType);
    if (from !== -1 && to !== -1) {
      const next = [...orderedVisible];
      next.splice(from, 1);
      next.splice(to, 0, src);
      setStatOrder(next);
      persistDashboardPrefs(hiddenTypes, next);
    }
    dragSrc.current = null;
    setDragOver(null);
  };

  return (
    <div className="health-page">
      <div className="health-page-header">
        <h2>Health Dashboard</h2>
        <div className="health-page-actions">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleUnifiedUpload}
            className="health-upload-input"
          />
          <button
            className="health-upload-btn"
            onClick={() => uploadInputRef.current?.click()}
            title="Upload health data file"
          >
            Upload
          </button>
          <button className="add-metrics-btn" title="Add hidden metrics back" onClick={() => setAddPickerOpen(true)}>＋</button>
        </div>
      </div>

      {/* ── Rolling overview card ── */}
      {(overviewData.kcal !== null || overviewData.weight !== null) && (
        <div className="hp-overview-card">
          <div className="hp-overview-top">
            <div className="hp-overview-title">Rolling Average</div>
            {overviewData.weight != null && (
              <div className="hp-weight-badge">{overviewData.weight.toFixed(1)} {overviewData.weightUnit}</div>
            )}
          </div>
          <div className="hp-period-row">
            {[{n:7,l:'1 Week'},{n:14,l:'2 Weeks'},{n:30,l:'1 Month'},{n:90,l:'3 Months'},{n:360,l:'Year'},{n:0,l:'All'}].map(({n,l}) => (
              <button
                key={n}
                className={`hp-period-btn${overviewPeriod === n ? ' hp-period-btn--active' : ''}`}
                onClick={() => setOverviewPeriod(n)}
              >{l}</button>
            ))}
          </div>
          <div className="hp-overview-period-label">{overviewCutoffKey} – {todayKey}</div>
          <div className="hp-overview-macros">
            {overviewData.kcal !== null && (
              <div className="hp-macro-chip">
                <strong>{Math.round(overviewData.kcal).toLocaleString()}</strong>
                <span>kcal/day</span>
              </div>
            )}
            {overviewData.protein !== null && (
              <div className="hp-macro-chip hp-macro--p">
                <strong>{overviewData.protein.toFixed(1)}g</strong>
                <span>Protein</span>
              </div>
            )}
            {overviewData.carbs !== null && (
              <div className="hp-macro-chip hp-macro--c">
                <strong>{overviewData.carbs.toFixed(1)}g</strong>
                <span>Carbs</span>
              </div>
            )}
            {overviewData.fat !== null && (
              <div className="hp-macro-chip hp-macro--f">
                <strong>{overviewData.fat.toFixed(1)}g</strong>
                <span>Fat</span>
              </div>
            )}
            {overviewData.restingHR !== null && (
              <div className="hp-macro-chip hp-macro--hr">
                <strong>{Math.round(overviewData.restingHR)}</strong>
                <span>bpm rHR</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Today's Eating banner ── */}
      <div className={`eating-banner${!todayHasAnyFood ? ' eating-banner--empty' : ''}`}>
        <div className="eating-banner-label">Today's Eating</div>
        <div className="eating-banner-stats">
          {[
            { key: 'calories', label: 'Calories', unit: 'kcal', dp: 0 },
            { key: 'protein',  label: 'Protein',  unit: 'g',    dp: 1 },
            { key: 'carbs',    label: 'Carbs',    unit: 'g',    dp: 1 },
            { key: 'fat',      label: 'Fat',       unit: 'g',    dp: 1 },
          ].map(({ key, label, unit, dp }) => {
            const v = todayNutrition[key];
            return (
              <div key={key} className="eating-stat">
                <strong>{v !== null ? (dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp)) : '—'}</strong>
                <span>{label}{v !== null ? <em> {unit}</em> : ''}</span>
              </div>
            );
          })}
        </div>
        {!todayHasAnyFood && (
          <div className="eating-banner-cta">No food logged today — remember to eat! 🥗</div>
        )}
      </div>

      <section className="dashboard-analytics">
        <div className="date-controls">
          <label>Start: <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label>End: <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          <button onClick={() => {
            const d = new Date();
            const s = new Date(); s.setDate(d.getDate() - 30);
            setStartDate(formatDate(s)); setEndDate(formatDate(d));
          }}>Last 30 days</button>
          <button
            className="reset-order-btn"
            title="Reset card order"
            onClick={() => {
              setStatOrder([]);
              persistDashboardPrefs(hiddenTypes, []);
            }}
          >↺ Reset layout</button>
        </div>

        <div className="summary-cards-wrapper">
          {(() => {
            let lastGroup = null;
            return orderedVisible.flatMap(t => {
              const meta = typeMeta[t];
              const group = meta?.group || 'Extra Nutritional Info';
              const label = meta?.label || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const unit = meta?.unit || '';
              const gapFilled = fillGaps(seriesFor(t), startDate, endDate);
              const hasChartData = gapFilled.filter(p => p.value !== null).length > 1;
              const isDragOver = dragOver === t;
              const items = [];
              if (group !== lastGroup) {
                lastGroup = group;
                items.push(
                  <div key={`group-header-${group}`} className="metric-group-header">{group}</div>
                );
              }
              items.push(
              <div
                key={t}
                className={`stat-card${isDragOver ? ' drag-over' : ''}`}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragSrc.current = t; }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== t) setDragOver(t); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                onDrop={e => { e.preventDefault(); handleDrop(t); }}
                onDragEnd={() => { dragSrc.current = null; setDragOver(null); }}
                onClick={e => { if (!e.target.closest('.stat-remove-btn')) setExpandedType(t); }}
              >
                <button
                  className="stat-remove-btn"
                  title="Hide this metric"
                  onClick={e => { e.stopPropagation(); hideType(t); }}
                >×</button>
                <div className="stat-title">{label}</div>
                {statsMap[t] ? (
                  <div className="stat-values">
                    <div><strong>Latest:</strong> {statsMap[t].latest} {unit}</div>
                    <div><strong>Avg:</strong> {statsMap[t].avg.toFixed(1)} {unit}</div>
                    <div><strong>Min:</strong> {statsMap[t].min} {unit}</div>
                    <div><strong>Max:</strong> {statsMap[t].max} {unit}</div>
                  </div>
                ) : (
                  <div className="stat-empty">No data</div>
                )}
                {hasChartData && (
                  <div className="mini-chart">
                    <ResponsiveContainer width="100%" height={90}>
                      <LineChart data={gapFilled}>
                        <XAxis dataKey="dateLabel" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip formatter={v => [`${typeof v === 'number' ? v.toFixed(1) : v} ${unit}`, label]} contentStyle={{ background: '#fff', border: '1px solid #ccd', borderRadius: 6 }} itemStyle={{ color: '#000' }} labelStyle={{ color: '#000' }} />
                        <Line type="monotone" dataKey="value" stroke="#6ee7ff" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              );
              return items;
            });
          })()}
        </div>
      </section>

      {/* Expanded metric modal */}
      {expandedType && (() => {
        const t = expandedType;
        const meta = typeMeta[t];
        const label = meta?.label || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const unit = meta?.unit || '';
        const allData = seriesFor(t);
        const rangeData = fillGaps(allData, startDate, endDate);
        const s = statsMap[t];
        return (
          <div className="modal-overlay" onClick={() => setExpandedType(null)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setExpandedType(null)}>×</button>
              <h3 className="modal-title">{label} {unit ? <span className="modal-unit">({unit})</span> : null}</h3>
              {s && (
                <div className="modal-stats-row">
                  <div className="modal-stat"><span>Latest</span><strong>{s.latest} {unit}</strong></div>
                  <div className="modal-stat"><span>Average</span><strong>{s.avg.toFixed(2)} {unit}</strong></div>
                  <div className="modal-stat"><span>Min</span><strong>{s.min} {unit}</strong></div>
                  <div className="modal-stat"><span>Max</span><strong>{s.max} {unit}</strong></div>
                  <div className="modal-stat"><span>Data points</span><strong>{s.count}</strong></div>
                </div>
              )}
              {rangeData.filter(p => p.value !== null).length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={rangeData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,180,255,0.15)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: '#9ab', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ab', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => typeof v === 'number' ? rd(v) : v} />
                    <Tooltip formatter={v => [`${typeof v === 'number' ? v.toFixed(2) : v} ${unit}`, label]} contentStyle={{ background: '#fff', border: '1px solid #ccd', borderRadius: 6 }} itemStyle={{ color: '#000' }} labelStyle={{ color: '#000' }} />
                    <Line type="monotone" dataKey="value" stroke="#6ee7ff" dot={{ r: 2, fill: '#6ee7ff' }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ab', marginTop: 16 }}>Not enough data in selected range.</p>
              )}
              <div className="modal-data-table">
                <table>
                  <thead><tr><th>Date</th><th>Value</th></tr></thead>
                  <tbody>
                    {[...rangeData].reverse().filter(p => p.value !== null).slice(0, 50).map((row, i) => (
                      <tr key={i}>
                        <td>{row.dateLabel}</td>
                        <td>{typeof row.value === 'number' ? row.value.toFixed(2) : row.value} {unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add metrics picker modal */}
      {addPickerOpen && (
        <div className="modal-overlay" onClick={() => setAddPickerOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddPickerOpen(false)}>×</button>
            <h3 className="modal-title">Add Metrics</h3>
            {[...hiddenTypes].filter(t => !PERMANENTLY_HIDDEN.has(t)).length === 0 ? (
              <p style={{ color: '#9ab' }}>No hidden metrics. Remove a card with × to hide it.</p>
            ) : (
              <div className="picker-grid">
                {[...hiddenTypes].filter(t => !PERMANENTLY_HIDDEN.has(t)).map(t => {
                  const meta = typeMeta[t];
                  const label = meta?.label || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <button key={t} className="picker-btn" onClick={() => showType(t)}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Uploaded files */}
      <section className="imports-section">
        <h3>Uploaded Files</h3>
        {imports.length === 0 ? (
          <p className="muted">No files imported yet.</p>
        ) : (
          <table className="imports-table">
            <thead>
              <tr><th>File</th><th>Imported</th><th>Records</th><th></th></tr>
            </thead>
            <tbody>
              {imports.map(imp => (
                <tr key={imp.id}>
                  <td>{imp.filename}</td>
                  <td>{new Date(imp.imported_at).toLocaleString()}</td>
                  <td>{imp.record_count}</td>
                  <td>
                    <button className="import-delete-btn" onClick={() => deleteImport(imp.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Remove all uploads — 2-step confirmation */}
      <div className="remove-all-wrap">
        {!deleteAllConfirm ? (
          <button
            className="remove-all-btn"
            onClick={() => setDeleteAllConfirm(true)}
          >
            Remove All Uploaded Files
          </button>
        ) : (
          <div className="remove-all-confirm">
            <span className="remove-all-warning">This will permanently delete all imports and health data. Are you sure?</span>
            <button className="remove-all-btn remove-all-btn--danger" onClick={deleteAllImports}>
              Yes, Delete Everything
            </button>
            <button className="remove-all-btn--cancel" onClick={() => setDeleteAllConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthPage;