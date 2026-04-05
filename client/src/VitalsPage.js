import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import './VitalsPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

/* ── Metric definitions ── */
const VITALS_METRICS = [
  { key: 'weight_lb',                        label: 'Weight',       unit: 'lb',   dp: 1, color: '#a78bfa', altKeys: ['weight_kg'] },
  { key: 'height_cm',                        label: 'Height',       unit: 'cm',   dp: 1, color: '#818cf8', altKeys: ['height_in'] },
  { key: 'blood_pressure_systolic_mmhg',      label: 'BP Systolic',  unit: 'mmHg', dp: 0, color: '#f97316' },
  { key: 'blood_pressure_diastolic_mmhg',     label: 'BP Diastolic', unit: 'mmHg', dp: 0, color: '#fb923c' },
  { key: 'heart_rate_avg_countmin',            label: 'Avg HR',       unit: 'bpm',  dp: 0, color: '#ef4444' },
  { key: 'resting_heart_rate_countmin',        label: 'Resting HR',   unit: 'bpm',  dp: 0, color: '#e74c3c' },
  { key: 'heart_rate_variability_ms',          label: 'HRV',          unit: 'ms',   dp: 1, color: '#9b59b6' },
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
  { id: 'bp',    title: 'Blood Pressure', unit: 'mmHg', keys: ['blood_pressure_systolic_mmhg', 'blood_pressure_diastolic_mmhg'], labels: ['SYS', 'DIA'] },
  { id: 'pulse', title: 'Pulse',          unit: 'bpm',  keys: ['heart_rate_avg_countmin', 'resting_heart_rate_countmin'], labels: ['Avg', 'Resting'] },
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
const toLocalDate = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : fmtDate(d); };
const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

const canonical = t => {
  if (!t) return t;
  const s = String(t).toLowerCase();
  if (s.startsWith('macrofactor_')) return s.slice('macrofactor_'.length);
  if (s.startsWith('apple_')) return s.slice('apple_'.length);
  return s;
};

function VitalsPage({ token }) {
  const [data, setData]             = useState([]);
  const [rangeDays, setRangeDays]   = useState(90);
  const [loading, setLoading]       = useState(true);
  const [cardsOpen, setCardsOpen]   = useState(false);
  const [expanded, setExpanded]     = useState({});    // per-graph expand state
  const [allExpanded, setAllExpanded] = useState(false); // master toggle

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const startDate = rangeDays ? fmtDate((() => { const d = new Date(); d.setDate(d.getDate() - rangeDays); return d; })()) : '';
        const qs = startDate ? `?start=${startDate}` : '';
        const res = await authFetch(`${API_BASE}/api/health${qs}`);
        if (!res.ok) { setData([]); return; }
        const json = await res.json();
        if (active) setData(Array.isArray(json.data) ? json.data : []);
      } catch (_) { setData([]); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [token, rangeDays]);

  const metrics = useMemo(() => {
    // Build day → value maps per metric
    const allKeys = new Set();
    VITALS_METRICS.forEach(m => { allKeys.add(m.key); (m.altKeys || []).forEach(k => allKeys.add(k)); });

    const byType = {};
    data.forEach(r => {
      const ct = canonical(r.type);
      if (!allKeys.has(ct)) return;
      const v = toNum(r.value);
      if (!Number.isFinite(v)) return;
      const day = toLocalDate(r.timestamp);
      if (!day) return;
      if (!byType[ct]) byType[ct] = {};
      // For BP we want averages across readings on same day; for weight, latest wins
      if (byType[ct][day] === undefined) {
        byType[ct][day] = { sum: v, count: 1 };
      } else {
        byType[ct][day].sum += v;
        byType[ct][day].count += 1;
      }
    });
    // Flatten to day → avg value
    const maps = {};
    for (const [type, dayMap] of Object.entries(byType)) {
      maps[type] = {};
      for (const [day, { sum, count }] of Object.entries(dayMap)) {
        maps[type][day] = sum / count;
      }
    }

    return VITALS_METRICS.map(m => {
      const dayMap = maps[m.key] || (m.altKeys ? m.altKeys.reduce((f, k) => f || maps[k], null) : null);
      if (!dayMap || Object.keys(dayMap).length === 0) return null;

      const entries = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
      const vals = entries.map(([, v]) => v);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const latest = entries[entries.length - 1];

      // Use the correct unit for weight
      let unit = m.unit;
      if (m.key === 'weight_lb' && !maps['weight_lb'] && maps['weight_kg']) unit = 'kg';

      return {
        ...m,
        unit,
        dayMap,
        chart: entries.map(([day, v]) => ({ day, v: Math.round(v * 100) / 100 })),
        avg, min, max,
        latest: latest[1],
        latestDay: latest[0],
        count: entries.length,
      };
    }).filter(Boolean);
  }, [data]);

  /* Build combined chart data for each graph group */
  const graphs = useMemo(() => {
    if (!metrics.length) return [];
    return GRAPH_GROUPS.map(g => {
      // collect all days present across all keys in this group
      const allDays = new Set();
      const resolved = g.keys.map(k => {
        const m = metrics.find(x => x.key === k);
        if (m) return m;
        // check altKeys
        const alts = g.altKeys && g.altKeys[k];
        if (alts) {
          for (const ak of alts) {
            const am = metrics.find(x => x.key === ak);
            if (am) return am;
          }
        }
        return null;
      });
      if (resolved.every(r => !r)) return null;

      resolved.forEach(m => { if (m) Object.keys(m.dayMap).forEach(d => allDays.add(d)); });
      const sortedDays = [...allDays].sort();
      if (sortedDays.length < 2) return null;

      const chartData = sortedDays.map(day => {
        const pt = { day: day.slice(5) }; // MM-DD for compact axis
        resolved.forEach((m, i) => {
          if (m && m.dayMap[day] !== undefined) pt[`v${i}`] = Math.round(m.dayMap[day] * 100) / 100;
        });
        return pt;
      });

      // Compute min-max legends
      const legends = resolved.map((m, i) => {
        if (!m) return null;
        return { label: g.labels[i], color: m.color, min: m.min, max: m.max, dp: m.dp };
      }).filter(Boolean);

      return { ...g, chartData, legends, resolvedMetrics: resolved.filter(Boolean) };
    }).filter(Boolean);
  }, [metrics]);

  const toggleGraph = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAll = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    const map = {};
    graphs.forEach(g => { map[g.id] = next; });
    setExpanded(map);
  };

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

      {loading && <div className="vp-loading">Loading…</div>}

      {!loading && metrics.length === 0 && (
        <div className="vp-empty">No vitals data yet. Import health data or upload an iHealth CSV from the Health page.</div>
      )}

      {!loading && metrics.length > 0 && (
        <>
          {/* Master expand/collapse */}
          {graphs.length > 0 && (
            <button className="vp-master-toggle" onClick={toggleAll}>
              {allExpanded ? '▾ Collapse All Charts' : '▸ Expand All Charts'}
            </button>
          )}

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
                          {g.resolvedMetrics.map((m, i) => (
                            <Line key={m.key} type="monotone" dataKey={`v${g.keys.indexOf(m.key)}`}
                              stroke={m.color} strokeWidth={1.5}
                              dot={false} name={g.labels[g.keys.indexOf(m.key)] || m.label}
                              connectNulls
                            />
                          ))}
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
                          {g.resolvedMetrics.map((m, i) => (
                            <Line key={m.key} type="monotone" dataKey={`v${g.keys.indexOf(m.key)}`}
                              stroke={m.color} strokeWidth={2}
                              dot={{ r: g.chartData.length < 30 ? 3 : 0, fill: m.color }}
                              name={g.labels[g.keys.indexOf(m.key)] || m.label}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Collapsible stat cards ── */}
          <button className="vp-cards-toggle" onClick={() => setCardsOpen(v => !v)}>
            {cardsOpen ? '▾ Hide Details' : '▸ Show Details'} ({metrics.length} metrics)
          </button>
          {cardsOpen && (
            <div className="vp-cards">
              {metrics.map(m => (
                <div key={m.key} className="vp-stat-card" style={{ borderLeftColor: m.color }}>
                  <div className="vp-stat-label">{m.label}</div>
                  <div className="vp-stat-row">
                    <span className="vp-stat-latest">{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)} <small>{m.unit}</small></span>
                    <span className="vp-stat-range">
                      {m.dp === 0 ? Math.round(m.min) : m.min.toFixed(m.dp)}–{m.dp === 0 ? Math.round(m.max) : m.max.toFixed(m.dp)} · avg {m.dp === 0 ? Math.round(m.avg) : m.avg.toFixed(m.dp)} · {m.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default VitalsPage;
