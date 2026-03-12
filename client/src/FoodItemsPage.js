import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './FoodItemsPage.css';
import API_BASE from './apiBase';
import { toDateKey, formatDay } from './utils/dateUtils';

const RANGE_OPTIONS = [
  { id: '7',   label: 'Last 7 days' },
  { id: '14',  label: 'Last 14 days' },
  { id: '30',  label: 'Last 30 days' },
  { id: '90',  label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

function FoodItemsPage({ token }) {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState(new Set());

  const getRange = useCallback(() => {
    if (range === 'all') return {};
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(range, 10));
    return {
      start: `${toDateKey(start)}T00:00:00`,
      end: `${toDateKey(end)}T23:59:59`,
    };
  }, [range]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = getRange();
      const params = new URLSearchParams();
      if (start) { params.set('start', start); params.set('end', end); }
      const res = await fetch(`${API_BASE}/api/food-log/items?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setRows(json.data || []);
    } catch (e) {
      setError('Failed to load food log: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [token, getRange]);

  useEffect(() => { load(); }, [load]);

  const dayGroups = useMemo(() => {
    const events = rows.map((r, idx) => {
      const valNum = v => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };
      const dateKey = String(r.date || '');
      return {
        timestamp: `${dateKey}T12:00:00`,
        time: r.meal ? String(r.meal) : 'Meal',
        dayKey: dateKey,
        dayLabel: formatDay(dateKey),
        name: String(r.food_name || ''),
        qty: r.quantity ?? null,
        calories: valNum(r.calories),
        protein: valNum(r.protein_g),
        carbs: valNum(r.carbs_g),
        fat: valNum(r.fat_g),
        fallback: false,
        order: idx,
      };
    }).filter(e => e.name && e.dayKey)
      .sort((a, b) => {
        if (a.dayKey === b.dayKey) return a.order - b.order;
        return a.dayKey < b.dayKey ? 1 : -1;
      });

    const byDay = new Map();
    events.forEach(e => {
      if (!byDay.has(e.dayKey)) byDay.set(e.dayKey, { dayLabel: e.dayLabel, entries: [] });
      byDay.get(e.dayKey).entries.push(e);
    });

    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayKey, val]) => ({ dayKey, ...val }));
  }, [rows]);

  const allDayKeys = dayGroups.map(d => d.dayKey);
  const allCollapsed = allDayKeys.length > 0 && allDayKeys.every(k => collapsedDays.has(k));

  const toggleDay = (dayKey) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsedDays(new Set());
    else setCollapsedDays(new Set(allDayKeys));
  };

  if (!token) return <div className="fi-page"><p className="fi-empty">Please log in.</p></div>;

  return (
    <div className="fi-page">
      <div className="fi-header">
        <div>
          <h2 className="fi-title">🍽️ Food Log</h2>
          <p className="fi-subtitle">Exactly what you ate, split by day</p>
        </div>
        <div className="fi-header-right">
          {allDayKeys.length > 0 && (
            <button className="fi-toggle-all-btn" onClick={toggleAll}>
              {allCollapsed ? 'Expand All ▾' : 'Collapse All ▴'}
            </button>
          )}
          <div className="fi-range-row">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`fi-range-btn${range === o.id ? ' active' : ''}`}
                onClick={() => setRange(o.id)}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="fi-error">{error}</div>}
      {loading && <div className="fi-loading">Loading food log…</div>}

      {!loading && dayGroups.length === 0 && (
        <div className="fi-empty-state">
          <p>No food entries found in this range.</p>
          <p className="fi-hint">Import a food log from the Health page.</p>
        </div>
      )}

      {!loading && dayGroups.map(day => {
        const isCollapsed = collapsedDays.has(day.dayKey);
        const totalCals = day.entries.reduce((s, e) => s + (e.calories ?? 0), 0);
        return (
          <section key={day.dayKey} className="fi-day">
            <button
              type="button"
              className="fi-day-title-btn"
              onClick={() => toggleDay(day.dayKey)}
              aria-expanded={!isCollapsed}
            >
              <span className="fi-day-chevron">{isCollapsed ? '▸' : '▾'}</span>
              <span className="fi-day-label">{day.dayLabel}</span>
              {totalCals > 0 && (
                <span className="fi-day-total-cals">{Math.round(totalCals).toLocaleString()} kcal</span>
              )}
            </button>
            {!isCollapsed && (
              <ul className="fi-list">
                {day.entries.map((e, idx) => (
                  <li key={`${e.timestamp}-${idx}`} className="fi-item">
                    <div className="fi-main">
                      <span className="fi-time">{e.time}</span>
                      <span className="fi-name">{e.name}</span>
                      {e.qty !== null && String(e.qty).trim() !== '' && (
                        <span className="fi-serving">{String(e.qty)}</span>
                      )}
                    </div>
                    <div className="fi-macros">
                      {e.calories !== null && <span>{Math.round(e.calories)} kcal</span>}
                      {e.protein !== null && <span>P {e.protein.toFixed(1)}g</span>}
                      {e.carbs !== null && <span>C {e.carbs.toFixed(1)}g</span>}
                      {e.fat !== null && <span>F {e.fat.toFixed(1)}g</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default FoodItemsPage;
