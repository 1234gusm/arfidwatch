import React, { useState, useCallback, useEffect } from 'react';
import './ExportPage.css';
import API_BASE from './apiBase';
import { localToday, localOffset, localMonthAgo } from './utils/dateUtils';
import { avgOf, latestOf, totalOf, minOf, maxOf, daysOf, fmt } from './utils/metricUtils';

// ── Type system (mirrors pdf.js) ───────────────────────────────────────────────
const TYPE_ALIASES = {
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
  macrofactor_weight_kg:          'weight_lb',
  macrofactor_body_fat:           'body_fat_percentage__',
  macrofactor_lean_mass:          'lean_body_mass_lb',
  macrofactor_steps:              'step_count_count',
  macrofactor_expenditure:        'active_energy_kcal',
  macrofactor_energy_expenditure: 'active_energy_kcal',
};
const canonical = t => {
  if (!t) return t;
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  if (String(t).startsWith('macrofactor_')) return String(t).slice('macrofactor_'.length);
  return t;
};

const TYPE_META = {
  dietary_energy_kcal:           { label: 'Calories',      unit: 'kcal',     dp: 0 },
  protein_g:                     { label: 'Protein',       unit: 'g',        dp: 1 },
  carbohydrates_g:               { label: 'Carbs',         unit: 'g',        dp: 1 },
  total_fat_g:                   { label: 'Fat',           unit: 'g',        dp: 1 },
  fiber_g:                       { label: 'Fiber',         unit: 'g',        dp: 1 },
  sugar_g:                       { label: 'Sugar',         unit: 'g',        dp: 1 },
  sodium_mg:                     { label: 'Sodium',        unit: 'mg',       dp: 0 },
  water_fl_oz_us:                { label: 'Water',         unit: 'fl oz',    dp: 1 },
  weight_lb:                     { label: 'Weight',        unit: 'lb',       dp: 1 },
  body_fat_percentage__:         { label: 'Body Fat',      unit: '%',        dp: 1 },
  lean_body_mass_lb:             { label: 'Lean Mass',     unit: 'lb',       dp: 1 },
  body_mass_index_count:         { label: 'BMI',           unit: '',         dp: 1 },
  step_count_count:              { label: 'Steps',         unit: '',         dp: 0 },
  active_energy_kcal:            { label: 'Active Cal',    unit: 'kcal',     dp: 0 },
  resting_energy_kcal:           { label: 'Resting Cal',   unit: 'kcal',     dp: 0 },
  apple_exercise_time_min:       { label: 'Exercise',      unit: 'min',      dp: 0 },
  walking___running_distance_mi: { label: 'Distance',      unit: 'mi',       dp: 2 },
  flights_climbed_count:         { label: 'Flights',       unit: '',         dp: 0 },
  vo2_max_mlkgmin:               { label: 'VO2 Max',       unit: 'ml/kg/min',dp: 1 },
  apple_stand_time_min:          { label: 'Stand Time',    unit: 'min',      dp: 0 },
  sleep_analysis_total_sleep_hr: { label: 'Total Sleep',   unit: 'hr',       dp: 1 },
  sleep_analysis_deep_hr:        { label: 'Deep Sleep',    unit: 'hr',       dp: 1 },
  sleep_analysis_rem_hr:         { label: 'REM',           unit: 'hr',       dp: 1 },
  sleep_analysis_core_hr:        { label: 'Core',          unit: 'hr',       dp: 1 },
  sleep_analysis_in_bed_hr:      { label: 'In Bed',        unit: 'hr',       dp: 1 },
  sleep_analysis_awake_hr:       { label: 'Awake',         unit: 'hr',       dp: 1 },
  resting_heart_rate_countmin:   { label: 'Resting HR',    unit: 'bpm',      dp: 0 },
  heart_rate_avg_countmin:       { label: 'Avg HR',        unit: 'bpm',      dp: 0 },
  heart_rate_max_countmin:       { label: 'Max HR',        unit: 'bpm',      dp: 0 },
  heart_rate_variability_ms:     { label: 'HRV',           unit: 'ms',       dp: 0 },
  walking_heart_rate_average_countmin: { label: 'Walking HR', unit: 'bpm',   dp: 0 },
  blood_oxygen_saturation__:     { label: 'Blood O\u2082', unit: '%',       dp: 1 },
  blood_glucose_mgdl:            { label: 'Glucose',       unit: 'mg/dL',    dp: 1 },
  blood_pressure_systolic_mmhg:  { label: 'BP Systolic',   unit: 'mmHg',     dp: 0 },
  blood_pressure_diastolic_mmhg: { label: 'BP Diastolic',  unit: 'mmHg',     dp: 0 },
  body_temperature_degf:         { label: 'Body Temp',     unit: '\u00b0F', dp: 1 },
  time_in_daylight_min:          { label: 'Daylight',      unit: 'min',      dp: 0 },
  mindful_minutes_min:           { label: 'Mindfulness',   unit: 'min',      dp: 0 },
  respiratory_rate_countmin:     { label: 'Resp. Rate',    unit: '/min',     dp: 1 },
  walking_speed_mihr:            { label: 'Walk Speed',    unit: 'mph',      dp: 2 },
};

// primary = summary chips + main daily table; secondary = detail table below
const SECTIONS = [
  {
    id: 'nutrition', icon: '🥗', title: 'Nutrition', color: '#1a7a1a', alwaysShow: true,
    primary:   ['dietary_energy_kcal','protein_g','carbohydrates_g','total_fat_g'],
    secondary: ['fiber_g','sugar_g','sodium_mg','water_fl_oz_us'],
  },
  {
    id: 'body', icon: '⚖️', title: 'Body & Weight', color: '#0055aa', alwaysShow: true,
    primary:   ['weight_lb','body_fat_percentage__','lean_body_mass_lb'],
    secondary: ['body_mass_index_count'],
  },
  {
    id: 'activity', icon: '🏃', title: 'Activity', color: '#b86400', alwaysShow: true,
    primary:   ['step_count_count','active_energy_kcal','apple_exercise_time_min','walking___running_distance_mi'],
    secondary: ['resting_energy_kcal','flights_climbed_count','apple_stand_time_min','vo2_max_mlkgmin'],
  },
  {
    id: 'sleep', icon: '😴', title: 'Sleep', color: '#5b2d8e', alwaysShow: true,
    primary:   ['sleep_analysis_total_sleep_hr','sleep_analysis_deep_hr','sleep_analysis_rem_hr','sleep_analysis_core_hr'],
    secondary: ['sleep_analysis_in_bed_hr','sleep_analysis_awake_hr'],
  },
  {
    id: 'heart', icon: '❤️', title: 'Heart & Vitals', color: '#c00000',
    primary:   ['resting_heart_rate_countmin','heart_rate_avg_countmin','heart_rate_variability_ms','blood_oxygen_saturation__'],
    secondary: ['heart_rate_max_countmin','walking_heart_rate_average_countmin','blood_glucose_mgdl','blood_pressure_systolic_mmhg','blood_pressure_diastolic_mmhg','body_temperature_degf','respiratory_rate_countmin'],
  },
];
const SECTION_ALL_COLS = new Set(SECTIONS.flatMap(s => [...s.primary, ...s.secondary]));

const HERO_DEFS = [
  { ct: 'dietary_energy_kcal',          label: 'Avg Calories', color: '#1a7a1a', mode: 'avg'    },
  { ct: 'step_count_count',             label: 'Avg Steps',    color: '#b86400', mode: 'avg'    },
  { ct: 'weight_lb',                    label: 'Weight',       color: '#0055aa', mode: 'latest' },
  { ct: 'sleep_analysis_total_sleep_hr',label: 'Avg Sleep',    color: '#5b2d8e', mode: 'avg'    },
];

const MACRO_DEFS = [
  { ct: 'protein_g',       label: 'Protein',  calPerGram: 4, color: '#4a9' },
  { ct: 'carbohydrates_g', label: 'Carbs',    calPerGram: 4, color: '#e8a735' },
  { ct: 'total_fat_g',     label: 'Fat',      calPerGram: 9, color: '#d66' },
];

const MOOD_LABEL = { 1: 'Very Bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
const MOOD_EMOJI = { 1: '😢', 2: '😞', 3: '😐', 4: '😊', 5: '😁' };

// ── Date helpers ──────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'today',  label: 'Today',        start: localToday,            end: localToday    },
  { id: 'week',   label: 'Last 7 days',  start: () => localOffset(-7), end: localToday    },
  { id: 'month',  label: 'Last 30 days', start: localMonthAgo,         end: localToday    },
  { id: 'custom', label: 'Custom',       start: () => localOffset(-30),end: localToday    },
];

// ── Map helpers ───────────────────────────────────────────────────────────────
function buildMaps(rows) {
  const maps = {};
  rows.forEach(h => {
    const ct = canonical(h.type);
    const v  = parseFloat(h.value);
    if (!Number.isFinite(v)) return;
    const day = String(h.timestamp || '').slice(0, 10);
    if (!day) return;
    if (!maps[ct]) maps[ct] = {};
    if (maps[ct][day] === undefined || v > maps[ct][day]) maps[ct][day] = v;
  });
  return maps;
}
// ── Component ─────────────────────────────────────────────────────────────────
function ExportPage({ token }) {
  const [period,         setPeriod]         = useState('week');
  const [customStart,    setCustomStart]    = useState(localOffset(-30));
  const [customEnd,      setCustomEnd]      = useState(localToday());
  const [includeJournal, setIncludeJournal] = useState(true);
  const [quickExport,    setQuickExport]    = useState(false);
  const [preview,        setPreview]        = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [error,          setError]          = useState(null);
  const [foodLogOpen,    setFoodLogOpen]    = useState(false);
  const [macroDaysOpen,  setMacroDaysOpen]  = useState(false);
  const [activeTab,      setActiveTab]      = useState('overview');

  // Load the user's default export period from their profile
  useEffect(() => {
    fetch(`${API_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.export_period) setPeriod(d.export_period); })
      .catch(() => {});
  }, [token]);

  const getRange = useCallback(() => {
    if (period === 'custom') return { start: customStart, end: customEnd };
    const p = PERIODS.find(x => x.id === period);
    return { start: p.start(), end: p.end() };
  }, [period, customStart, customEnd]);

  const loadPreview = async () => {
    setLoading(true); setError(null); setPreview(null);
    const { start, end } = getRange();
    try {
      const [jRes, hRes, heroRes, flRes, flDailyRes] = await Promise.all([
        fetch(`${API_BASE}/api/journal?start=${start}T00:00:00&end=${end}T23:59:59`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/health?start=${start}T00:00:00&end=${end}T23:59:59`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/health/hero`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/food-log/items?start=${start}&end=${end}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/food-log/daily?start=${start}T00:00:00&end=${end}T23:59:59`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const jData      = await jRes.json();
      const hData      = await hRes.json();
      const heroData   = await heroRes.json();
      const flData     = await flRes.json();
      const flDaily    = await flDailyRes.json();
      const maps        = buildMaps(hData.data || []);
      const heroFallback = buildMaps(heroData.data || []);
      setFoodLogOpen(false);
      setMacroDaysOpen(false);
      setActiveTab('overview');
      setPreview({ entries: jData.entries || [], maps, heroFallback, totalHealth: (hData.data || []).length, foodLogItems: flData.data || [], macroDays: flDaily.data || [] });
    } catch (e) {
      setError('Preview failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true); setError(null);
    const { start, end } = getRange();
    const params = new URLSearchParams({ start, end, includeJournal: includeJournal ? '1' : '0', quick: quickExport ? '1' : '0' });
    try {
      const res = await fetch(`${API_BASE}/api/journal/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError('Export failed \u2014 check server logs.'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `arfidwatch-${start}-to-${end}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError('Export error: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  if (!token) return <div className="export-page"><p className="ep-empty">Please log in.</p></div>;

  const { start, end } = getRange();

  return (
    <div className="export-page">

      {/* ── Header ── */}
      <div className="ep-header">
        <div>
          <h2 className="ep-title">Export</h2>
          <p className="ep-subtitle">Full PDF report \u2014 all health data &amp; journal</p>
        </div>
        <div className="ep-header-actions">
          <button className="ep-preview-btn" onClick={loadPreview} disabled={loading}>
            {loading ? <><span className="ep-spin" /> Loading&#8230;</> : '👁️ Preview'}
          </button>
          <button className="ep-download-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? <><span className="ep-spin" /> Generating&#8230;</> : '\u2b07\ufe0f Download PDF'}
          </button>
        </div>
      </div>

      {/* ── Date range bar ── */}
      <div className="ep-range-bar">
        <div className="ep-period-row">
          {PERIODS.map(p => (
            <button
              key={p.id}
              className={`ep-period-btn${period === p.id ? ' active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >{p.label}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="ep-custom">
            <div className="ep-field">
              <label>From</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div className="ep-field">
              <label>To</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}
        <span className="ep-range-badge">{start} &#8594; {end}</span>
        <button
          className={`ep-toggle-btn${includeJournal ? ' active' : ''}`}
          onClick={() => setIncludeJournal(v => !v)}
          title={includeJournal ? 'Click to exclude journal from PDF' : 'Click to include journal in PDF'}
        >📓 Journal</button>
        <button
          className={`ep-toggle-btn${quickExport ? ' active' : ''}`}
          onClick={() => setQuickExport(v => !v)}
          title={quickExport ? 'Quick mode on — primary metrics only, no daily tables. Click for full report.' : 'Click for quick summary (primary metrics only)'}
        >⚡ Quick</button>
      </div>

      {error && <div className="ep-error">{error}</div>}

      {/* ── Preview panel ── */}
      <div className="ep-preview">

        {!preview && !loading && (
          <div className="ep-preview-empty">
            <div className="ep-preview-icon">📄</div>
            <p>Click <strong>Preview</strong> to see a summary before downloading.</p>
          </div>
        )}

        {loading && (
          <div className="ep-preview-empty">
            <span className="ep-spin ep-spin--lg" />
            <p>Loading&#8230;</p>
          </div>
        )}

        {preview && (() => {
          const { entries, maps, heroFallback, totalHealth, foodLogItems, macroDays } = preview;

          // Hero stats — use period data, fall back to all-time if period has none
          const heroStats = HERO_DEFS.map(h => {
            const m      = maps[h.ct];
            const mFb    = heroFallback[h.ct];
            const inRange = h.mode === 'latest' ? latestOf(m) : avgOf(m);
            const fb      = h.mode === 'latest' ? latestOf(mFb) : avgOf(mFb);
            const val     = inRange !== null ? inRange : fb;
            const meta    = TYPE_META[h.ct];
            const days    = daysOf(m);
            const isFallback = inRange === null && fb !== null;
            return { ...h, display: val !== null ? fmt(val, meta) : null, days, isFallback };
          });

          // Other metrics
          const otherCts = Object.keys(maps).filter(ct =>
            !SECTION_ALL_COLS.has(ct) && daysOf(maps[ct]) > 0
          );

          // Daily macro helper
          const dayBar = (d) => {
            const p = (d.protein_g || 0) * 4;
            const c = (d.carbohydrates_g || 0) * 4;
            const f = (d.total_fat_g || 0) * 9;
            const tot = p + c + f;
            if (!tot) return null;
            return { p: Math.round(p / tot * 100), c: Math.round(c / tot * 100), f: Math.round(f / tot * 100) };
          };
          const sortedMacroDays = [...macroDays]
            .map(d => ({
              ...d,
              dietary_energy_kcal: d.dietary_energy_kcal != null ? parseFloat(d.dietary_energy_kcal) : undefined,
              protein_g:           d.protein_g != null           ? parseFloat(d.protein_g)           : undefined,
              carbohydrates_g:     d.carbohydrates_g != null     ? parseFloat(d.carbohydrates_g)     : undefined,
              total_fat_g:         d.total_fat_g != null         ? parseFloat(d.total_fat_g)         : undefined,
            }))
            .sort((a, b) => (a.date < b.date ? 1 : -1));

          return (
            <>
              {/* ── Tabs ── */}
              <div className="ep-tabs">
                <button
                  className={`ep-tab${activeTab === 'overview' ? ' ep-tab--active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >Overview</button>
                <button
                  className={`ep-tab${activeTab === 'daily' ? ' ep-tab--active' : ''}`}
                  onClick={() => setActiveTab('daily')}
                >Daily Nutrient Data{sortedMacroDays.length > 0 ? ` (${sortedMacroDays.length})` : ''}</button>
              </div>
              {activeTab === 'overview' && <>
              {/* Hero row */}
              <div className="ep-hero-row">
                {heroStats.map(h => (
                  <div key={h.ct} className={`ep-hero-stat${h.display === null ? ' ep-hero-stat--nodata' : ''}`} style={{ '--hero-color': h.color }}>
                    <strong>{h.display ?? '\u2014'}</strong>
                    <span>{h.label}</span>
                    {h.display !== null && h.days > 0 && <small>{h.days}d in range</small>}
                    {h.display !== null && h.isFallback && <small>all-time</small>}
                    {h.display === null && <small>no data</small>}
                  </div>
                ))}
                {includeJournal && (
                  <div className="ep-hero-stat" style={{ '--hero-color': '#336699' }}>
                    <strong>{entries.length}</strong>
                    <span>Journal {entries.length === 1 ? 'Entry' : 'Entries'}</span>
                  </div>
                )}
              </div>

              {/* Count bar */}
              <div className="ep-count-bar">
                <span>{totalHealth.toLocaleString()} health records</span>
                {includeJournal && <span>{entries.length} journal {entries.length === 1 ? 'entry' : 'entries'}</span>}
              </div>

              {/* Sections */}
              {SECTIONS.map(sec => {
                const activePrimary   = sec.primary.filter(ct => daysOf(maps[ct]) > 0);
                const activeSecondary = sec.secondary.filter(ct => daysOf(maps[ct]) > 0);
                if (!activePrimary.length && !activeSecondary.length && !sec.alwaysShow) return null;

                const chipsToShow = sec.alwaysShow ? sec.primary : activePrimary;

                return (
                  <div key={sec.id} className="ep-pv-section">
                    <div className="ep-pv-title" style={{ color: sec.color }}>
                      {sec.icon} {sec.title}
                    </div>

                    {/* Primary chips — alwaysShow sections render all, greyed out when missing */}
                    {chipsToShow.length > 0 && (
                      <div className="ep-pv-metrics">
                        {chipsToShow.map(ct => {
                          const meta  = TYPE_META[ct];
                          const isWt  = ct === 'weight_lb';
                          const val   = isWt ? latestOf(maps[ct]) : avgOf(maps[ct]);
                          if (val === null) {
                            return (
                              <div key={ct} className="ep-pv-metric ep-pv-metric--nodata">
                                <strong>\u2014</strong>
                                <span>{meta?.label || ct} avg</span>
                                <small>no data</small>
                              </div>
                            );
                          }
                          const days  = daysOf(maps[ct]);
                          const mn    = minOf(maps[ct]);
                          const mx    = maxOf(maps[ct]);
                          const range = fmt(mn, meta, false) + ' \u2013 ' + fmt(mx, meta, false);
                          return (
                            <div key={ct} className="ep-pv-metric" style={{ '--chip-color': sec.color }}>
                              <strong>{fmt(val, meta)}</strong>
                              <span>{meta?.label || ct} {isWt ? '(latest)' : 'avg'}</span>
                              <small>{range} \u00b7 {days}d</small>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Macro breakdown for nutrition */}
                    {sec.id === 'nutrition' && (() => {
                      const macros = MACRO_DEFS.map(m => {
                        const avg = avgOf(maps[m.ct]);
                        if (avg === null) return null;
                        const cal = avg * m.calPerGram;
                        return { ...m, avg, cal };
                      }).filter(Boolean);
                      const totalCal = macros.reduce((s, m) => s + m.cal, 0);
                      if (!macros.length || !totalCal) return null;
                      return (
                        <div className="ep-macro-breakdown">
                          <div className="ep-macro-bar">
                            {macros.map(m => (
                              <div
                                key={m.ct}
                                className="ep-macro-bar-seg"
                                style={{ width: `${Math.round(m.cal / totalCal * 100)}%`, background: m.color }}
                                title={`${m.label}: ${Math.round(m.cal / totalCal * 100)}%`}
                              />
                            ))}
                          </div>
                          <div className="ep-macro-legend">
                            {macros.map(m => {
                              const meta = TYPE_META[m.ct];
                              return (
                                <div key={m.ct} className="ep-macro-item">
                                  <span className="ep-macro-dot" style={{ background: m.color }} />
                                  <span className="ep-macro-name">{m.label}</span>
                                  <span className="ep-macro-val">{fmt(m.avg, meta)}</span>
                                  <span className="ep-macro-pct">{Math.round(m.cal / totalCal * 100)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Period totals */}
                    {sec.id === 'nutrition' && maps['dietary_energy_kcal'] && (
                      <p className="ep-pv-total">
                        Period total: {Math.round(totalOf(maps['dietary_energy_kcal'])).toLocaleString()} kcal
                      </p>
                    )}

                    {sec.id === 'activity' && maps['step_count_count'] && (
                      <p className="ep-pv-total">
                        Period total: {Math.round(totalOf(maps['step_count_count'])).toLocaleString()} steps
                      </p>
                    )}

                    {/* Secondary chips */}
                    {!quickExport && activeSecondary.length > 0 && (
                      <div className="ep-pv-metrics ep-pv-metrics--sm">
                        {activeSecondary.map(ct => {
                          const meta = TYPE_META[ct];
                          const val  = avgOf(maps[ct]);
                          if (val === null) return null;
                          const days = daysOf(maps[ct]);
                          return (
                            <div key={ct} className="ep-pv-metric ep-pv-metric--sm">
                              <strong>{fmt(val, meta)}</strong>
                              <span>{meta?.label || ct} avg \u00b7 {days}d</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Other metrics */}
              {!quickExport && otherCts.length > 0 && (
                <div className="ep-pv-section">
                  <div className="ep-pv-title">📊 Other Metrics</div>
                  <table className="ep-other-table">
                    <thead>
                      <tr><th>Metric</th><th>Avg</th><th>Min</th><th>Max</th><th>Days</th></tr>
                    </thead>
                    <tbody>
                      {otherCts.map(ct => {
                        const meta = TYPE_META[ct] || {};
                        const m    = maps[ct];
                        const vals = Object.values(m);
                        const avg  = vals.reduce((a,b)=>a+b,0) / vals.length;
                        const dp   = meta.dp ?? 1;
                        const f    = v => (dp===0 ? Math.round(v).toLocaleString() : v.toFixed(dp)) + (meta.unit ? '\u00a0'+meta.unit : '');
                        return (
                          <tr key={ct}>
                            <td>{meta.label || ct}{meta.unit ? ` (${meta.unit})` : ''}</td>
                            <td>{f(avg)}</td>
                            <td>{f(Math.min(...vals))}</td>
                            <td>{f(Math.max(...vals))}</td>
                            <td>{vals.length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Food Log — collapsible */}
              {foodLogItems.length > 0 && (
                <div className="ep-pv-section">
                  <button
                    className="ep-pv-collapse-btn"
                    onClick={() => setFoodLogOpen(v => !v)}
                  >
                    <span className={`ep-pv-arrow${foodLogOpen ? ' ep-pv-arrow--open' : ''}`}>&#9654;</span>
                    <span className="ep-pv-title" style={{ color: '#1a7a1a', margin: 0 }}>🍽️ Food Log ({foodLogItems.length} {foodLogItems.length === 1 ? 'item' : 'items'})</span>
                  </button>
                  {foodLogOpen && (() => {
                    const byDay = {};
                    foodLogItems.forEach(item => {
                      const d = item.date || 'Unknown';
                      if (!byDay[d]) byDay[d] = [];
                      byDay[d].push(item);
                    });
                    const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
                    return (
                      <div className="ep-fl-list">
                        {sortedDays.slice(0, 10).map(day => (
                          <div key={day} className="ep-fl-day">
                            <div className="ep-fl-day-header">
                              {new Date(day + 'T12:00:00').toLocaleDateString([], { dateStyle: 'medium' })}
                            </div>
                            {byDay[day].map((item, i) => (
                              <div key={i} className="ep-fl-item">
                                <span className="ep-fl-food">{item.food_name}</span>
                                {item.meal && <span className="ep-fl-meal">{item.meal}</span>}
                                <span className="ep-fl-cals">{item.calories != null ? `${Math.round(item.calories)} kcal` : ''}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        {sortedDays.length > 10 && <p className="ep-hint">and {sortedDays.length - 10} more days in the PDF&#8230;</p>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Journal */}
              {includeJournal && entries.length > 0 && (
                <div className="ep-pv-section">
                  <div className="ep-pv-title">📓 Journal ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})</div>
                  {entries.slice(0, 8).map((e, i) => (
                    <div key={i} className="ep-pv-entry">
                      <div className="ep-pv-meta">
                        <span className="ep-pv-date">
                          {new Date(e.date).toLocaleDateString([], { dateStyle: 'medium' })}
                        </span>
                        {e.mood && <span className="ep-pv-mood">{MOOD_EMOJI[e.mood]} {MOOD_LABEL[e.mood]}</span>}
                      </div>
                      {e.text && (
                        <p className="ep-pv-text">{e.text.slice(0, 160)}{e.text.length > 160 ? '\u2026' : ''}</p>
                      )}
                    </div>
                  ))}
                  {entries.length > 8 && <p className="ep-hint">and {entries.length - 8} more entries in the PDF&#8230;</p>}
                </div>
              )}

              {entries.length === 0 && totalHealth === 0 && (
                <div className="ep-preview-empty"><p>No data found in this date range.</p></div>
              )}
              </>}

              {/* ── Daily Nutrient Data tab ── */}
              {activeTab === 'daily' && (
                <div className="ep-daily-tab">
                  {sortedMacroDays.length === 0 ? (
                    <div className="ep-preview-empty"><p>No daily nutrient data in this date range.</p></div>
                  ) : (
                    <div className="ep-md-list">
                      {sortedMacroDays.map(d => {
                        const bar = dayBar(d);
                        return (
                          <div key={d.date} className="ep-md-day">
                            <div className="ep-md-day-header">
                              <span className="ep-md-day-date">
                                {new Date(d.date + 'T12:00:00').toLocaleDateString([], { dateStyle: 'medium' })}
                              </span>
                              {d.dietary_energy_kcal !== undefined && (
                                <span className="ep-md-day-cals">{Math.round(d.dietary_energy_kcal).toLocaleString()} kcal</span>
                              )}
                            </div>
                            <div className="ep-md-chips">
                              {[
                                { key: 'dietary_energy_kcal', label: 'Calories', unit: 'kcal', dp: 0 },
                                { key: 'protein_g',           label: 'Protein',  unit: 'g',    dp: 1 },
                                { key: 'carbohydrates_g',     label: 'Carbs',    unit: 'g',    dp: 1 },
                                { key: 'total_fat_g',         label: 'Fat',      unit: 'g',    dp: 1 },
                              ].map(m => {
                                const v = d[m.key];
                                return (
                                  <div key={m.key} className={`ep-md-chip${v === undefined ? ' ep-md-chip--missing' : ''}`}>
                                    <strong>{v !== undefined ? (m.dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(m.dp)) + ' ' + m.unit : '\u2014'}</strong>
                                    <span>{m.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {bar && (
                              <div className="ep-md-bar-wrap">
                                <div className="ep-md-bar">
                                  <div className="ep-md-bar-p" style={{ width: bar.p + '%' }} />
                                  <div className="ep-md-bar-c" style={{ width: bar.c + '%' }} />
                                  <div className="ep-md-bar-f" style={{ width: bar.f + '%' }} />
                                </div>
                                <span className="ep-md-bar-legend">
                                  <em style={{ color: '#4ac8a0' }}>P {bar.p}%</em>
                                  <em style={{ color: '#4a88e0' }}>C {bar.c}%</em>
                                  <em style={{ color: '#e08040' }}>F {bar.f}%</em>
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
            </>
          );
        })()}
      </div>

    </div>
  );
}

export default ExportPage;
