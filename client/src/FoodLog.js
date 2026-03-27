import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './FoodLog.css';
import API_BASE from './apiBase';
import { formatDay, isToday } from './utils/dateUtils';

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
  const [collapsedDays, setCollapsedDays] = useState(new Set());

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

  const { byDay, days } = useMemo(() => {
    const nextByDay = {};
    const datesWithEntries = new Set();

    rows.forEach(r => {
      const day = r.date;
      if (!day) return;
      datesWithEntries.add(day); // day has real food_log_entries regardless of macro values
      const entry = {};
      if (r.dietary_energy_kcal != null) entry.dietary_energy_kcal = parseFloat(r.dietary_energy_kcal);
      if (r.protein_g != null)           entry.protein_g           = parseFloat(r.protein_g);
      if (r.carbohydrates_g != null)     entry.carbohydrates_g     = parseFloat(r.carbohydrates_g);
      if (r.total_fat_g != null)         entry.total_fat_g         = parseFloat(r.total_fat_g);
      // Always add the day — even if all macros are null, it has real entries
      nextByDay[day] = Object.keys(entry).length > 0
        ? entry
        : { dietary_energy_kcal: 0, protein_g: 0, carbohydrates_g: 0, total_fat_g: 0 };
    });

    // Zero-fill only days that have NO entries at all in the selected range
    if (range !== 'all') {
      const dayCount = parseInt(range, 10);
      const today = new Date();
      for (let i = 0; i <= dayCount; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!datesWithEntries.has(key) && !nextByDay[key]) {
          nextByDay[key] = { _empty: true, dietary_energy_kcal: 0, protein_g: 0, carbohydrates_g: 0, total_fat_g: 0 };
        }
      }
    }

    return {
      byDay: nextByDay,
      days: Object.keys(nextByDay).sort((a, b) => (a < b ? 1 : -1)),
    };
  }, [rows, range]);

  useEffect(() => {
    const validDays = new Set(days);
    setCollapsedDays(prev => {
      const next = new Set([...prev].filter(day => validDays.has(day)));
      return next.size === prev.size ? prev : next;
    });
  }, [days]);

  const toggleDay = (day) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const allCollapsed = days.length > 0 && days.every(d => collapsedDays.has(d));

  const toggleAll = () => {
    if (allCollapsed) setCollapsedDays(new Set());
    else setCollapsedDays(new Set(days));
  };

  if (!token) return <div className="fl-page"><p className="fl-empty">Please log in.</p></div>;

  return (
    <div className="fl-page">
      <div className="fl-header">
        <div>
          <h2 className="fl-title">🥗 Macros</h2>
          <p className="fl-subtitle">Daily macro summary from Food Log entries only</p>
        </div>
        <div className="fl-header-right">
        {days.length > 0 && (
          <button className="fl-toggle-all-btn" onClick={toggleAll}>
            {allCollapsed ? 'Expand All ▾' : 'Collapse All ▴'}
          </button>
        )}
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
      </div>

      {error && <div className="fl-error">{error}</div>}

      {loading && <div className="fl-loading"><span className="fl-spin" /> Loading…</div>}

      {!loading && days.length === 0 && (
        <div className="fl-empty-state">
          <div className="fl-empty-icon">🍽️</div>
          <p>No nutrition data in this range.</p>
          <p className="fl-hint">Import a food log file from the Health page.</p>
        </div>
      )}

      {!loading && days.map(day => {
        const d       = byDay[day];
        const isEmpty = !!d._empty;
        const bar  = macroBar(d);
        const cals = d['dietary_energy_kcal'];
        const secondary = Object.entries(NUTRITION_META)
          .filter(([ct, m]) => !m.primary && d[ct] !== undefined);

        return (
          <div key={day} className={`fl-day${isToday(day) ? ' fl-day--today' : ''}${isEmpty ? ' fl-day--empty' : ''}`}>
            <button
              type="button"
              className="fl-day-header fl-day-header-btn"
              onClick={() => toggleDay(day)}
              aria-expanded={!collapsedDays.has(day)}
            >
              <span className="fl-day-date">
                <span className="fl-day-chevron">{collapsedDays.has(day) ? '▸' : '▾'}</span>
                {isToday(day) && <span className="fl-today-badge">TODAY</span>}
                {formatDay(day)}
              </span>
              <span className="fl-day-cals">
                {isEmpty ? <span className="fl-day-cals--zero">0 kcal</span> : `${Math.round(cals).toLocaleString()} kcal`}
              </span>
            </button>

            {collapsedDays.has(day) ? null : (
              <>
                {isEmpty && (
                  <div className="fl-empty-day-note">No food logged — counted as 0 kcal</div>
                )}

                {/* Primary macro row */}
                <div className="fl-macros">
                  {['dietary_energy_kcal', 'protein_g', 'carbohydrates_g', 'total_fat_g'].map(ct => {
                    const meta = NUTRITION_META[ct];
                    const v    = d[ct];
                    return (
                      <div key={ct} className={`fl-macro${isEmpty ? ' fl-macro--zero' : ''}`}>
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FoodLog;
