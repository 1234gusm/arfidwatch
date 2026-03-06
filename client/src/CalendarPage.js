import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import API_BASE from './apiBase';
import { toDateKey } from './utils/dateUtils';

const MOODS = [
  { val: 1, emoji: '😢', label: 'Very Bad' },
  { val: 2, emoji: '😞', label: 'Bad' },
  { val: 3, emoji: '😐', label: 'Okay' },
  { val: 4, emoji: '😊', label: 'Good' },
  { val: 5, emoji: '😁', label: 'Great' },
];

function CalendarPage({ token }) {
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchEntries = async () => {
    const res = await fetch(`${API_BASE}/api/journal?start=1970-01-01`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setEntries(data.entries || []);
  };

  useEffect(() => {
    if (token) fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onClickDay = date => {
    setSelectedDate(date);
    const iso = toDateKey(date);
    const filtered = entries.filter(e => e.date.slice(0, 10) === iso);
    setDayEntries(filtered.sort((a, b) => new Date(a.date) - new Date(b.date)));
    // clear form
    setText('');
    setTitle('');
    setMood(3);
    setTime(nowTime());
  };

  const handleSave = async () => {
    if (!text.trim() && mood === 3) {
      showToast('Please add a note or select a mood', 'error');
      return;
    }
    const base = new Date(selectedDate);
    const [h, m] = time.split(':');
    base.setHours(parseInt(h), parseInt(m), 0, 0);
    // Build ISO string manually using local date parts to avoid UTC day shift.
    const iso = `${toDateKey(base)}T${String(base.getHours()).padStart(2,'0')}:${String(base.getMinutes()).padStart(2,'0')}:00`;
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
    setDayEntries(prev => [...prev, newEntry].sort((a, b) => new Date(a.date) - new Date(b.date)));
    // clear form
    setText('');
    setTitle('');
    setMood(3);
    setTime(nowTime());
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      if (!entryId) {
        showToast('No entry ID found', 'error');
        return;
      }
      
      const url = `${API_BASE}/api/journal/${entryId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const responseText = await response.text();
      if (!response.ok) {
        showToast('Failed to delete: ' + responseText, 'error');
        return;
      }
      
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setDayEntries(prev => prev.filter(e => e.id !== entryId));
      showToast('Entry deleted');
    } catch (err) {
      console.error('Delete error:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const moodEmoji = moodVal => {
    switch (moodVal) {
      case 1:
        return '😢';
      case 2:
        return '😞';
      case 3:
        return '😐';
      case 4:
        return '😊';
      case 5:
        return '😁';
      default:
        return '';
    }
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    const iso = toDateKey(date);
    const dayCount = entries.filter(e => e.date.slice(0, 10) === iso).length;
    if (dayCount === 0) return null;
    const hasText = entries.some(e => e.date.slice(0, 10) === iso && e.text);
    return (
      <div style={{ fontSize: '0.9em', color: '#001f4d', fontWeight: 'bold' }}>
        {hasText ? '📝' : '😐'} {dayCount}
      </div>
    );
  };

  // Get all days that have entries
  const daysWithEntries = [...new Set(entries.map(e => e.date.slice(0, 10)))].sort().reverse();

  if (!token) {
    return <div style={{padding: '20px', textAlign:'center'}}>Please log in</div>;
  }

  return (
    <div className="calendar-section">
      {toast && (
        <div className={`toast toast--${toast.type}`}>{toast.msg}</div>
      )}
      <h2>📅 Journal Calendar</h2>
      
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* Calendar on left */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <Calendar onClickDay={onClickDay} tileContent={tileContent} />
          
          {/* Quick access to days with entries */}
          {daysWithEntries.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4>Days with entries</h4>
              <ul className="health-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {daysWithEntries.map(dateStr => (
                  <li 
                    key={dateStr}
                    onClick={() => onClickDay(new Date(dateStr + 'T00:00:00'))}
                    style={{ 
                      cursor: 'pointer',
                      padding: '8px',
                      backgroundColor: dateStr === toDateKey(selectedDate) ? '#e0eeff' : 'transparent',
                      borderRadius: '4px'
                    }}
                  >
                    {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Day view on right */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <div style={{ 
            background: '#f8fafb', 
            padding: '20px', 
            borderRadius: '6px',
            border: '2px solid #0052cc'
          }}>
            <h3 style={{ color: '#001f4d', margin: '0 0 15px 0' }}>
              📁 {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>

            {/* All entries for this day */}
            {dayEntries.length > 0 ? (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#1a4d7a' }}>Entries ({dayEntries.length})</h4>
                {dayEntries.map((e) => {
                  const isOpen = expandedEntry === e.id;
                  const displayTitle = e.title || (e.text ? e.text.slice(0, 40) + (e.text.length > 40 ? '…' : '') : 'Entry');
                  return (
                    <div key={e.id} className="entry-detail">
                      <div
                        className="entry-header"
                        onClick={() => setExpandedEntry(isOpen ? null : e.id)}
                      >
                        <span className="entry-collapse-arrow">{isOpen ? '▾' : '▸'}</span>
                        <span className="entry-title-display">
                          {moodEmoji(e.mood)} {displayTitle}
                        </span>
                        <small className="entry-time">
                          {new Date(e.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </small>
                      </div>
                      {isOpen && (
                        <div className="entry-body">
                          {e.text && <p>{e.text}</p>}
                          <div className="entry-options">
                            <button className="delete-btn" onClick={() => handleDelete(e.id)}>Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No entries for this day yet</p>
            )}

            {/* Add new entry to this day */}
            <div style={{ borderTop: '2px solid #d0dce6', paddingTop: '15px' }}>
              <h4 style={{ color: '#1a4d7a', marginTop: 0 }}>+ Add entry</h4>
              <label>Time:</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{ width: '100%', marginTop: '8px', marginBottom: '6px' }}
              />
              <textarea 
                placeholder="What's on your mind?" 
                value={text} 
                onChange={e => setText(e.target.value)} 
                rows={3}
                style={{ width: '100%' }}
              />
                      <label style={{ marginBottom: '6px', display: 'block' }}>Mood:</label>
              <div className="mood-picker">
                {MOODS.map(m => (
                  <button
                    key={m.val}
                    type="button"
                    className={`mood-btn${mood === m.val ? ' mood-btn--active' : ''}`}
                    onClick={() => setMood(m.val)}
                    title={m.label}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
              <button onClick={handleSave} style={{ marginTop: '8px' }}>Save Entry</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;