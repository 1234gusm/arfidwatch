import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './FoodItemsPage.css';

const RANGE_OPTIONS = [
  { id: '7',   label: 'Last 7 days' },
  { id: '14',  label: 'Last 14 days' },
  { id: '30',  label: 'Last 30 days' },
  { id: '90',  label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

const FOOD_TYPES = {
  name: 'macrofactor_food_name',
  calories: ['macrofactor_calories', 'macrofactor_energy', 'macrofactor_calories_kcal'],
  protein: ['macrofactor_protein', 'macrofactor_protein_g'],
  carbs: ['macrofactor_carbohydrates', 'macrofactor_carbs', 'macrofactor_carbs_g'],
  fat: ['macrofactor_fat', 'macrofactor_fat_g'],
  qty: 'macrofactor_serving_qty',
  size: 'macrofactor_serving_size',
};

const pad = n => String(n).padStart(2, '0');
const toLocalDateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const fmtTime = iso => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

function parseRaw(raw) {
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

function FoodItemsPage({ token }) {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getRange = useCallback(() => {
    if (range === 'all') return {};
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(range, 10));
    return {
      start: `${toLocalDateKey(start)}T00:00:00`,
      end: `${toLocalDateKey(end)}T23:59:59`,
    };
  }, [range]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const { start, end } = getRange();
      const params = new URLSearchParams();
      if (start) { params.set('start', start); params.set('end', end); }
      const res = await fetch(`http://localhost:4000/api/health?${params}`, {
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
    const macroRows = rows.filter(r => String(r.type || '').startsWith('macrofactor_'));
    const byEvent = new Map();
    const tsFoodNameBuckets = new Map();

    macroRows.forEach((r, idx) => {
      const raw = parseRaw(r.raw);
      const rowUid = raw.rowUid;
      const ts = r.timestamp;

      // Preferred: exact row linkage from new imports.
      if (rowUid) {
        const key = `uid:${rowUid}`;
        if (!byEvent.has(key)) byEvent.set(key, { timestamp: ts, fields: {}, order: idx });
        const evt = byEvent.get(key);
        evt.fields[r.type] = r.value;
        return;
      }

      // Fallback for older imports without rowUid.
      if (r.type === FOOD_TYPES.name) {
        const bKey = `ts:${ts}`;
        if (!tsFoodNameBuckets.has(bKey)) tsFoodNameBuckets.set(bKey, []);
        tsFoodNameBuckets.get(bKey).push({ name: String(r.value), timestamp: ts, order: idx });
      }
    });

    // Build fallback events from food_name rows only (old data cannot be linked exactly).
    tsFoodNameBuckets.forEach((items, bKey) => {
      items.forEach((item, i) => {
        const key = `${bKey}:name:${i}`;
        byEvent.set(key, {
          timestamp: item.timestamp,
          fields: { [FOOD_TYPES.name]: item.name },
          order: item.order,
          fallback: true,
        });
      });
    });

    const events = [...byEvent.values()]
      .filter(evt => evt.fields[FOOD_TYPES.name])
      .map(evt => {
        const valNum = v => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        const pickFirst = arr => {
          for (const t of arr) {
            const n = valNum(evt.fields[t]);
            if (n !== null) return n;
          }
          return null;
        };
        return {
          timestamp: evt.timestamp,
          time: fmtTime(evt.timestamp),
          dayKey: toLocalDateKey(new Date(evt.timestamp)),
          dayLabel: fmtDay(evt.timestamp),
          name: String(evt.fields[FOOD_TYPES.name]),
          qty: evt.fields[FOOD_TYPES.qty] ?? null,
          size: evt.fields[FOOD_TYPES.size] ?? null,
          calories: pickFirst(FOOD_TYPES.calories),
          protein: pickFirst(FOOD_TYPES.protein),
          carbs: pickFirst(FOOD_TYPES.carbs),
          fat: pickFirst(FOOD_TYPES.fat),
          fallback: !!evt.fallback,
          order: evt.order,
        };
      })
      .sort((a, b) => {
        if (a.timestamp === b.timestamp) return a.order - b.order;
        return a.timestamp < b.timestamp ? 1 : -1;
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

  if (!token) return <div className="fi-page"><p className="fi-empty">Please log in.</p></div>;

  return (
    <div className="fi-page">
      <div className="fi-header">
        <div>
          <h2 className="fi-title">🍽️ Food Log</h2>
          <p className="fi-subtitle">Exactly what you ate, split by day</p>
        </div>
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

      {error && <div className="fi-error">{error}</div>}
      {loading && <div className="fi-loading">Loading food log…</div>}

      {!loading && dayGroups.length === 0 && (
        <div className="fi-empty-state">
          <p>No food entries found in this range.</p>
          <p className="fi-hint">Import a MacroFactor CSV from the Health page.</p>
        </div>
      )}

      {!loading && dayGroups.map(day => (
        <section key={day.dayKey} className="fi-day">
          <h3 className="fi-day-title">{day.dayLabel}</h3>
          <ul className="fi-list">
            {day.entries.map((e, idx) => (
              <li key={`${e.timestamp}-${idx}`} className="fi-item">
                <div className="fi-main">
                  <span className="fi-time">{e.time}</span>
                  <span className="fi-name">{e.name}</span>
                  {e.qty !== null && e.size && (
                    <span className="fi-serving">{String(e.qty)} x {String(e.size)}</span>
                  )}
                </div>
                <div className="fi-macros">
                  {e.calories !== null && <span>{Math.round(e.calories)} kcal</span>}
                  {e.protein !== null && <span>P {e.protein.toFixed(1)}g</span>}
                  {e.carbs !== null && <span>C {e.carbs.toFixed(1)}g</span>}
                  {e.fat !== null && <span>F {e.fat.toFixed(1)}g</span>}
                  {e.fallback && <span className="fi-note">name-only (older import)</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default FoodItemsPage;
