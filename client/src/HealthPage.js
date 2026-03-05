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

function HealthPage({ token }) {
  const [data, setData] = useState([]);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('apiUrl') || '');
  const [imports, setImports] = useState([]);
  const [hiddenTypes, setHiddenTypes] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hiddenHealthTypes') || '[]')); }
    catch { return new Set(); }
  });
  const [expandedType, setExpandedType] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [statOrder, setStatOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('statOrder') || '[]'); }
    catch { return []; }
  });
  const [dragOver, setDragOver] = useState(null);
  const dragSrc = useRef(null);

  // date range for charts (YYYY-MM-DD)
  const formatDate = d => d.toISOString().slice(0,10);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [startDate, setStartDate] = useState(formatDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(new Date()));

  const fetchData = async () => {
    const res = await fetch(`${API_BASE}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setData(json.data || []);
  };

  const fetchImports = async () => {
    const res = await fetch(`${API_BASE}/api/health/imports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setImports(json.imports || []);
  };

  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const deleteImport = async (id) => {
    if (!window.confirm('Delete this import and all its data?')) return;
    await fetch(`${API_BASE}/api/health/imports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
    fetchImports();
  };

  const deleteAllImports = async () => {
    await fetch(`${API_BASE}/api/health/imports`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleteAllConfirm(false);
    fetchData();
    fetchImports();
  };

  const hideType = (t) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.add(t);
      localStorage.setItem('hiddenHealthTypes', JSON.stringify([...next]));
      return next;
    });
  };

  const showType = (t) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.delete(t);
      localStorage.setItem('hiddenHealthTypes', JSON.stringify([...next]));
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
        const res = await fetch(`${API_BASE}/api/health/macro/import`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) { alert('Failed to import MacroFactor file: ' + await res.text()); return; }
        const r = await res.json();
        const label = r.isFoodLogFile ? 'food log entries' : 'MacroFactor records';
        alert(buildImportAlertMessage({ ...r, label }));
        fetchData(); fetchImports();
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

    // Health Auto Export headers often include spaces/quotes (e.g. "Source Name", "Start Date").
    const isHealthAutoExport = /(source\s*name|start\s*date|end\s*date|creation\s*date)/i.test(firstLine);
    const isAutoSleepCsv = /(autosleep|time\s*asleep|total\s*sleep|deep\s*sleep|sleep\s*bank|sleep\s*quality|time\s*in\s*bed|\basleep\b.*\bawake\b|\bawake\b.*\basleep\b)/i.test(firstLine);
    if (isHealthAutoExport) {
      // Health Auto Export CSV
      try {
        const res = await fetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ csv: text, filename: file.name }),
        });
        if (!res.ok) { alert('Failed to import CSV: ' + await res.text()); return; }
        const r = await res.json();
        alert(buildImportAlertMessage({ ...r, label: 'health records' }));
        fetchData(); fetchImports();
      } catch (err) {
        console.error('CSV import error:', err);
        alert('Error importing CSV');
      }
      return;
    }

    if (isAutoSleepCsv) {
      // AutoSleep CSV maps into canonical sleep metrics server-side.
      try {
        const res = await fetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ csv: text, filename: file.name }),
        });
        if (!res.ok) { alert('Failed to import AutoSleep CSV: ' + await res.text()); return; }
        const r = await res.json();
        alert(buildImportAlertMessage({ ...r, label: 'sleep records' }));
        fetchData(); fetchImports();
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
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) { alert('Failed to import MacroFactor file: ' + await res.text()); return; }
      const r = await res.json();
      const label = r.isFoodLogFile ? 'food log entries' : 'MacroFactor records';
      alert(buildImportAlertMessage({ ...r, label }));
      fetchData(); fetchImports();
    } catch (err) {
      console.error('MacroFactor import error:', err);
      alert('Error importing MacroFactor CSV');
    }
  };

  const handleFetchFromApi = async () => {
    if (!apiUrl) return;
    try {
      const resp = await fetch(apiUrl);
      const text = await resp.text();
      const samples = JSON.parse(text);
      await fetch(`${API_BASE}/api/health/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ samples }),
      });
      fetchData();
    } catch (err) {
      alert('failed to fetch from url');
    }
  };

  // helpers: normalize numeric value
  const toNum = v => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return v;
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const groupStats = (items) => {
    const vals = items.map(i => toNum(i.value)).filter(n => !Number.isNaN(n));
    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      count: vals.length,
      avg: sum / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      latest: vals[vals.length - 1],
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
    environmental_audio_exposure_dbaspl: { label: 'Environmental Audio', unit: 'dB', group: 'Other' },
    headphone_audio_exposure_dbaspl: { label: 'Headphone Audio', unit: 'dB', group: 'Other' },
    time_in_daylight_min: { label: 'Time in Daylight', unit: 'min', group: 'Other' },
    walking_speed_mihr: { label: 'Walking Speed', unit: 'mph', group: 'Other' },
    walking_step_length_in: { label: 'Step Length', unit: 'in', group: 'Other' },
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
  };

  // Resolve a raw type key to its canonical key (or itself if no alias)
  const canonical = t => typeAliases[t] || t;

  // Auto-discover all unique canonical types from the actual imported data
  const allTypes = [...new Set(data.map(d => canonical(d.type)))].filter(Boolean);

  // Types to show: those that have at least one numeric value across all aliased sources
  const typesOfInterest = allTypes.filter(t => {
    return data.some(d => canonical(d.type) === t && Number.isFinite(parseFloat(d.value)));
  });

  // Group order for display — priority groups first
  const groupOrder = ['Nutrition', 'Body', 'Activity', 'Sleep', 'Heart', 'Vitals', 'Other'];

  // Within-group sort priority — lower number = shown first
  const typePriority = {
    dietary_energy_kcal: 0,
    protein_g:           1,
    carbohydrates_g:     2,
    total_fat_g:         3,
    weight_lb:           0,
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
        const dateKey = new Date(d.timestamp).toISOString().slice(0, 10);
        if (byDate[dateKey] === undefined || v > byDate[dateKey].value) {
          byDate[dateKey] = {
            date: new Date(d.timestamp),
            dateLabel: dateKey,
            value: v,
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
      const key = cur.toISOString().slice(0, 10);
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
    if (token) { fetchData(); fetchImports(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // auto-sync when API url provided
  useEffect(() => {
    if (!apiUrl || !token) return;
    const interval = setInterval(() => {
      handleFetchFromApi();
    }, 1000 * 60 * 60); // hourly
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, token]);

  // Early return for unauthenticated users (after all hooks)
  if (!token) {
    return <div style={{padding: '20px', textAlign:'center'}}>Please log in</div>;
  }

  // ── Today's nutrition summary ──────────────────────────────────────────
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const todayNutrition = (() => {
    const NUTRITION_KEYS = [
      { canonical: 'dietary_energy_kcal', label: 'Calories', unit: 'kcal', key: 'calories' },
      { canonical: 'protein_g',           label: 'Protein',  unit: 'g',    key: 'protein'  },
      { canonical: 'carbohydrates_g',     label: 'Carbs',    unit: 'g',    key: 'carbs'    },
      { canonical: 'total_fat_g',         label: 'Fat',      unit: 'g',    key: 'fat'      },
    ];
    const result = {};
    NUTRITION_KEYS.forEach(({ canonical: ct, key }) => {
      const vals = data
        .filter(d => canonical(d.type) === ct)
        .map(d => ({ v: toNum(d.value), day: String(d.timestamp).slice(0,10) }))
        .filter(x => x.day === todayKey && Number.isFinite(x.v));
      result[key] = vals.length ? Math.max(...vals.map(x => x.v)) : null;
    });
    return result;
  })();
  const todayHasAnyFood = Object.values(todayNutrition).some(v => v !== null);

  // Build the current display order of all visible types, respecting saved statOrder.
  const orderedVisible = (() => {
    const seen = new Set();
    const result = [];
    // First, place types that are in statOrder (preserving saved positions).
    statOrder.forEach(t => {
      if (!hiddenTypes.has(t) && typesOfInterest.includes(t)) {
        result.push(t);
        seen.add(t);
      }
    });
    // Then append any new types (not yet in statOrder) sorted by group/priority.
    typesOfInterest
      .filter(t => !hiddenTypes.has(t) && !seen.has(t))
      .sort((a, b) => {
        const ga = groupOrder.indexOf(typeMeta[a]?.group || 'Other');
        const gb = groupOrder.indexOf(typeMeta[b]?.group || 'Other');
        if (ga !== gb) return ga - gb;
        return (typePriority[a] ?? 99) - (typePriority[b] ?? 99);
      })
      .forEach(t => result.push(t));
    return result;
  })();

  const handleDrop = (targetType) => {
    const src = dragSrc.current;
    if (!src || src === targetType) { setDragOver(null); return; }
    setStatOrder(prev => {
      const current = [
        ...prev.filter(t => !hiddenTypes.has(t) && typesOfInterest.includes(t)),
        ...typesOfInterest.filter(t => !hiddenTypes.has(t) && !prev.includes(t)),
      ];
      const from = current.indexOf(src);
      const to = current.indexOf(targetType);
      if (from === -1 || to === -1) return prev;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, src);
      localStorage.setItem('statOrder', JSON.stringify(next));
      return next;
    });
    dragSrc.current = null;
    setDragOver(null);
  };

  return (
    <div className="health-page">
      <div className="health-page-header">
        <h2>Health Dashboard</h2>
        <button className="add-metrics-btn" title="Add hidden metrics back" onClick={() => setAddPickerOpen(true)}>＋</button>
      </div>

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

      {/* Import controls */}
      <div className="import-controls">
        <div className="import-block">
          <span className="import-label">Import File</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUnifiedUpload} />
        </div>
        <div className="import-block">
          <span className="import-label">Health Auto Export API URL</span>
          <input
            type="text"
            placeholder="https://example.com/health.json"
            value={apiUrl}
            onChange={e => { setApiUrl(e.target.value); localStorage.setItem('apiUrl', e.target.value); }}
            className="api-url-input"
          />
          <button onClick={handleFetchFromApi}>Fetch</button>
        </div>
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
            onClick={() => { localStorage.removeItem('statOrder'); setStatOrder([]); }}
          >↺ Reset layout</button>
        </div>

        <div className="summary-cards-wrapper">
          {orderedVisible.map(t => {
            const meta = typeMeta[t];
            const label = meta?.label || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const unit = meta?.unit || '';
            const gapFilled = fillGaps(seriesFor(t), startDate, endDate);
            const hasChartData = gapFilled.filter(p => p.value !== null).length > 1;
            const isDragOver = dragOver === t;
            return (
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
          })}
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
                    <YAxis tick={{ fill: '#9ab', fontSize: 11 }} domain={['auto', 'auto']} />
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
            {[...hiddenTypes].length === 0 ? (
              <p style={{ color: '#9ab' }}>No hidden metrics. Remove a card with × to hide it.</p>
            ) : (
              <div className="picker-grid">
                {[...hiddenTypes].map(t => {
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