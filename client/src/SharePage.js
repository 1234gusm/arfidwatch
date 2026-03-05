import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './SharePage.css';

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

const avgOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
const latestOf = m => { if (!m) return null; const k = Object.keys(m).sort(); return k.length ? m[k[k.length-1]] : null; };
const minOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? Math.min(...v) : null; };
const maxOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? Math.max(...v) : null; };
const countOf  = m => (m ? Object.keys(m).length : 0);

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
      { keys: ['dietary_energy_kcal', 'energy', 'calories'],         label: 'Calories',      unit: 'kcal', dp: 0, mode: 'avg' },
      { keys: ['protein_g', 'protein'],                               label: 'Protein',       unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['carbohydrates_g', 'carbohydrates', 'carbs'],          label: 'Carbohydrates', unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['total_fat_g', 'fat'],                                 label: 'Total Fat',     unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['saturated_fat_g'],                                    label: 'Saturated Fat', unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['fiber_g', 'fiber'],                                   label: 'Fiber',         unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['sugar_g', 'sugar'],                                   label: 'Sugar',         unit: 'g',    dp: 1, mode: 'avg' },
      { keys: ['sodium_mg', 'sodium'],                                label: 'Sodium',        unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['cholesterol_mg'],                                     label: 'Cholesterol',   unit: 'mg',   dp: 0, mode: 'avg' },
      { keys: ['water_fl_oz_us', 'water'],                            label: 'Water',         unit: 'fl oz',dp: 1, mode: 'avg' },
      { keys: ['caffeine_mg', 'caffeine'],                            label: 'Caffeine',      unit: 'mg',   dp: 0, mode: 'avg' },
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

  useEffect(() => {
    fetch(`http://localhost:4000/api/share/${shareToken}`)
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
      const res = await fetch(`http://localhost:4000/api/share/${shareToken}/unlock`, {
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
      const dr = await fetch(`http://localhost:4000/api/share/${shareToken}/data`, {
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
  const periodLabel  = PERIOD_LABEL[healthInfo?.export_period] || healthInfo?.export_period;

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
          <div className="share-patient-name">{healthInfo.username}</div>
          <div className="share-period">
            {periodLabel}&nbsp;&middot;&nbsp;{healthInfo.start}&nbsp;&ndash;&nbsp;{healthInfo.end}
          </div>
        </div>

        {/* Health metric sections */}
        {SECTIONS.map(section => {
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
            // deduplicate: if both lb and kg weight present, show only the first match
            .filter((r, i, arr) => arr.findIndex(x => x.label === r.label) === i)
            // hide rows with no data
            .filter(r => r.hasData);

          // hide the whole section if no rows have data
          if (rows.length === 0) return null;

          const withData = rows.length;

          return (
            <Section key={section.id} title={section.title} badge={withData} defaultOpen={section.defaultOpen}>
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
                              ? `${fmt(row.lo, row.dp)}\u2013${fmt(row.hi, row.dp)} ${row.unit} · ${row.days}d`
                              : `avg · ${row.days}d`)
                          : 'latest'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          );
        })}

        {/* Journal — collapsed by default */}
        <Section title="Journal" badge={journal.length} defaultOpen={false}>
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

        {/* Food Log — collapsed by default, only shown if data exists */}
        {foodLog.length > 0 && (() => {
          const grouped = groupFoodLog(foodLog);
          return (
            <Section title="Food Log" badge={grouped.length + 'd'} defaultOpen={false}>
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
                                  ].filter(Boolean).join(' · ')}
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

        <p className="share-footer">
          ArfidWatch &mdash; read-only view &mdash; {periodLabel.toLowerCase()}
        </p>
      </div>
    </div>
  );
}

export default SharePage;
