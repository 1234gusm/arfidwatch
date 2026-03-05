import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './MedicationPage.css';

const RANGE_OPTIONS = [
  { id: '7', label: 'Last 7 days' },
  { id: '14', label: 'Last 14 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

const pad = n => String(n).padStart(2, '0');
const toDateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalDateTimeInput = (d = new Date()) => (
  `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
);

const formatDay = key => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
};

function MedicationPage({ token }) {
  const [range, setRange] = useState('30');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [takenAt, setTakenAt] = useState(() => toLocalDateTimeInput());

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
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getRange();
      const params = new URLSearchParams();
      if (start) {
        params.set('start', start);
        params.set('end', end);
      }
      const res = await fetch(`http://localhost:4000/api/medications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load medication log');
      setRows(json.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load medication log');
    } finally {
      setLoading(false);
    }
  }, [token, getRange]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const byDay = new Map();
    rows.forEach((r, idx) => {
      const day = String(r.date || '').slice(0, 10);
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ ...r, idx });
    });
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => ({
        day,
        items: items.sort((a, b) => String(a.taken_at || '') < String(b.taken_at || '') ? 1 : -1),
      }));
  }, [rows]);

  const handleAdd = async () => {
    if (!name.trim()) {
      setError('Medication name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:4000/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          medication_name: name.trim(),
          dosage: dosage.trim(),
          notes: notes.trim(),
          taken_at: takenAt,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add medication');
      setName('');
      setDosage('');
      setNotes('');
      setTakenAt(toLocalDateTimeInput());
      await load();
    } catch (e) {
      setError(e.message || 'Failed to add medication');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this medication log entry?')) return;
    try {
      const res = await fetch(`http://localhost:4000/api/medications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to delete medication entry');
    }
  };

  if (!token) return <div className="med-page"><p className="med-empty">Please log in.</p></div>;

  return (
    <div className="med-page">
      <div className="med-header">
        <div>
          <h2 className="med-title">Medication Tracker</h2>
          <p className="med-subtitle">Log doses and track your history by day</p>
        </div>
        <div className="med-range-row">
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.id}
              className={`med-range-btn${range === o.id ? ' active' : ''}`}
              onClick={() => setRange(o.id)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      <div className="med-card">
        <div className="med-form-row">
          <input
            className="med-input"
            placeholder="Medication name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="med-input"
            placeholder="Dose (e.g. 10 mg)"
            value={dosage}
            onChange={e => setDosage(e.target.value)}
          />
          <input
            className="med-input"
            type="datetime-local"
            value={takenAt}
            onChange={e => setTakenAt(e.target.value)}
          />
          <button className="med-add-btn" onClick={handleAdd} disabled={saving}>
            {saving ? 'Saving...' : 'Add'}
          </button>
        </div>
        <textarea
          className="med-notes"
          rows={2}
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {error && <div className="med-error">{error}</div>}
      {loading && <div className="med-loading">Loading medication log...</div>}

      {!loading && grouped.length === 0 && (
        <div className="med-empty-state">No medication entries in this range.</div>
      )}

      {!loading && grouped.map(g => (
        <div key={g.day} className="med-day">
          <div className="med-day-title">{formatDay(g.day)}</div>
          <ul className="med-list">
            {g.items.map(item => (
              <li key={item.id} className="med-item">
                <div className="med-main">
                  <span className="med-name">{item.medication_name}</span>
                  {item.dosage && <span className="med-dose">{item.dosage}</span>}
                </div>
                <div className="med-meta">
                  <span>{item.time || ''}</span>
                  {item.notes && <span className="med-note">{item.notes}</span>}
                </div>
                <button className="med-del" onClick={() => handleDelete(item.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default MedicationPage;
