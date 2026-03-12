import React, { useState, useCallback } from 'react';

const REMINDER_TYPES = [
  { id: 'upload_files',    label: 'Upload health files',  icon: '📁' },
  { id: 'log_medications', label: 'Log medications',      icon: '💊' },
  { id: 'send_report',     label: 'Send report to doctor',icon: '📤' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LS_KEY = 'arfidwatch_reminders';

function loadReminders() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

export function syncRemindersToSW(list) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then(reg => { if (reg.active) reg.active.postMessage({ type: 'SET_REMINDERS', reminders: list }); })
    .catch(() => {});
}

export function initRemindersInSW() {
  syncRemindersToSW(loadReminders());
}

export default function RemindersCard() {
  const [reminders, setReminders] = useState(loadReminders);
  const [permission, setPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  );
  const [adding, setAdding]   = useState(false);
  const [newType, setNewType] = useState('log_medications');
  const [newTime, setNewTime] = useState('08:00');
  const [newDays, setNewDays] = useState([1, 2, 3, 4, 5]);

  const persist = useCallback((next) => {
    setReminders(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    syncRemindersToSW(next);
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const addReminder = () => {
    if (!newDays.length) return;
    persist([...reminders, {
      id:      `r_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type:    newType,
      time:    newTime,
      days:    [...newDays].sort((a, b) => a - b),
      enabled: true,
    }]);
    setAdding(false);
    setNewType('log_medications');
    setNewTime('08:00');
    setNewDays([1, 2, 3, 4, 5]);
  };

  const toggleDay = (d) => setNewDays(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
  );

  return (
    <div className="profile-card">
      <div className="profile-section-title">Reminders</div>
      <p className="profile-hint">
        Get notified to upload files, log medications, or send your report. Works when ArfidWatch is open or saved to your home screen.
      </p>

      {permission === 'default' && (
        <button className="profile-save-btn" style={{ marginBottom: 12 }} onClick={requestPermission}>
          Enable notifications
        </button>
      )}

      {permission === 'denied' && (
        <p className="profile-hint" style={{ color: '#c05000', marginBottom: 10 }}>
          Notifications are blocked. Enable them in your browser or device settings for this site.
        </p>
      )}

      {reminders.length === 0 && !adding && (
        <p className="profile-hint" style={{ fontStyle: 'italic', marginBottom: 8 }}>No reminders set.</p>
      )}

      {reminders.map(r => {
        const info = REMINDER_TYPES.find(t => t.id === r.type) || { icon: '🔔', label: r.type };
        return (
          <div key={r.id} className="profile-toggle-row" style={{ alignItems: 'flex-start' }}>
            <div className="profile-toggle-info" style={{ flex: 1 }}>
              <span className="profile-toggle-label">{info.icon} {info.label}</span>
              <span className="profile-toggle-sub">
                {r.time} &middot; {r.days.map(d => DAY_LABELS[d]).join(', ')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button
                className={`profile-toggle-switch${r.enabled ? ' profile-toggle-switch--on' : ''}`}
                onClick={() => persist(reminders.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}
                role="switch"
                aria-checked={r.enabled}
              ><span className="profile-toggle-knob" /></button>
              <button
                className="profile-btn-danger"
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => persist(reminders.filter(x => x.id !== r.id))}
              >✕</button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Type selector */}
          <div className="profile-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {REMINDER_TYPES.map(t => (
              <button
                key={t.id}
                className={newType === t.id ? 'profile-save-btn' : 'profile-btn-secondary'}
                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                onClick={() => setNewType(t.id)}
              >{t.icon} {t.label}</button>
            ))}
          </div>

          {/* Time picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="profile-hint" style={{ margin: 0 }}>Time</span>
            <input
              type="time"
              className="profile-passcode-input"
              style={{ width: 'auto' }}
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
            />
          </div>

          {/* Day picker */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 20,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background:   newDays.includes(idx) ? '#0066cc' : 'transparent',
                  color:        newDays.includes(idx) ? '#fff'    : '#6898b0',
                  borderColor:  newDays.includes(idx) ? '#0066cc' : '#334455',
                  transition:   'all 0.15s',
                }}
              >{label}</button>
            ))}
          </div>

          <div className="profile-row" style={{ marginTop: 2 }}>
            <button className="profile-save-btn" onClick={addReminder} disabled={!newDays.length}>Add</button>
            <button className="profile-btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          className="profile-btn-secondary"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (permission === 'default') requestPermission();
            setAdding(true);
          }}
        >+ Add reminder</button>
      )}
    </div>
  );
}
