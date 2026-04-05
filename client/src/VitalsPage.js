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
  { key: 'blood_pressure_systolic_mmhg',      label: 'BP Systolic',  unit: 'mmHg', dp: 0, color: '#f97316' },
  { key: 'blood_pressure_diastolic_mmhg',     label: 'BP Diastolic', unit: 'mmHg', dp: 0, color: '#fb923c' },
  { key: 'heart_rate_avg_countmin',            label: 'Avg HR',       unit: 'bpm',  dp: 0, color: '#ef4444' },
  { key: 'resting_heart_rate_countmin',        label: 'Resting HR',   unit: 'bpm',  dp: 0, color: '#e74c3c' },
  { key: 'heart_rate_variability_ms',          label: 'HRV',          unit: 'ms',   dp: 1, color: '#9b59b6' },
  { key: 'blood_oxygen_saturation__',          label: 'Blood O\u2082',unit: '%',    dp: 1, color: '#22d3ee' },
  { key: 'vo2_max_mlkgmin',                    label: 'VO\u2082 Max', unit: 'ml/kg/min', dp: 1, color: '#14b8a6' },
  { key: 'body_fat_percentage__',              label: 'Body Fat',     unit: '%',    dp: 1, color: '#eab308' },
  { key: 'lean_body_mass_lb',                  label: 'Lean Mass',    unit: 'lb',   dp: 1, color: '#60a5fa' },
  { key: 'body_mass_index_count',              label: 'BMI',          unit: '',     dp: 1, color: '#94a3b8' },
  { key: 'body_temperature_degf',              label: 'Body Temp',    unit: '\u00b0F', dp: 1, color: '#f472b6' },
  { key: 'blood_glucose_mgdl',                label: 'Blood Glucose',unit: 'mg/dL',dp: 0, color: '#34d399' },
  { key: 'respiratory_rate_countmin',          label: 'Resp. Rate',   unit: '/min', dp: 1, color: '#67e8f9' },
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
  const [expanded, setExpanded]     = useState(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const startDate = rangeDays ? fmtDate((() => { const d = new Date(); d.setDate(d.getDate() - rangeDays); return d; })()) : '';
        const qs = startDate ? `?start=${startDate}` : '';
        const res = await authFetch(`${API_BASE}/api/health/data${qs}`);
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
          {/* Summary chips */}
          <div className="vp-summary">
            {metrics.map(m => (
              <button
                key={m.key}
                className={`vp-chip${expanded === m.key ? ' vp-chip--active' : ''}`}
                style={{ borderBottomColor: m.color }}
                onClick={() => setExpanded(expanded === m.key ? null : m.key)}
              >
                <strong>{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)}</strong>
                <span>{m.unit} {m.label}</span>
              </button>
            ))}
          </div>

          {/* Expanded metric card */}
          {expanded && (() => {
            const m = metrics.find(x => x.key === expanded);
            if (!m) return null;
            return (
              <div className="vp-detail-card" style={{ borderColor: `${m.color}55` }}>
                <div className="vp-detail-header">
                  <span className="vp-detail-title">{m.label}</span>
                  <span className="vp-detail-latest">{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)} {m.unit}</span>
                </div>
                <div className="vp-detail-stats">
                  <span>Avg: <strong>{m.dp === 0 ? Math.round(m.avg) : m.avg.toFixed(m.dp)}</strong></span>
                  <span>Min: <strong>{m.dp === 0 ? Math.round(m.min) : m.min.toFixed(m.dp)}</strong></span>
                  <span>Max: <strong>{m.dp === 0 ? Math.round(m.max) : m.max.toFixed(m.dp)}</strong></span>
                  <span>{m.count} reading{m.count !== 1 ? 's' : ''}</span>
                </div>
                {m.chart.length > 1 && (
                  <div className="vp-chart-wrap">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={m.chart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={40} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: '#94a3b8' }}
                        />
                        <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={2} dot={m.chart.length < 60} name={m.label} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })()}

          {/* All metric cards (condensed) */}
          <div className="vp-grid">
            {metrics.filter(m => m.key !== expanded).map(m => (
              <div
                key={m.key}
                className="vp-metric-card"
                style={{ borderLeftColor: m.color }}
                onClick={() => setExpanded(m.key)}
              >
                <div className="vp-metric-label">{m.label}</div>
                <div className="vp-metric-value">{m.dp === 0 ? Math.round(m.latest) : m.latest.toFixed(m.dp)} <small>{m.unit}</small></div>
                <div className="vp-metric-sub">
                  avg {m.dp === 0 ? Math.round(m.avg) : m.avg.toFixed(m.dp)} · {m.count} reading{m.count !== 1 ? 's' : ''}
                </div>
                {m.chart.length > 1 && (
                  <div className="vp-spark-wrap">
                    <ResponsiveContainer width="100%" height={40}>
                      <LineChart data={m.chart}>
                        <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default VitalsPage;
