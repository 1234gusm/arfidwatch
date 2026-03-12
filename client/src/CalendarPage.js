import React, { useState, useEffect, useCallback } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './CalendarPage.css';
import API_BASE from './apiBase';
import { toDateKey } from './utils/dateUtils';

const MOODS = [
  { val: 1, emoji: '😢', label: 'Very Bad' },
  { val: 2, emoji: '😞', label: 'Bad' },
  { val: 3, emoji: '😐', label: 'Okay' },
  { val: 4, emoji: '😊', label: 'Good' },
  { val: 5, emoji: '😁', label: 'Great' },
];

const fmtWeekday = d => d.toLocaleDateString('en-US', { weekday: 'long' });
const fmtMonthDay = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const isTodayFn = d => toDateKey(d) === toDateKey(new Date());
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function CalendarPage({ token }) {
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const [entries, setEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayEntries, setDayEntries] = useState([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [mood, setMood] = useState(3);
  const [time, setTime] = useState(nowTime);
  const [toast, setToast] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [showCal, setShowCal] = useState(true);
  const [loading, setLoading] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/journal?start=1970-01-01`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (_) {
      // Silently ignore; data shows as empty if unreachable.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchEntries();
  }, [token, fetchEntries]);

  // Auto-compute day entries when entries load OR selectedDate changes —
  // ensures today's data appears immediately on mount without clicking.
  useEffect(() => {
    const iso = toDateKey(selectedDate);
    const filtered = entries.filter(e => e.date.slice(0, 10) === iso);
    setDayEntries(filtered.sort((a, b) => new Date(a.date) - new Date(b.date)));
  }, [entries, selectedDate]);

  const selectDate = (date) => {
    setSelectedDate(date);
    setText('');
    setTitle('');
    setMood(3);
    setTime(nowTime());
    setExpandedEntry(null);
  };

  const handleSave = async () => {
    if (!text.trim() && mood === 3) {
      showToast('Please add a note or select a mood', 'error');
      return;
    }
    const base = new Date(selectedDate);
    const [h, m] = time.split(':');
    base.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    const iso = `${toDateKey(base)}T${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}:00`;
    const res = await fetch(`${API_BASE}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: iso, title, text, mood }),
    });
    if (!res.ok) {
      const err = await res.text();
      showToast('Failed to save: ' + err, 'error');
      return;
    }
    const json = await res.json();
    const newEntry = { id: json.id, date: iso, title: title || '', text: text || '', mood: mood || 3 };
    setEntries(prev => [newEntry, ...prev]);
    setText('');
    setTitle('');
    setMood(3);
    setTime(nowTime());
    showToast('Entry saved');
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/journal/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        showToast('Failed to delete', 'error');
        return;
      }
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setExpandedEntry(null);
      showToast('Entry deleted');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    const iso = toDateKey(date);
    const dayEs = entries.filter(e => e.date.slice(0, 10) === iso);
    if (!dayEs.length) return null;
    const avg = dayEs.reduce((s, e) => s + (e.mood || 3), 0) / dayEs.length;
    const emoji = avg >= 4.5 ? '😁' : avg >= 3.5 ? '😊' : avg >= 2.5 ? '😐' : avg >= 1.5 ? '😞' : '😢';
    return <div className="jnl-tile-dot">{emoji}</div>;
  };

  if (!token) {
    return <div className="jnl-page"><p className="jnl-empty-text">Please log in.</p></div>;
  }

  const moodObj = MOODS.find(m => m.val === mood) || MOODS[2];

  return (
    <div className="jnl-page">
      {toast && <div className={`toast toast--${toast.type}`}>{toast.msg}</div>}

      <div className="jnl-header">
        <div>
          <h2 className="jnl-title">Journal</h2>
          <p className="jnl-subtitle">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} total</p>
        </div>
        <div className="jnl-header-actions">
          <button className="jnl-cal-toggle" onClick={() => setShowCal(v => !v)}>
            {showCal ? 'Hide calendar' : 'Show calendar'}
          </button>
          <button className="jnl-today-btn" onClick={() => selectDate(new Date())}>
            Today
          </button>
        </div>
      </div>

      {showCal && (
        <div className="jnl-cal-wrap">
          <Calendar
            onClickDay={selectDate}
            tileContent={tileContent}
            value={selectedDate}
          />
        </div>
      )}

      <div className="jnl-day-panel">
        {/* Day navigation */}
        <div className="jnl-day-nav">
          <button
            className="jnl-nav-arrow"
            onClick={() => selectDate(addDays(selectedDate, -1))}
            aria-label="Previous day"
          >‹</button>
          <div className="jnl-day-heading">
            <span className="jnl-day-weekday">{fmtWeekday(selectedDate)}</span>
            <span className="jnl-day-date">{fmtMonthDay(selectedDate)}</span>
            {isTodayFn(selectedDate) && <span className="jnl-today-badge">Today</span>}
          </div>
          <button
            className="jnl-nav-arrow"
            onClick={() => selectDate(addDays(selectedDate, 1))}
            aria-label="Next day"
          >›</button>
        </div>

        {/* Entries for this day */}
        {loading && <p className="jnl-loading">Loading…</p>}
        {!loading && dayEntries.length === 0 && (
          <div className="jnl-empty">
            <span className="jnl-empty-icon">✍️</span>
            <p>No entries for this day yet.</p>
          </div>
        )}

        <div className="jnl-entries">
          {dayEntries.map(e => {
            const isOpen = expandedEntry === e.id;
            const em = MOODS.find(m => m.val === e.mood) || MOODS[2];
            const displayTitle = e.title || (e.text ? e.text.slice(0, 52) + (e.text.length > 52 ? '…' : '') : 'Entry');
            const timeStr = new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={e.id} className={`jnl-entry${isOpen ? ' jnl-entry--open' : ''}`}>
                <button
                  className="jnl-entry-header"
                  onClick={() => setExpandedEntry(isOpen ? null : e.id)}
                >
                  <span className="jnl-entry-mood" title={em.label}>{em.emoji}</span>
                  <span className="jnl-entry-titletext">{displayTitle}</span>
                  <span className="jnl-entry-time">{timeStr}</span>
                  <span className="jnl-entry-chevron">{isOpen ? '▾' : '›'}</span>
                </button>
                {isOpen && (
                  <div className="jnl-entry-body">
                    {e.title && e.text && <div className="jnl-entry-full-title">{e.title}</div>}
                    {e.text && <p className="jnl-entry-text">{e.text}</p>}
                    <div className="jnl-entry-meta">
                      <span className="jnl-mood-chip">{em.emoji} {em.label}</span>
                      <button className="jnl-delete-btn" onClick={() => handleDelete(e.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add new entry form */}
        <div className="jnl-form">
          <div className="jnl-form-title">+ New entry</div>
          <div className="jnl-form-row">
            <input
              className="jnl-input"
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <input
              className="jnl-input jnl-input--time"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>
          <textarea
            className="jnl-textarea"
            placeholder="What's on your mind?"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
          />
          <div className="jnl-mood-row">
            <span className="jnl-mood-label-text">Mood:</span>
            {MOODS.map(m => (
              <button
                key={m.val}
                type="button"
                className={`jnl-mood-btn${mood === m.val ? ' jnl-mood-btn--active' : ''}`}
                onClick={() => setMood(m.val)}
                title={m.label}
              >
                {m.emoji}
              </button>
            ))}
            <span className="jnl-mood-selected-label">{moodObj.label}</span>
          </div>
          <button className="jnl-save-btn" onClick={handleSave}>Save Entry</button>
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;

