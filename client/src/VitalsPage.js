import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import './VitalsPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

/* ── Metric definitions ── */
const VITALS_METRICS = [
  { key: 'heart_rate_avg_countmin',            label: 'Avg HR',       unit: 'bpm',  dp: 0, color: '#ef4444', altKeys: ['heart_rate', 'heartrate', 'pulse', 'heart_ratebeatsmin'] },
  { key: 'resting_heart_rate_countmin',        label: 'Resting HR',   unit: 'bpm',  dp: 0, color: '#e74c3c' },
  { key: 'blood_pressure_systolic_mmhg',      label: 'BP Systolic',  unit: 'mmHg', dp: 0, color: '#f97316', altKeys: ['systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg'] },
  { key: 'blood_pressure_diastolic_mmhg',     label: 'BP Diastolic', unit: 'mmHg', dp: 0, color: '#fb923c', altKeys: ['diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg'] },
  { key: 'heart_rate_variability_ms',          label: 'HRV',          unit: 'ms',   dp: 1, color: '#9b59b6' },
  { key: 'weight_lb',                        label: 'Weight',       unit: 'lb',   dp: 1, color: '#a78bfa', altKeys: ['weight_kg'] },
  { key: 'height_cm',                        label: 'Height',       unit: 'cm',   dp: 1, color: '#818cf8', altKeys: ['height_in'] },
  { key: 'blood_oxygen_saturation__',          label: 'Blood O\u2082',unit: '%',    dp: 1, color: '#22d3ee' },
  { key: 'vo2_max_mlkgmin',                    label: 'VO\u2082 Max', unit: 'ml/kg/min', dp: 1, color: '#14b8a6' },
  { key: 'body_fat_percentage__',              label: 'Body Fat',     unit: '%',    dp: 1, color: '#eab308' },
  { key: 'body_mass_index_count',              label: 'BMI',          unit: '',     dp: 1, color: '#94a3b8' },
  { key: 'body_temperature_degf',              label: 'Body Temp',    unit: '\u00b0F', dp: 1, color: '#f472b6' },
  { key: 'blood_glucose_mgdl',                label: 'Blood Glucose',unit: 'mg/dL',dp: 0, color: '#34d399' },
  { key: 'respiratory_rate_countmin',          label: 'Resp. Rate',   unit: '/min', dp: 1, color: '#67e8f9' },
];

/* Graph groupings — shown as combined charts at the top like the iHealth app */
const GRAPH_GROUPS = [
  { id: 'pulse', title: 'Pulse',          unit: 'bpm',  keys: ['heart_rate_avg_countmin', 'resting_heart_rate_countmin'], labels: ['Avg', 'Resting'], altKeys: { heart_rate_avg_countmin: ['heart_rate', 'heartrate', 'pulse', 'heart_ratebeatsmin'] } },
  { id: 'bp',    title: 'Blood Pressure', unit: 'mmHg', keys: ['blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg'], labels: ['SYS', 'DIA'], altKeys: { blood_pressure_systolic_mmhg: ['systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg'], blood_pressure_diastolic_mmhg: ['diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg'] } },
  { id: 'wt',    title: 'Weight',         unit: 'lb',   keys: ['weight_lb'], labels: ['Weight'], altKeys: { weight_lb: ['weight_kg'] } },
  { id: 'hrv',   title: 'HRV',            unit: 'ms',   keys: ['heart_rate_variability_ms'], labels: ['HRV'] },
  { id: 'spo2',  title: 'Blood O\u2082',  unit: '%',    keys: ['blood_oxygen_saturation__'], labels: ['SpO\u2082'] },
];

const RANGE_OPTS = [
  { days: 7,   label: '1 Week' },
  { days: 14,  label: '2 Weeks' },
  { days: 30,  label: '1 Month' },
  { days: 90,  label: '3 Months' },
  { days: 360, label: 'Year' },
  { days: 0,   label: 'All' },
];

const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtDateTime = d => `${fmtDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const toLocalDate = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : fmtDate(d); };
const toLocalDateTime = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : fmtDateTime(d); };
const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

const canonical = t => {
  if (!t) return t;
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};
const lighten = hex => {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.min(255, ((n >> s) & 0xFF) + Math.round((255 - ((n >> s) & 0xFF)) * 0.4)).toString(16).padStart(2, '0')).join('');
};
const getSource = r => { try { return JSON.parse(String(r.raw || '{}')).source || ''; } catch (_) { return ''; } };

function VitalsPage({ token }) {
  const [data, setData]             = useState([]);
  const [rangeDays, setRangeDays]   = useState(90);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [expanded, setExpanded]     = useState({});    // per-graph expand state
  const [expandedCard, setExpandedCard] = useState(null); // per-stat-card expand

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const startDate = rangeDays ? fmtDate((() => { const d = new Date(); d.setDate(d.getDate() - rangeDays); return d; })()) : '';
        const params = new URLSearchParams();
        if (startDate) params.set('start', startDate);
        // Fetch all health data (no types filter) — matches Render server behavior.
        // Client-side filtering handles type matching with altKeys + canonical().
        const res = await authFetch(`${API_BASE}/api/health?${params}`);
        if (!res.ok) { console.error('Vitals fetch failed:', res.status, await res.text()); setError(`Server returned ${res.status}`); setData([]); return; }
        const json = await res.json();
        console.log('Vitals loaded:', json.data?.length, 'records');
        if (active) setData(Array.isArray(json.data) ? json.data : []);
      } catch (e) { console.error('Vitals load error:', e); setError(e.message || 'Unknown error'); setData([]); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [token, rangeDays]);

  const metrics = useMemo(() => {
    // Split data: auto health → daily averages, iHealth → individual readings
    const allKeys = new Set();
    VITALS_METRICS.forEach(m => { allKeys.add(m.key); (m.altKeys || []).forEach(k => allKeys.add(k)); });

    const autoByType = {};   // { [ct]: { [day]: { sum, count } } }
    const ihByType = {};     // { [ct]: [{ ts, dt, day, v }] }
    data.forEach(r => {
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

    return VITALS_METRICS.map(m => {
      const autoData = autoByType[m.key] || (m.altKeys ? m.altKeys.reduce((f, k) => f || autoByType[k], null) : null);
      const ihData = ihByType[m.key] || (m.altKeys ? m.altKeys.reduce((f, k) => f || ihByType[k], null) : null);
      if (!autoData && (!ihData || !ihData.length)) return null;

      // Auto health: daily averages
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

      // Latest value from whichever series is most recent
      const lastA = autoReadings.length ? autoReadings[autoReadings.length - 1] : null;
      const lastI = ihReadings.length ? ihReadings[ihReadings.length - 1] : null;
      const ihMoreRecent = lastI && (!lastA || lastI.ts > lastA.day + 'T23:59:59');
      const latest = ihMoreRecent ? lastI.v : lastA ? lastA.v : lastI.v;
      const latestDay = ihMoreRecent ? lastI.dt : lastA ? lastA.day : lastI.dt;

      let unit = m.unit;
      if (m.key === 'weight_lb' && !autoByType['weight_lb'] && autoByType['weight_kg']) unit = 'kg';

      // Unified chart: auto → v, iHealth → vIh, sorted by time
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
  }, [data]);

  /* Build combined chart data for each graph group */
  const graphs = useMemo(() => {
    if (!metrics.length) return [];
    return GRAPH_GROUPS.map(g => {
      const resolved = g.keys.map(k => {
        const m = metrics.find(x => x.key === k);
        if (m) return m;
        const alts = g.altKeys && g.altKeys[k];
        if (alts) { for (const ak of alts) { const am = metrics.find(x => x.key === ak); if (am) return am; } }
        return null;
      });
      if (resolved.every(r => !r)) return null;

      // Collect all time points: dates (auto) + datetimes (iHealth)
      const allTimes = new Set();
      resolved.forEach(m => {
        if (m) {
          Object.keys(m.dayMap).forEach(d => allTimes.add(d));
          Object.keys(m.dayMapIh).forEach(d => allTimes.add(d));
        }
      });
      const sortedTimes = [...allTimes].sort();
      if (sortedTimes.length < 1) return null;

      const chartData = sortedTimes.map(dt => {
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
  }, [metrics]);

  /* ── Weight hero chart: every individual reading, NO averaging ── */
  const weightChart = useMemo(() => {
    const weightKeys = new Set(['weight_lb', 'weight_kg']);
    const points = data
      .filter(r => weightKeys.has(canonical(r.type)))
      .map(r => {
        let v = toNum(r.value);
        if (!Number.isFinite(v)) return null;
        if (canonical(r.type) === 'weight_kg') v = Math.round(v * 2.20462 * 100) / 100;
        else v = Math.round(v * 100) / 100;
        const d = new Date(r.timestamp);
        if (!Number.isFinite(d.getTime())) return null;
        return { date: d, dateLabel: fmtDate(d), value: v };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);
    if (points.length < 2) return null;
    const vals = points.map(p => p.value);
    return {
      points,
      latest: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
    };
  }, [data]);

  const toggleGraph = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!token) return <div className="vp-page"><p>Please log in.</p></div>;

  return (
    <div className="vp-page">
      <div className="vp-header">
        <div className="vp-header-left">
          <h2 className="vp-title">Vitals</h2>
          <p className="vp-subtitle">Weight · blood pressure · heart rate · body composition</p>
        </div>
        <div className="vp-range-row">
          {RANGE_OPTS.map(o => (
            <button
              key={o.days}
              className={`vp-range-btn${o.days === rangeDays ? ' vp-range-btn--active' : ''}`}
              onClick={() => setRangeDays(o.days)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* ── Weight hero chart — exact readings, no averages ── */}
      {weightChart && (
        <div className="vp-weight-hero">
          <div className="vp-weight-hero-header">
            <div className="vp-weight-hero-title">Weight</div>
            <div className="vp-weight-hero-latest">
              {weightChart.latest.toFixed(1)} <span>lb</span>
            </div>
          </div>
          <div className="vp-weight-hero-stats">
            <span>Min {weightChart.min.toFixed(1)}</span>
            <span>Max {weightChart.max.toFixed(1)}</span>
            <span>{weightChart.count} readings</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weightChart.points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(148,163,184,0.12)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                domain={[Math.floor(weightChart.min - Math.max((weightChart.max - weightChart.min) * 0.15, 0.5)),
                         Math.ceil(weightChart.max + Math.max((weightChart.max - weightChart.min) * 0.15, 0.5))]}
                width={42}
                tickLine={{ stroke: 'rgba(148,163,184,0.12)' }}
              />
              <ReferenceLine y={weightChart.latest} stroke="rgba(167,139,250,0.25)" strokeDasharray="4 4" />
              <Tooltip
                formatter={v => [`${typeof v === 'number' ? v.toFixed(1) : v} lb`, 'Weight']}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#a78bfa' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#a78bfa"
                dot={{ r: 3, fill: '#a78bfa', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#c4b5fd', stroke: '#fff', strokeWidth: 1 }}
                strokeWidth={2.5}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading && <div className="vp-loading">Loading…</div>}

      {!loading && error && (
        <div className="vp-empty" style={{ color: '#f97316' }}>Error loading vitals: {error}</div>
      )}

      {!loading && !error && metrics.length === 0 && (
        <div className="vp-empty">No vitals data yet. Import health data or upload an iHealth CSV from the Health page.</div>
      )}

      {!loading && !error && metrics.length > 0 && (
        <>
          {/* ── Chart tiles grid ── */}
          <div className="vp-graphs-grid">
            {graphs.map(g => {
              const isOpen = !!expanded[g.id];
              return (
                <div
                  key={g.id}
                  className={`vp-graph-tile${isOpen ? ' vp-graph-tile--expanded' : ''}`}
                  onClick={() => !isOpen && toggleGraph(g.id)}
                >
                  <div className="vp-graph-head" onClick={isOpen ? () => toggleGraph(g.id) : undefined}>
                    <span className="vp-graph-title">{g.title} <small className="vp-graph-unit">{g.unit}</small></span>
                    <span className="vp-graph-legend">
                      {g.legends.map((l, i) => (
                        <span key={i} className="vp-graph-legend-item">
                          <span className="vp-graph-dot" style={{ background: l.color }} />
                          {l.label} {l.dp === 0 ? Math.round(l.min) : l.min.toFixed(l.dp)}–{l.dp === 0 ? Math.round(l.max) : l.max.toFixed(l.dp)}
                        </span>
                      ))}
                    </span>
                  </div>
                  {/* Compact mini sparkline */}
                  {!isOpen && (
                    <div className="vp-graph-mini">
                      <ResponsiveContainer width="100%" height={60}>
                        <LineChart data={g.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          {g.resolvedMetrics.map((m, i) => {
                            const ki = g.keys.indexOf(m.key);
                            return (
                              <React.Fragment key={m.key}>
                                <Line type="monotone" dataKey={`v${ki}`}
                                  stroke={m.color} strokeWidth={1.5}
                                  dot={false} name={g.labels[ki] || m.label}
                                  connectNulls
                                />
                                {m.hasIh && (
                                  <Line type="monotone" dataKey={`v${ki}Ih`}
                                    stroke={lighten(m.color)} strokeWidth={1} strokeDasharray="3 2"
                                    dot={false} name={`${g.labels[ki]} (Individual)`}
                                    connectNulls={false}
                                  />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Expanded full chart */}
                  {isOpen && (
                    <div className="vp-graph-body">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={g.chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={38} />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: '#94a3b8' }}
                          />
                          {g.resolvedMetrics.map((m, i) => {
                            const ki = g.keys.indexOf(m.key);
                            return (
                              <React.Fragment key={m.key}>
                                <Line type="monotone" dataKey={`v${ki}`}
                                  stroke={m.color} strokeWidth={2}
                                  dot={{ r: g.chartData.length < 30 ? 3 : 0, fill: m.color }}
                                  name={m.hasIh ? `${g.labels[ki]} (Daily Avg)` : (g.labels[ki] || m.label)}
                                  connectNulls
                                />
                                {m.hasIh && (
                                  <Line type="monotone" dataKey={`v${ki}Ih`}
                                    stroke={lighten(m.color)} strokeWidth={1.5} strokeDasharray="5 3"
                                    dot={{ r: 4, fill: lighten(m.color), stroke: '#fff', strokeWidth: 1 }}
                                    name={`${g.labels[ki]} (Individual)`}
                                    connectNulls={false}
                                  />
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

          {/* ── Stat cards ── */}
          <div className="vp-cards">
            {metrics.map(m => {
              const isCardOpen = expandedCard === m.key;
              return (
                <div
                  key={m.key}
                  className={`vp-stat-card${isCardOpen ? ' vp-stat-card--expanded' : ''}`}
                  style={{ borderLeftColor: m.color }}
                  onClick={() => setExpandedCard(isCardOpen ? null : m.key)}
                >
                  <div className="vp-stat-label">{m.label}</div>
                  <div className="vp-stat-row">
                    <span className="vp-stat-latest">{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)} <small>{m.unit}</small></span>
                    <span className="vp-stat-range">
                      {m.dp === 0 ? Math.round(m.min) : m.min.toFixed(m.dp)}–{m.dp === 0 ? Math.round(m.max) : m.max.toFixed(m.dp)} · avg {m.dp === 0 ? Math.round(m.avg) : m.avg.toFixed(m.dp)} · {m.count}
                    </span>
                  </div>
                  {isCardOpen && (
                    <div className="vp-stat-chart">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={m.chart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" tickFormatter={d => d.length > 10 ? d.slice(6) : d.slice(5)} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={38} />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: '#94a3b8' }}
                          />
                          <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={2}
                            dot={{ r: m.chart.filter(p => p.v != null).length < 30 ? 3 : 0, fill: m.color }}
                            name={m.hasIh ? `${m.label} (Daily Avg)` : m.label} connectNulls
                          />
                          {m.hasIh && (
                            <Line type="monotone" dataKey="vIh" stroke={lighten(m.color)} strokeWidth={1.5}
                              strokeDasharray="5 3"
                              dot={{ r: 4, fill: lighten(m.color), stroke: '#fff', strokeWidth: 1 }}
                              name={`${m.label} (Individual)`} connectNulls={false}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default VitalsPage;
