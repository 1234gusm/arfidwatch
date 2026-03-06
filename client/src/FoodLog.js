import React, { useState, useEffect, useCallback } from 'react';
import './FoodLog.css';
import API_BASE from './apiBase';

const NUTRITION_META = {
  dietary_energy_kcal: { label: 'Calories',  unit: 'kcal',  dp: 0, primary: true  },
  protein_g:           { label: 'Protein',   unit: 'g',     dp: 1, primary: true  },
  carbohydrates_g:     { label: 'Carbs',     unit: 'g',     dp: 1, primary: true  },
  total_fat_g:         { label: 'Fat',       unit: 'g',     dp: 1, primary: true  },
  fiber_g:             { label: 'Fiber',     unit: 'g',     dp: 1, primary: false },
  sugar_g:             { label: 'Sugar',     unit: 'g',     dp: 1, primary: false },
  sodium_mg:           { label: 'Sodium',    unit: 'mg',    dp: 0, primary: false },
  water_fl_oz_us:      { label: 'Water',     unit: 'fl oz', dp: 1, primary: false },
};

const fmtVal = (v, meta) => {
  const s = meta.dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(meta.dp);
  return `${s} ${meta.unit}`;
};

const localDateStr = d => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const isToday = dateKey => {
  const t = new Date();
  const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return dateKey === key;
};

const RANGE_OPTIONS = [
  { id: '7',    label: 'Last 7 days'  },
  { id: '14',   label: 'Last 14 days' },
  { id: '30',   label: 'Last 30 days' },
  { id: '90',   label: 'Last 90 days' },
  { id: 'all',  label: 'All time'     },
];

function macroBar(day) {
  const p = (day['protein_g']       || 0) * 4;
  const c = (day['carbohydrates_g'] || 0) * 4;
  const f = (day['total_fat_g']     || 0) * 9;
  const tot = p + c + f;
  if (!tot) return null;
  return { p: Math.round(p/tot*100), c: Math.round(c/tot*100), f: Math.round(f/tot*100) };
}

function FoodLog({ token }) {
  const [rows, setRows]       = useState([]);
  const [range, setRange]     = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const buildDates = useCallback(() => {
    if (range === 'all') return {};
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(range, 10));
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { start: fmt(start) + 'T00:00:00', end: fmt(end) + 'T23:59:59' };
  }, [range]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = buildDates();
      const params = new URLSearchParams();
      if (start) { params.set('start', start); params.set('end', end); }
      const res  = await fetch(`${API_BASE}/api/food-log/daily?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setRows(json.data || []);
    } catch (e) {
      setError('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [token, buildDates]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!token) return <div className="fl-page"><p className="fl-empty">Please log in.</p></div>;

  // ── Build per-day nutrition map from aggregated food-log entries ───────────
  const byDay = {};
  rows.forEach(r => {
    const day = r.date;
    if (!day) return;
    const entry = {};
    if (r.dietary_energy_kcal != null) entry.dietary_energy_kcal = parseFloat(r.dietary_energy_kcal);
    if (r.protein_g != null)           entry.protein_g           = parseFloat(r.protein_g);
    if (r.carbohydrates_g != null)     entry.carbohydrates_g     = parseFloat(r.carbohydrates_g);
    if (r.total_fat_g != null)         entry.total_fat_g         = parseFloat(r.total_fat_g);
    if (Object.keys(entry).length > 0) byDay[day] = entry;
  });

  const days = Object.keys(byDay).sort((a, b) => (a < b ? 1 : -1)); // newest first

  return (
    <div className="fl-page">
      <div className="fl-header">
        <div>
          <h2 className="fl-title">🥗 Macros</h2>
          <p className="fl-subtitle">Daily macro summary — split by day</p>
        </div>
        <div className="fl-range-row">
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.id}
              className={`fl-range-btn${range === o.id ? ' active' : ''}`}
              onClick={() => setRange(o.id)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="fl-error">{error}</div>}

      {loading && <div className="fl-loading"><span className="fl-spin" /> Loading…</div>}

      {!loading && days.length === 0 && (
        <div className="fl-empty-state">
          <div className="fl-empty-icon">🍽️</div>
          <p>No nutrition data in this range.</p>
          <p className="fl-hint">Import your MacroFactor or Apple Health CSV from the Health page.</p>
        </div>
      )}

      {!loading && days.map(day => {
        const d    = byDay[day];
        const bar  = macroBar(d);
        const cals = d['dietary_energy_kcal'];
        const secondary = Object.entries(NUTRITION_META)
          .filter(([ct, m]) => !m.primary && d[ct] !== undefined);

        return (
          <div key={day} className={`fl-day${isToday(day) ? ' fl-day--today' : ''}`}>
            <div className="fl-day-header">
              <span className="fl-day-date">
                {isToday(day) && <span className="fl-today-badge">TODAY</span>}
                {localDateStr(day + 'T12:00:00')}
              </span>
              {cals !== undefined && (
                <span className="fl-day-cals">{Math.round(cals).toLocaleString()} kcal</span>
              )}
            </div>

            {/* Primary macro row */}
            <div className="fl-macros">
              {['dietary_energy_kcal', 'protein_g', 'carbohydrates_g', 'total_fat_g'].map(ct => {
                const meta = NUTRITION_META[ct];
                const v    = d[ct];
                return (
                  <div key={ct} className={`fl-macro${v === undefined ? ' fl-macro--missing' : ''}`}>
                    <strong>{v !== undefined ? fmtVal(v, meta) : '—'}</strong>
                    <span>{meta.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Macro split bar */}
            {bar && (
              <div className="fl-bar-wrap">
                <div className="fl-bar">
                  <div className="fl-bar-p" style={{ width: bar.p + '%' }} title={`Protein ${bar.p}%`} />
                  <div className="fl-bar-c" style={{ width: bar.c + '%' }} title={`Carbs ${bar.c}%`} />
                  <div className="fl-bar-f" style={{ width: bar.f + '%' }} title={`Fat ${bar.f}%`} />
                </div>
                <span className="fl-bar-legend">
                  <em style={{ color: '#4ac8a0' }}>P {bar.p}%</em>
                  <em style={{ color: '#4a88e0' }}>C {bar.c}%</em>
                  <em style={{ color: '#e08040' }}>F {bar.f}%</em>
                </span>
              </div>
            )}

            {/* Secondary nutrition items */}
            {secondary.length > 0 && (
              <div className="fl-secondary">
                {secondary.map(([ct, meta]) => (
                  <span key={ct} className="fl-sec-item">
                    {meta.label}: <strong>{fmtVal(d[ct], meta)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FoodLog;
