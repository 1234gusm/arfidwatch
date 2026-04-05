import React, { useState, useCallback, useEffect, useRef } from 'react';
import './RemindersPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';
import { syncRemindersToSW } from './RemindersCard';

/* ── constants ─────────────────────────────────────────────── */
const LS_KEY = 'arfidwatch_reminders';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

const PRESETS = [
  { label: 'Eat',                    icon: '🍽️', times: ['08:00', '12:00', '18:00'], days: ALL_DAYS },
  { label: 'Take Meds',              icon: '💊', times: ['09:00'],                  days: ALL_DAYS },
  { label: 'Check Weight',           icon: '⚖️', times: ['07:30'],                  days: ALL_DAYS },
  { label: 'Upload MacroFactor',     icon: '📁', times: ['20:00'],                  days: ALL_DAYS },
  { label: 'Log Sleep',              icon: '🌙', times: ['08:00'],                  days: ALL_DAYS },
  { label: 'Drink Water',            icon: '💧', times: ['10:00', '14:00', '17:00'], days: ALL_DAYS },
  { label: 'Exercise',               icon: '🏃', times: ['17:00'],                  days: WEEKDAYS },
  { label: 'Send Report to Doctor',  icon: '📤', times: ['09:00'],                  days: [5] },
];

/* ── helpers ───────────────────────────────────────────────── */
function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function loadReminders() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

function fmtTime12(t24) {
  const [hh, mm] = t24.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function makeId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── component ─────────────────────────────────────────────── */
export default function RemindersPage({ token }) {
  const [reminders, setReminders] = useState(loadReminders);
  const [permission, setPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formLabel, setFormLabel] = useState('');
  const [formTimes, setFormTimes] = useState(['08:00']);
  const [formDays, setFormDays] = useState([...WEEKDAYS]);
  const [formPerDay, setFormPerDay] = useState(false);
  const [formDayTimes, setFormDayTimes] = useState({});
  const [testStatus, setTestStatus] = useState('');
  const [error, setError] = useState('');
  const addRef = useRef(null);

  /* ── persist / sync ─────────────────────────────────────── */
  const persist = useCallback((next) => {
    setReminders(next);
    setError('');
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    syncRemindersToSW(next);
    // server sync
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      authFetch(`${API_BASE}/api/push/reminders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders: next, timezone: tz }),
      }).then(resp => {
        if (!resp.ok) resp.json().then(d => setError(d.error || 'Sync failed')).catch(() => setError('Sync failed'));
      }).catch(() => setError('Could not reach server — reminders saved locally'));
    } catch { /* non-fatal */ }
  }, []);

  /* ── push registration ──────────────────────────────────── */
  const registerPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const resp = await authFetch(`${API_BASE}/api/push/vapid-key`);
      if (!resp.ok) return;
      const { publicKey } = await resp.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const j = sub.toJSON();
      await authFetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      });
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (permission === 'granted') registerPush();
  }, [permission, registerPush]);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      registerPush();
      persist(reminders);
    }
  };

  /* ── CRUD helpers ───────────────────────────────────────── */
  const addPreset = (preset) => {
    const entries = preset.times.map(time => ({
      id: makeId(), type: 'reminder',
      label: preset.label, time, days: [...preset.days], enabled: true,
    }));
    persist([...reminders, ...entries]);
  };

  const addCustom = () => {
    if (!formDays.length) return;
    const label = formLabel.trim() || 'Reminder';
    let entries;
    if (formPerDay) {
      const timeGroups = {};
      for (const d of formDays) {
        const t = formDayTimes[d] || '08:00';
        if (!timeGroups[t]) timeGroups[t] = [];
        timeGroups[t].push(d);
      }
      entries = Object.entries(timeGroups).map(([time, days]) => ({
        id: makeId(), type: 'reminder', label,
        time, days: days.sort((a, b) => a - b), enabled: true,
      }));
    } else {
      if (!formTimes.length) return;
      entries = formTimes.map(time => ({
        id: makeId(), type: 'reminder', label,
        time, days: [...formDays].sort((a, b) => a - b), enabled: true,
      }));
    }
    persist([...reminders, ...entries]);
    resetForm();
  };

  const saveEdit = () => {
    if (!formDays.length) return;
    const label = formLabel.trim() || 'Reminder';
    const oldR = reminders.find(r => r.id === editId);
    const without = reminders.filter(r => r.id !== editId);
    let entries;
    if (formPerDay) {
      const timeGroups = {};
      for (const d of formDays) {
        const t = formDayTimes[d] || '08:00';
        if (!timeGroups[t]) timeGroups[t] = [];
        timeGroups[t].push(d);
      }
      entries = Object.entries(timeGroups).map(([time, days], i) => ({
        id: i === 0 ? editId : makeId(),
        type: oldR?.type || 'reminder',
        label, time, days: days.sort((a, b) => a - b),
        enabled: oldR?.enabled ?? true,
      }));
    } else {
      if (!formTimes.length) return;
      entries = formTimes.map((time, i) => ({
        id: i === 0 ? editId : makeId(),
        type: oldR?.type || 'reminder',
        label, time, days: [...formDays].sort((a, b) => a - b),
        enabled: oldR?.enabled ?? true,
      }));
    }
    persist([...without, ...entries]);
    resetForm();
  };

  const resetForm = () => {
    setShowAdd(false);
    setEditId(null);
    setFormLabel('');
    setFormTimes(['08:00']);
    setFormDays([...WEEKDAYS]);
    setFormPerDay(false);
    setFormDayTimes({});
  };

  const toggleEnabled = (id) =>
    persist(reminders.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  const deleteReminder = (id) =>
    persist(reminders.filter(r => r.id !== id));

  const deleteGroup = (label) =>
    persist(reminders.filter(r => r.label !== label));

  const toggleGroup = (label, enable) =>
    persist(reminders.map(r => r.label === label ? { ...r, enabled: enable } : r));

  const startEdit = (r) => {
    setEditId(r.id);
    setFormLabel(r.label || '');
    setFormTimes([r.time]);
    setFormDays([...(r.days || [])]);
    setShowAdd(false);
    setTimeout(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const startAdd = () => {
    resetForm();
    setShowAdd(true);
    if (permission === 'default') requestPermission();
    setTimeout(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const toggleFormDay = (d) =>
    setFormDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const addFormTime = () => setFormTimes(prev => [...prev, '08:00']);
  const removeFormTime = (i) => setFormTimes(prev => prev.filter((_, j) => j !== i));
  const setFormTime = (i, v) => setFormTimes(prev => prev.map((t, j) => j === i ? v : t));

  const setFormDayTime = (d, v) =>
    setFormDayTimes(prev => ({ ...prev, [d]: v }));

  const togglePerDay = () => {
    if (!formPerDay) {
      const defaultTime = formTimes[0] || '08:00';
      const dayTimes = {};
      for (const d of (formDays.length ? formDays : ALL_DAYS)) {
        dayTimes[d] = defaultTime;
      }
      setFormDayTimes(dayTimes);
      if (!formDays.length) setFormDays([...ALL_DAYS]);
    }
    setFormPerDay(p => !p);
  };

  /* ── test push ──────────────────────────────────────────── */
  const testPush = async () => {
    setTestStatus('sending…');
    try {
      await registerPush();
      const resp = await authFetch(`${API_BASE}/api/push/test`, {
        method: 'POST', credentials: 'include',
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setTestStatus(data.error || 'failed');
      } else {
        setTestStatus(`sent to ${data.sent} device(s)`);
        setTimeout(() => setTestStatus(''), 4000);
      }
    } catch (e) {
      setTestStatus('error: ' + e.message);
    }
  };

  /* ── group reminders by label for display ───────────────── */
  const groups = [];
  const seen = new Map();
  for (const r of reminders) {
    const key = r.label || r.id;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ label: key, items: [r] });
    } else {
      groups[seen.get(key)].items.push(r);
    }
  }

  /* ── which presets have already been added ───────────────── */
  const existingLabels = new Set(reminders.map(r => r.label));

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="rem-page">
      {/* Header */}
      <div className="rem-header">
        <div>
          <h2 className="rem-title">Reminders</h2>
          <p className="rem-subtitle">
            Set recurring notifications — even when the app is closed.
          </p>
        </div>
        <div className="rem-header-actions">
          {permission === 'granted' && (
            <button className="rem-test-btn" onClick={testPush}>
              🔔 Test
            </button>
          )}
          {testStatus && <span className="rem-test-status">{testStatus}</span>}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rem-perm-denied" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Permission banner */}
      {permission === 'default' && (
        <button className="rem-perm-banner" onClick={requestPermission}>
          <span className="rem-perm-icon">🔔</span>
          <span>
            <strong>Enable notifications</strong>
            <br />
            <span className="rem-perm-sub">Tap to allow push notifications on this device</span>
          </span>
        </button>
      )}
      {permission === 'denied' && (
        <div className="rem-perm-denied">
          Notifications blocked — enable in browser / device settings for this site.
        </div>
      )}

      {/* Suggested presets */}
      <div className="rem-section">
        <div className="rem-section-hdr">Quick Add</div>
        <div className="rem-presets">
          {PRESETS.map(p => {
            const added = existingLabels.has(p.label);
            return (
              <button
                key={p.label}
                className={`rem-preset${added ? ' rem-preset--added' : ''}`}
                onClick={() => !added && addPreset(p)}
                disabled={added}
              >
                <span className="rem-preset-icon">{p.icon}</span>
                <span className="rem-preset-label">{p.label}</span>
                {added && <span className="rem-preset-check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reminder list */}
      <div className="rem-section">
        <div className="rem-section-hdr">
          Your Reminders
          <span className="rem-count">{reminders.length}</span>
        </div>

        {groups.length === 0 && !showAdd && (
          <div className="rem-empty">
            No reminders yet — tap a preset above or add a custom one.
          </div>
        )}

        {groups.map(g => {
          const allOff = g.items.every(i => !i.enabled);
          return (
            <div key={g.label} className={`rem-group${allOff ? ' rem-group--off' : ''}`}>
              <div className="rem-group-header">
                <span className="rem-group-label">{g.label}</span>
                <div className="rem-group-actions">
                  <button
                    className={`rem-toggle${!allOff ? ' rem-toggle--on' : ''}`}
                    onClick={() => toggleGroup(g.label, allOff)}
                    role="switch"
                    aria-checked={!allOff}
                    title={allOff ? 'Enable all' : 'Disable all'}
                  >
                    <span className="rem-toggle-knob" />
                  </button>
                  <button
                    className="rem-icon-btn rem-icon-btn--danger"
                    onClick={() => deleteGroup(g.label)}
                    title="Delete all"
                  >✕</button>
                </div>
              </div>
              <div className="rem-group-times">
                {g.items.map(r => (
                  <div key={r.id} className={`rem-item${r.enabled ? '' : ' rem-item--off'}`}>
                    <div className="rem-item-body" onClick={() => startEdit(r)}>
                      <span className="rem-item-time">{fmtTime12(r.time)}</span>
                      <span className="rem-item-days">
                        {r.days.length === 7
                          ? 'Every day'
                          : r.days.length === 5 && r.days.every((d, i) => d === i + 1)
                            ? 'Weekdays'
                            : r.days.length === 2 && r.days.includes(0) && r.days.includes(6)
                              ? 'Weekends'
                              : r.days.map(d => DAY_LABELS[d]).join(', ')}
                      </span>
                    </div>
                    <div className="rem-item-actions">
                      <button
                        className={`rem-toggle rem-toggle--sm${r.enabled ? ' rem-toggle--on' : ''}`}
                        onClick={() => toggleEnabled(r.id)}
                        role="switch"
                        aria-checked={r.enabled}
                      >
                        <span className="rem-toggle-knob" />
                      </button>
                      <button
                        className="rem-icon-btn rem-icon-btn--danger rem-icon-btn--sm"
                        onClick={() => deleteReminder(r.id)}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit form */}
      {(showAdd || editId) && (
        <div className="rem-form" ref={addRef}>
          <div className="rem-form-title">{editId ? 'Edit Reminder' : 'New Reminder'}</div>

          <label className="rem-form-label">
            Name
            <input
              type="text"
              className="rem-input"
              placeholder="e.g. Snack, Stretch, Log mood"
              value={formLabel}
              onChange={e => setFormLabel(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </label>

          {formPerDay ? (
            <div className="rem-form-label">
              Schedule
              <div className="rem-perday-grid">
                {DAY_LABELS.map((label, idx) => (
                  <div key={idx} className={`rem-perday-row${formDays.includes(idx) ? ' rem-perday-row--on' : ''}`}>
                    <button
                      className={`rem-day-btn rem-day-btn--wide${formDays.includes(idx) ? ' rem-day-btn--on' : ''}`}
                      onClick={() => toggleFormDay(idx)}
                    >{label}</button>
                    {formDays.includes(idx) && (
                      <input
                        type="time"
                        className="rem-input rem-input--time"
                        value={formDayTimes[idx] || '08:00'}
                        onChange={e => setFormDayTime(idx, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="rem-day-shortcuts">
                <button className="rem-shortcut" onClick={() => setFormDays([...ALL_DAYS])}>Every day</button>
                <button className="rem-shortcut" onClick={() => setFormDays([...WEEKDAYS])}>Weekdays</button>
                <button className="rem-shortcut" onClick={() => setFormDays([0, 6])}>Weekends</button>
              </div>
              <button className="rem-perday-toggle" onClick={togglePerDay}>
                ← Same time for all days
              </button>
            </div>
          ) : (
            <>
              <div className="rem-form-label">
                Times
                {formTimes.map((t, i) => (
                  <div key={i} className="rem-time-row">
                    <input
                      type="time"
                      className="rem-input rem-input--time"
                      value={t}
                      onChange={e => setFormTime(i, e.target.value)}
                    />
                    {formTimes.length > 1 && (
                      <button className="rem-icon-btn rem-icon-btn--danger rem-icon-btn--sm"
                        onClick={() => removeFormTime(i)}>✕</button>
                    )}
                  </div>
                ))}
                <button className="rem-add-time-btn" onClick={addFormTime}>+ Add time</button>
              </div>

              <div className="rem-form-label">
                Days
                <div className="rem-day-row">
                  {DAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      className={`rem-day-btn${formDays.includes(idx) ? ' rem-day-btn--on' : ''}`}
                      onClick={() => toggleFormDay(idx)}
                    >{label}</button>
                  ))}
                </div>
                <div className="rem-day-shortcuts">
                  <button className="rem-shortcut" onClick={() => setFormDays([...ALL_DAYS])}>Every day</button>
                  <button className="rem-shortcut" onClick={() => setFormDays([...WEEKDAYS])}>Weekdays</button>
                  <button className="rem-shortcut" onClick={() => setFormDays([0, 6])}>Weekends</button>
                </div>
                <button className="rem-perday-toggle" onClick={togglePerDay}>
                  ⏱ Different times per day
                </button>
              </div>
            </>
          )}

          <div className="rem-form-btns">
            <button className="rem-btn-primary" onClick={editId ? saveEdit : addCustom}
              disabled={!formDays.length || (!formPerDay && !formTimes.length)}>
              {editId ? 'Save' : 'Add Reminder'}
            </button>
            <button className="rem-btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Floating add button */}
      {!showAdd && !editId && (
        <button className="rem-fab" onClick={startAdd} title="Add custom reminder">
          +
        </button>
      )}
    </div>
  );
}
