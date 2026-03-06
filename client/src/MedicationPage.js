import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './MedicationPage.css';
import API_BASE from './apiBase';

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

const readableTextColor = (hex) => {
  const m = String(hex || '').match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 160 ? '#0f172a' : '#ffffff';
};

const normalizeMatchKey = (v) => String(v || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

function MedicationPage({ token }) {
  const [range, setRange] = useState('30');
  const [rows, setRows] = useState([]);
  const [quickButtons, setQuickButtons] = useState([]);
  const [draggingButtonId, setDraggingButtonId] = useState(null);
  const [editingQuickButtonId, setEditingQuickButtonId] = useState(null);
  const [editQuickName, setEditQuickName] = useState('');
  const [editQuickDosage, setEditQuickDosage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [nameOptions, setNameOptions] = useState([]);
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [takenAt, setTakenAt] = useState(() => toLocalDateTimeInput());
  const longPressTimerRef = useRef(null);
  const didLongPressRef = useRef(false);
  const [entryColors, setEntryColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('medEntryColors_v1') || '{}'); } catch { return {}; }
  });

  const handleEntryColorChange = (id, color) => {
    const next = { ...entryColors, [id]: color };
    setEntryColors(next);
    localStorage.setItem('medEntryColors_v1', JSON.stringify(next));
  };

  const existingQuickNameKeys = useMemo(
    () => new Set(quickButtons.map(b => String(b.medication_name || '').trim().toLowerCase())),
    [quickButtons]
  );

  const hasCloseAutocompleteMatch = useMemo(() => {
    const typed = normalizeMatchKey(name);
    if (!typed) return false;
    return nameOptions.some((opt) => {
      const candidate = normalizeMatchKey(opt);
      return candidate === typed || candidate.includes(typed) || typed.includes(candidate);
    });
  }, [name, nameOptions]);

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
      const res = await fetch(`${API_BASE}/api/medications?${params.toString()}`, {
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

  const loadQuickButtons = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/medications/quick-buttons`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load quick buttons');
      setQuickButtons(json.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load quick buttons');
    }
  }, [token]);

  useEffect(() => { loadQuickButtons(); }, [loadQuickButtons]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (name.trim()) params.set('q', name.trim());
    fetch(`${API_BASE}/api/medications/names?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setNameOptions(Array.isArray(d.names) ? d.names : []))
      .catch(() => {});
  }, [token, name]);

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
      const res = await fetch(`${API_BASE}/api/medications`, {
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
      const res = await fetch(`${API_BASE}/api/medications/${id}`, {
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

  const handleCreateQuickButton = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/medications/quick-buttons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          medication_name: name.trim(),
          dosage: dosage.trim(),
          color: '#0a66c2',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create quick button');
      await loadQuickButtons();
    } catch (e) {
      setError(e.message || 'Failed to create quick button');
    }
  };

  const handleQuickLog = async (button) => {
    try {
      const res = await fetch(`${API_BASE}/api/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          medication_name: button.medication_name,
          dosage: button.dosage || '',
          notes: '',
          taken_at: toLocalDateTimeInput(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed quick log');
      await load();
    } catch (e) {
      setError(e.message || 'Failed quick log');
    }
  };

  const handleDeleteQuickButton = async (id) => {
    if (!window.confirm('Delete this quick medication button?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/medications/quick-buttons/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete button');
      await loadQuickButtons();
    } catch (e) {
      setError(e.message || 'Failed to delete button');
    }
  };

  const beginQuickButtonEdit = (btn) => {
    setEditingQuickButtonId(btn.id);
    setEditQuickName(String(btn.medication_name || ''));
    setEditQuickDosage(String(btn.dosage || ''));
  };

  const cancelQuickButtonEdit = () => {
    setEditingQuickButtonId(null);
    setEditQuickName('');
    setEditQuickDosage('');
  };

  const saveQuickButtonEdit = async (id) => {
    const medicationName = editQuickName.trim();
    if (!medicationName) {
      setError('Medication name is required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/medications/quick-buttons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          medication_name: medicationName,
          dosage: editQuickDosage.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save quick button');
      cancelQuickButtonEdit();
      await loadQuickButtons();
    } catch (e) {
      setError(e.message || 'Failed to save quick button');
    }
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (btn) => {
    cancelLongPress();
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      beginQuickButtonEdit(btn);
    }, 550);
  };

  const handleColorChange = async (id, color) => {
    setQuickButtons(prev => prev.map(b => b.id === id ? { ...b, color } : b));
    try {
      const res = await fetch(`${API_BASE}/api/medications/quick-buttons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ color }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update color');
    } catch (e) {
      setError(e.message || 'Failed to update color');
      await loadQuickButtons();
    }
  };

  const persistQuickButtonOrder = async (buttons) => {
    const ids = buttons.map(b => b.id);
    const res = await fetch(`${API_BASE}/api/medications/quick-buttons/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to reorder');
  };

  const moveQuickButton = async (fromId, toId) => {
    if (fromId == null || toId == null || fromId === toId) return;
    const fromIndex = quickButtons.findIndex(b => b.id === fromId);
    const toIndex = quickButtons.findIndex(b => b.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...quickButtons];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setQuickButtons(reordered);
    try {
      await persistQuickButtonOrder(reordered);
    } catch (e) {
      setError(e.message || 'Failed to reorder');
      await loadQuickButtons();
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
        <div className="med-quick-header">
          <strong>Quick Log Buttons</strong>
          <span className="med-quick-sub">Drag to reorder. Tap button to log instantly.</span>
        </div>

        {quickButtons.length > 0 && (
          <div className="med-quick-grid">
            {quickButtons.map(btn => (
              <div
                key={btn.id}
                className="med-quick-item"
                draggable={editingQuickButtonId !== btn.id}
                onDragStart={() => setDraggingButtonId(btn.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={async () => {
                  const fromId = draggingButtonId;
                  setDraggingButtonId(null);
                  await moveQuickButton(fromId, btn.id);
                }}
              >
                {editingQuickButtonId === btn.id ? (
                  <div className="med-quick-edit-wrap">
                    <input
                      className="med-quick-edit-input"
                      value={editQuickName}
                      onChange={e => setEditQuickName(e.target.value)}
                      placeholder="Medication"
                    />
                    <input
                      className="med-quick-edit-input"
                      value={editQuickDosage}
                      onChange={e => setEditQuickDosage(e.target.value)}
                      placeholder="Dose"
                    />
                    <div className="med-quick-edit-actions">
                      <button className="med-create-quick-btn" onClick={() => saveQuickButtonEdit(btn.id)}>Save</button>
                      <button className="med-quick-del" onClick={cancelQuickButtonEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      className="med-quick-log-btn"
                      style={{
                        backgroundColor: btn.color || '#0a66c2',
                        color: readableTextColor(btn.color || '#0a66c2'),
                      }}
                      onMouseDown={() => startLongPress(btn)}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={() => startLongPress(btn)}
                      onTouchEnd={cancelLongPress}
                      onTouchCancel={cancelLongPress}
                      onClick={() => {
                        if (didLongPressRef.current) {
                          didLongPressRef.current = false;
                          return;
                        }
                        handleQuickLog(btn);
                      }}
                      title={`Quick log ${btn.medication_name} (long-press to edit)`}
                    >
                      <span className="med-quick-name">{btn.medication_name}</span>
                      {btn.dosage && <span className="med-quick-dose">{btn.dosage}</span>}
                    </button>
                    <div className="med-quick-controls">
                      <label className="med-color-btn" title="Set button color" style={{ backgroundColor: btn.color || '#0a66c2' }}>
                        🖌️
                        <input
                          type="color"
                          value={btn.color || '#0a66c2'}
                          onChange={e => handleColorChange(btn.id, e.target.value)}
                          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
                        />
                      </label>
                      <button className="med-quick-del" onClick={() => beginQuickButtonEdit(btn)}>Edit</button>
                      <button className="med-quick-del" onClick={() => handleDeleteQuickButton(btn.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="med-form-row">
          <input
            className="med-input"
            placeholder="Medication name"
            list="medication-name-options"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <datalist id="medication-name-options">
            {nameOptions.map(opt => <option key={opt} value={opt} />)}
          </datalist>
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
        <p className="med-name-hint">
          Autocomplete includes brand and generic names. If a name is not listed, just type it and add it. Entries are saved under one canonical generic name when an alias match exists.
        </p>
        {name.trim() && !hasCloseAutocompleteMatch && (
          <div className="med-custom-add-row">
            <button className="med-custom-add-chip" onClick={handleAdd} disabled={saving}>
              Add "{name.trim()}" as custom entry
            </button>
          </div>
        )}
        {name.trim() && !existingQuickNameKeys.has(name.trim().toLowerCase()) && (
          <div className="med-create-quick-row">
            <button className="med-create-quick-btn" onClick={handleCreateQuickButton}>
              Create quick button for "{name.trim()}"{dosage.trim() ? ` (${dosage.trim()})` : ''}
            </button>
          </div>
        )}
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
          <div className="med-day-title">
            <span>{formatDay(g.day)}</span>
            <span className="med-day-count">{g.items.length} entr{g.items.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <ul className="med-list">
            {g.items.map(item => (
              <li key={item.id} className="med-item" style={{ borderLeft: `3px solid ${entryColors[item.id] || 'transparent'}` }}>
                <div className="med-main">
                  <span className="med-name">{item.medication_name}</span>
                  {item.dosage && <span className="med-dose">{item.dosage}</span>}
                </div>
                <div className="med-actions">
                  <label className="med-color-entry-btn" title="Color-code this entry" style={{ backgroundColor: entryColors[item.id] || 'rgba(255,255,255,0.08)' }}>
                    🖌️
                    <input
                      type="color"
                      value={entryColors[item.id] || '#4a90e2'}
                      onChange={e => handleEntryColorChange(item.id, e.target.value)}
                      style={{ position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
                    />
                  </label>
                  <button className="med-del" onClick={() => handleDelete(item.id)}>Delete</button>
                </div>
                <div className="med-meta">
                  <span>{item.time || ''}</span>
                  {item.notes && <span className="med-note">{item.notes}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default MedicationPage;
