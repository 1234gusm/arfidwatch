import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './SharePage.css';
import API_BASE from './apiBase';
import { avgOf, latestOf, minOf, maxOf, countOf } from './utils/metricUtils';

// ── Type helpers ──────────────────────────────────────────────────────────────
const canonical = t => {
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};

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
  'vo2_max_mlkg_min':       'vo2_max_mlkgmin',
  // heart
  'resting_heart_rate':     'resting_heart_rate_countmin',
};

function buildMaps(rows) {
  const maps = {};
  rows.forEach(({ type, value, timestamp }) => {
    const raw = canonical(type);
    const ct  = TYPE_ALIASES[raw] || raw;
    const v   = parseFloat(value);
    if (!Number.isFinite(v)) return;
    const day = String(timestamp || '').slice(0, 10);
    if (!day) return;
    if (!maps[ct]) maps[ct] = {};
    maps[ct][day] = maps[ct][day] !== undefined ? Math.max(maps[ct][day], v) : v;
  });
  return maps;
}

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
      { keys: ['folate_mcg', 'folic_acid_mcg'],                       label: 'Folate',        unit: 'mcg',  dp: 0, mode: 'avg' },
      { keys: ['caffeine_mg', 'caffeine'],                            label: 'Caffeine',      unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['water_fl_oz_us', 'water'],                            label: 'Water',         unit: 'fl oz',dp: 1, mode: 'avg' },
    ],
  },
  {
    id: 'body',
    title: 'Body & Weight',
    defaultOpen: true,
    metrics: [
      { keys: ['weight_lb', 'weight_lb', 'weight'],                  label: 'Weight',        unit: 'lb',   dp: 1, mode: 'latest' },
      { keys: ['weight_kg'],                                          label: 'Weight',        unit: 'kg',   dp: 1, mode: 'latest' },
      { keys: ['body_fat_percentage__', 'body_fat'],                  label: 'Body Fat',      unit: '%',    dp: 1, mode: 'latest' },
      { keys: ['lean_body_mass_lb', 'lean_mass'],                     label: 'Lean Mass',     unit: 'lb',   dp: 1, mode: 'latest' },
      { keys: ['body_mass_index_count'],                              label: 'BMI',           unit: '',     dp: 1, mode: 'avg' },
      { keys: ['waist_circumference_in'],                             label: 'Waist',         unit: 'in',   dp: 1, mode: 'latest' },
      { keys: ['resting_heart_rate_countmin'],                        label: 'Resting HR',    unit: 'bpm',  dp: 0, mode: 'avg' },
      { keys: ['heart_rate_avg_countmin'],                            label: 'Avg HR',        unit: 'bpm',  dp: 0, mode: 'avg' },
      { keys: ['heart_rate_variability_ms'],                          label: 'HRV',           unit: 'ms',   dp: 1, mode: 'avg' },
      { keys: ['blood_oxygen_saturation__'],                          label: 'Blood O\u2082', unit: '%',    dp: 1, mode: 'avg' },
      { keys: ['blood_pressure_systolic_mmhg'],                       label: 'Systolic BP',   unit: 'mmHg', dp: 0, mode: 'avg' },
      { keys: ['blood_pressure_diastolic_mmhg'],                      label: 'Diastolic BP',  unit: 'mmHg', dp: 0, mode: 'avg' },
      { keys: ['blood_glucose_mgdl'],                                 label: 'Blood Glucose', unit: 'mg/dL',dp: 0, mode: 'avg' },
      { keys: ['body_temperature_degf'],                              label: 'Body Temp',     unit: '\u00b0F', dp: 1, mode: 'avg' },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    defaultOpen: true,
    metrics: [
      { keys: ['step_count_count', 'steps'],                          label: 'Steps',          unit: '',           dp: 0, mode: 'avg' },
      { keys: ['exercise_time_min'],                                  label: 'Exercise Time',  unit: 'min',        dp: 0, mode: 'avg' },
      { keys: ['active_energy_kcal'],                                 label: 'Active Energy',  unit: 'kcal',       dp: 0, mode: 'avg' },
      { keys: ['resting_energy_kcal'],                                label: 'Resting Energy', unit: 'kcal',       dp: 0, mode: 'avg' },
      { keys: ['walking___running_distance_mi'],                      label: 'Walk+Run Dist.', unit: 'mi',         dp: 2, mode: 'avg' },
      { keys: ['flights_climbed_count'],                              label: 'Flights Climbed',unit: '',           dp: 0, mode: 'avg' },
      { keys: ['stand_time_min'],                                     label: 'Stand Time',     unit: 'min',        dp: 0, mode: 'avg' },
      { keys: ['vo2_max_mlkgmin'],                                    label: 'VO\u2082 Max',   unit: 'ml/kg/min',  dp: 1, mode: 'avg' },
      { keys: ['expenditure', 'energy_expenditure'],                  label: 'Expenditure',    unit: 'kcal',       dp: 0, mode: 'avg' },
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    defaultOpen: true,
    metrics: [
      { keys: ['sleep_analysis_total_sleep_hr'],                      label: 'Total Sleep',   unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_asleep_hr'],                           label: 'Asleep',        unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_in_bed_hr'],                           label: 'In Bed',        unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_core_hr'],                             label: 'Core Sleep',    unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_rem_hr'],                              label: 'REM Sleep',     unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_deep_hr'],                             label: 'Deep Sleep',    unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['sleep_analysis_awake_hr'],                            label: 'Awake (sleep)', unit: 'hr',   dp: 1, mode: 'avg' },
      { keys: ['respiratory_rate_countmin'],                          label: 'Resp. Rate',    unit: '/min', dp: 1, mode: 'avg' },
      { keys: ['breathing_disturbances_count'],                       label: 'Breathing Dist.',unit: '',    dp: 0, mode: 'avg' },
      { keys: ['sleeping_wrist_temperature_degf'],                    label: 'Wrist Temp',    unit: '\u00b0F', dp: 1, mode: 'avg' },
    ],
  },
];

const MOOD_LABEL = { 1: 'Very Bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
const MOOD_COLOR = { 1: '#c0392b', 2: '#e67e22', 3: '#f1c40f', 4: '#27ae60', 5: '#2ecc71' };
const PERIOD_LABEL = { today: 'Today', week: 'Last 7 days', month: 'Last 30 days', custom: 'Custom' };

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
  const [activeTab,  setActiveTab]  = useState('overview');

  useEffect(() => {
    fetch(`${API_BASE}/api/share/${shareToken}`)
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

  const doUnlock = async (code, autoUnlock = false) => {
    setUnlocking(true); setErrMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/share/${shareToken}/unlock`, {
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
      const dr = await fetch(`${API_BASE}/api/share/${shareToken}/data`, {
        headers: { Authorization: `Bearer ${d.token}` },
      });
      const dd = await dr.json();
      if (!dr.ok) { setErrMsg(dd.error || 'Failed to load data.'); setUnlocking(false); return; }
      setHealthInfo(dd);
      setPhase('data');
    } catch {
      setErrMsg('Error loading data.');
    } finally {
      setUnlocking(false);
    }
  };

  if (phase === 'loading') return <div className="share-page"><div className="share-spinner">Loading\u2026</div></div>;

  if (phase === 'error') return (
    <div className="share-page">
      <div className="share-not-found">
        <div className="share-logo-mark">ArfidWatch</div>
        <p>{errMsg || 'This share link is invalid or has been removed.'}</p>
      </div>
    </div>
  );

  if (phase === 'passcode') return (
    <div className="share-page">
      <div className="share-unlock-card">
        <div className="share-logo-mark">ArfidWatch</div>
        <h2>Health Summary</h2>
        <p className="share-unlock-sub">
          <strong>{meta?.username}</strong> has shared their health data with you.
          Enter the passcode to view.
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
          {unlocking ? 'Verifying\u2026' : 'View Health Summary'}
        </button>
      </div>
    </div>
  );

  // ── Data view ────────────────────────────────────────────────────────────────
  const maps         = buildMaps(healthInfo?.data || []);
  const journal      = healthInfo?.journal || [];
  const foodLog      = healthInfo?.food_log || [];
  const medications  = healthInfo?.medications || [];
  const periodLabel  = PERIOD_LABEL[healthInfo?.export_period] || healthInfo?.export_period;

  // Build daily macro data from health maps
  const macroDays = (() => {
    const allDays = new Set();
    ['dietary_energy_kcal', 'protein_g', 'carbohydrates_g', 'total_fat_g'].forEach(ct => {
      if (maps[ct]) Object.keys(maps[ct]).forEach(d => allDays.add(d));
    });
    return [...allDays].sort().reverse().map(date => ({
      date,
      kcal:    maps['dietary_energy_kcal']?.[date],
      protein: maps['protein_g']?.[date],
      carbs:   maps['carbohydrates_g']?.[date],
      fat:     maps['total_fat_g']?.[date],
    }));
  })();

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
    'sleep_analysis_awake_hr', 'respiratory_rate_countmin',
    'breathing_disturbances_count', 'sleeping_wrist_temperature_degf',
  ];
  const sleepDays = (() => {
    const allDays = new Set();
    SLEEP_KEYS.forEach(k => { if (maps[k]) Object.keys(maps[k]).forEach(d => allDays.add(d)); });
    return [...allDays].sort().reverse().map(date => ({
      date,
      total:   maps['sleep_analysis_total_sleep_hr']?.[date],
      asleep:  maps['sleep_analysis_asleep_hr']?.[date],
      inBed:   maps['sleep_analysis_in_bed_hr']?.[date],
      core:    maps['sleep_analysis_core_hr']?.[date],
      rem:     maps['sleep_analysis_rem_hr']?.[date],
      deep:    maps['sleep_analysis_deep_hr']?.[date],
      awake:   maps['sleep_analysis_awake_hr']?.[date],
      respRate: maps['respiratory_rate_countmin']?.[date],
      breathDist: maps['breathing_disturbances_count']?.[date],
      wristTemp: maps['sleeping_wrist_temperature_degf']?.[date],
    }));
  })();

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
        <table className="share-table">
          <tbody>
            {rows.map(row => (
              <tr key={row.label + row.unit}>
                <td className="share-metric-name">{row.label}</td>
                <td className="share-metric-value">
                  <>{fmt(row.v, row.dp)}{row.unit && <span className="share-metric-unit"> {row.unit}</span>}</>
                </td>
                <td className="share-metric-range">
                  {row.mode === 'avg'
                    ? (row.days > 1 && row.lo !== null && row.hi !== null
                        ? `${fmt(row.lo, row.dp)}\u2013${fmt(row.hi, row.dp)} ${row.unit} \u00b7 ${row.days}d`
                        : `avg \u00b7 ${row.days}d`)
                    : 'latest'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          </div>
          <div className="share-period">
            Averages&nbsp;&middot;&nbsp;{periodLabel}&nbsp;&middot;&nbsp;{healthInfo.start}&nbsp;&ndash;&nbsp;{healthInfo.end}
          </div>
          {(() => {
            const avgCals    = maps['dietary_energy_kcal'] ? avgOf(maps['dietary_energy_kcal']) : null;
            const avgProtein = maps['protein_g'] ? avgOf(maps['protein_g']) : null;
            const avgCarbs   = maps['carbohydrates_g'] ? avgOf(maps['carbohydrates_g']) : null;
            const avgFat     = maps['total_fat_g'] ? avgOf(maps['total_fat_g']) : null;
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
        </div>

        {/* Tabs */}
        <div className="share-tabs">
          <button
            className={`share-tab${activeTab === 'overview' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >Overview</button>
          <button
            className={`share-tab${activeTab === 'daily' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >Daily Nutrients{macroDays.length > 0 ? ` (${macroDays.length})` : ''}</button>
          <button
            className={`share-tab${activeTab === 'sleep' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('sleep')}
          >Sleep{sleepDays.length > 0 ? ` (${sleepDays.length})` : ''}</button>
          <button
            className={`share-tab${activeTab === 'log' ? ' share-tab--active' : ''}`}
            onClick={() => setActiveTab('log')}
          >Food/Journal/Medications</button>
        </div>

        {activeTab === 'overview' && <>
        {/* Nutrition section only */}
        {renderMetricSection(SECTIONS[0])}
        <p className="share-disclaimer">Vitamin info does not include medication stats.</p>
        </>}

        {activeTab === 'log' && <>
        {/* Food Log */}
        {foodLog.length > 0 && (() => {
          const grouped = groupFoodLog(foodLog);
          return (
            <Section title="Food Log" badge={grouped.length + 'd'} defaultOpen={true}>
              <div className="share-foodlog-list">
                {grouped.map(({ date, meals }) => (
                  <div key={date} className="share-foodlog-day">
                    <div className="share-foodlog-date">{localDateStr(date)}</div>
                    {meals.map(({ meal, items }) => (
                      <div key={meal} className="share-foodlog-meal">
                        <div className="share-foodlog-meal-name">{meal}</div>
                        <table className="share-table share-foodlog-table">
                          <tbody>
                            {items.map((item, i) => (
                              <tr key={i}>
                                <td className="share-foodlog-food">{item.food_name}</td>
                                <td className="share-foodlog-qty">{item.quantity}</td>
                                <td className="share-foodlog-cals">
                                  {item.calories != null ? `${Math.round(item.calories)} kcal` : ''}
                                </td>
                                <td className="share-foodlog-macros">
                                  {[
                                    item.protein_g != null ? `P ${Math.round(item.protein_g)}g` : null,
                                    item.carbs_g   != null ? `C ${Math.round(item.carbs_g)}g`   : null,
                                    item.fat_g     != null ? `F ${Math.round(item.fat_g)}g`     : null,
                                  ].filter(Boolean).join(' \u00b7 ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          );
        })()}

        {/* Journal */}
        <Section title="Journal" badge={journal.length} defaultOpen={true}>
          {journal.length === 0 ? (
            <p className="share-empty">No journal entries for this period.</p>
          ) : (
            <div className="share-journal-list">
              {journal.map((e, i) => (
                <div key={i} className="share-journal-entry">
                  <div className="share-journal-header">
                    <span className="share-journal-date">{localDateStr(e.date)}</span>
                    {e.mood && (
                      <span
                        className="share-journal-mood"
                        style={{ color: MOOD_COLOR[e.mood] }}
                      >
                        {MOOD_LABEL[e.mood]}
                      </span>
                    )}
                  </div>
                  {e.title && <div className="share-journal-title">{e.title}</div>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Medications */}
        {medications.length > 0 && (() => {
          const grouped = groupMedications(medications);
          return (
            <Section title="Medications" badge={grouped.length + 'd'} defaultOpen={true}>
              <div className="share-foodlog-list">
                {grouped.map(({ date, items }) => (
                  <div key={date} className="share-foodlog-day">
                    <div className="share-foodlog-date">{localDateStr(date)}</div>
                    <table className="share-table share-foodlog-table">
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i}>
                            <td className="share-foodlog-food">{item.medication_name}</td>
                            <td className="share-foodlog-qty">{item.dosage || ''}</td>
                            <td className="share-foodlog-cals">{item.time || ''}</td>
                            <td className="share-foodlog-macros">{item.notes || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Section>
          );
        })()}
        </>}

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
                        {d.kcal != null && (
                          <span className="share-daily-cals">{Math.round(d.kcal).toLocaleString()} kcal</span>
                        )}
                      </div>
                      <div className="share-daily-chips">
                        {[
                          { val: d.kcal,    label: 'Calories', unit: 'kcal', dp: 0 },
                          { val: d.protein,  label: 'Protein',  unit: 'g',    dp: 1 },
                          { val: d.carbs,    label: 'Carbs',    unit: 'g',    dp: 1 },
                          { val: d.fat,      label: 'Fat',      unit: 'g',    dp: 1 },
                        ].map(m => (
                          <div key={m.label} className={`share-daily-chip${m.val == null ? ' share-daily-chip--empty' : ''}`}>
                            <strong>{m.val != null ? (m.dp === 0 ? Math.round(m.val).toLocaleString() : m.val.toFixed(m.dp)) + ' ' + m.unit : '\u2014'}</strong>
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

        {/* ── Sleep tab ── */}
        {activeTab === 'sleep' && (
          <div className="share-daily-tab">
            {sleepDays.length === 0 ? (
              <p className="share-empty">No sleep data for this period.</p>
            ) : (
              <div className="share-daily-list">
                {sleepDays.map(d => {
                  const stages = sleepStageBar(d);
                  return (
                    <div key={d.date} className="share-daily-card share-sleep-card">
                      <div className="share-daily-header">
                        <span className="share-daily-date">{localDateStr(d.date)}</span>
                        {d.total != null && (
                          <span className="share-sleep-total">{d.total.toFixed(1)} hr total</span>
                        )}
                      </div>
                      <div className="share-daily-chips">
                        {[
                          { val: d.total,  label: 'Total',  unit: 'hr' },
                          { val: d.inBed,  label: 'In Bed', unit: 'hr' },
                          { val: d.core,   label: 'Core',   unit: 'hr' },
                          { val: d.rem,    label: 'REM',    unit: 'hr' },
                          { val: d.deep,   label: 'Deep',   unit: 'hr' },
                          { val: d.awake,  label: 'Awake',  unit: 'hr' },
                        ].map(m => (
                          <div key={m.label} className={`share-daily-chip share-sleep-chip${m.val == null ? ' share-daily-chip--empty' : ''}`}>
                            <strong>{m.val != null ? m.val.toFixed(1) + ' ' + m.unit : '\u2014'}</strong>
                            <span>{m.label}</span>
                          </div>
                        ))}
                      </div>
                      {stages && (
                        <div className="share-daily-bar-wrap">
                          <div className="share-daily-bar share-sleep-bar">
                            <div className="share-sleep-bar-core" style={{ width: stages.core + '%' }} />
                            <div className="share-sleep-bar-rem" style={{ width: stages.rem + '%' }} />
                            <div className="share-sleep-bar-deep" style={{ width: stages.deep + '%' }} />
                            <div className="share-sleep-bar-awake" style={{ width: stages.awake + '%' }} />
                          </div>
                          <span className="share-daily-bar-legend">
                            <em style={{ color: '#5b8fd9' }}>Core {stages.core}%</em>
                            <em style={{ color: '#7c4dff' }}>REM {stages.rem}%</em>
                            <em style={{ color: '#1a237e' }}>Deep {stages.deep}%</em>
                            <em style={{ color: '#ff8a65' }}>Awake {stages.awake}%</em>
                          </span>
                        </div>
                      )}
                      {(d.respRate != null || d.breathDist != null || d.wristTemp != null) && (
                        <div className="share-sleep-extras">
                          {d.respRate != null && <span className="share-sleep-extra">Resp. Rate: <strong>{d.respRate.toFixed(1)}/min</strong></span>}
                          {d.breathDist != null && <span className="share-sleep-extra">Breathing Dist: <strong>{Math.round(d.breathDist)}</strong></span>}
                          {d.wristTemp != null && <span className="share-sleep-extra">Wrist Temp: <strong>{d.wristTemp.toFixed(1)}\u00b0F</strong></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="share-footer">
          ArfidWatch &mdash; read-only view &mdash; {periodLabel.toLowerCase()}
        </p>
      </div>
    </div>
  );
}

export default SharePage;
