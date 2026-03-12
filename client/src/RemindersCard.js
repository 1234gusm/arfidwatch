import React, { useState, useCallback, useEffect } from 'react';
import API_BASE from './apiBase';

const REMINDER_TYPES = [
  { id: 'upload_files',    label: 'Upload health files',  icon: '📁' },
  { id: 'log_medications', label: 'Log medications',      icon: '💊' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LS_KEY = 'arfidwatch_reminders';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const keyResp = await fetch(`${API_BASE}/api/push/vapid-key`);
    if (!keyResp.ok) return;
    const { publicKey } = await keyResp.json();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const subJson = sub.toJSON();
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
    });
  } catch { /* non-fatal — falls back to client-side interval */ }
}

async function syncRemindersToServer(list) {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    await fetch(`${API_BASE}/api/push/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reminders: list, timezone }),
    });
  } catch { /* non-fatal */ }
}

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
  const [adding, setAdding]     = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTime, setNewTime]   = useState('08:00');
  const [newDays, setNewDays]   = useState([1, 2, 3, 4, 5]);
  const [testStatus, setTestStatus] = useState('');

  const persist = useCallback((next) => {
    setReminders(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    syncRemindersToSW(next);
    syncRemindersToServer(next);
  }, []);

  // Register for server-side push on mount (if permission already granted)
  // or after user grants permission
  useEffect(() => {
    if (permission === 'granted') registerPushSubscription();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      registerPushSubscription();
      syncRemindersToServer(reminders);
    }
  };

  const addReminder = () => {
    if (!newDays.length) return;
    const resolvedLabel = newLabel.trim() || 'Reminder';
    persist([...reminders, {
      id:      `r_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type:    'reminder',
      label:   resolvedLabel,
      time:    newTime,
      days:    [...newDays].sort((a, b) => a - b),
      enabled: true,
    }]);
    setAdding(false);
    setNewLabel('');
    setNewTime('08:00');
    setNewDays([1, 2, 3, 4, 5]);
  };

  const testPush = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setTestStatus('sending…');
    try {
      await registerPushSubscription();
      const resp = await fetch(`${API_BASE}/api/push/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setTestStatus(data.error || 'failed — check if server has redeployed');
      } else {
        setTestStatus(`sent to ${data.sent} device(s)`);
        setTimeout(() => setTestStatus(''), 4000);
      }
    } catch (e) {
      setTestStatus('error: ' + e.message);
    }
  };

  const toggleDay = (d) => setNewDays(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
  );

  return (
    <div className="profile-card">
      <div className="profile-section-title">Reminders</div>
      <p className="profile-hint">
        Set reminders for uploading files or logging medications. Notifications are delivered by the server — they arrive even when the app is fully closed.
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
        const displayLabel = r.label || info.label;
        return (
          <div key={r.id} className="profile-toggle-row" style={{ alignItems: 'flex-start' }}>
            <div className="profile-toggle-info" style={{ flex: 1 }}>
              <span className="profile-toggle-label">{info.icon} {displayLabel}</span>
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
          {/* Custom name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="profile-hint" style={{ margin: 0, whiteSpace: 'nowrap' }}>Name</span>
            <input
              type="text"
              className="profile-passcode-input"
              style={{ flex: 1 }}
              placeholder="Reminder name"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              maxLength={60}
            />
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <button
            className="profile-btn-secondary"
            onClick={() => {
              if (permission === 'default') requestPermission();
              setAdding(true);
            }}
          >+ Add reminder</button>
          {permission === 'granted' && (
            <button
              className="profile-btn-secondary"
              style={{ fontSize: '0.8rem' }}
              onClick={testPush}
            >Test notification</button>
          )}
          {testStatus && (
            <span className="profile-hint" style={{ margin: 0, fontSize: '0.8rem' }}>{testStatus}</span>
          )}
        </div>
      )}
    </div>
  );
}
