import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './TasksPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

const PRIORITY_META = [
  { id: 0, label: 'None',   color: 'transparent',  dot: '#555' },
  { id: 1, label: 'Low',    color: '#3b82f6',       dot: '#3b82f6' },
  { id: 2, label: 'Medium', color: '#f59e0b',       dot: '#f59e0b' },
  { id: 3, label: 'High',   color: '#ef4444',       dot: '#ef4444' },
];

const SMART_LISTS = [
  { id: '__inbox',     label: 'Inbox',     icon: '📥' },
  { id: '__today',     label: 'Today',     icon: '📅' },
  { id: '__upcoming',  label: 'Upcoming',  icon: '🗓️' },
  { id: '__completed', label: 'Completed', icon: '✅' },
];

const fmt = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  return dateStr < today();
};

function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [lists, setLists] = useState(['Inbox']);
  const [activeList, setActiveList] = useState('__inbox');
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [newListName, setNewListName] = useState('Inbox');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  const [editListName, setEditListName] = useState('Inbox');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newListInput, setNewListInput] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  /* ── Fetch data ── */
  const fetchTasks = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/tasks`, { credentials: 'include' });
      const d = await res.json();
      setTasks(d.tasks || []);
    } catch { }
  }, []);

  const fetchLists = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/tasks/lists`, { credentials: 'include' });
      const d = await res.json();
      setLists(d.lists || ['Inbox']);
    } catch { }
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchLists()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchLists]);

  /* ── Filtered tasks ── */
  const filtered = useMemo(() => {
    const todayStr = today();
    switch (activeList) {
      case '__inbox':
        return tasks.filter(t => t.list_name === 'Inbox' && !t.completed);
      case '__today':
        return tasks.filter(t => t.due_date === todayStr && !t.completed);
      case '__upcoming':
        return tasks.filter(t => t.due_date && t.due_date >= todayStr && !t.completed)
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
      case '__completed':
        return tasks.filter(t => t.completed)
          .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
      default:
        return tasks.filter(t => t.list_name === activeList && !t.completed);
    }
  }, [tasks, activeList]);

  /* ── Counts for sidebar badges ── */
  const counts = useMemo(() => {
    const todayStr = today();
    return {
      __inbox: tasks.filter(t => t.list_name === 'Inbox' && !t.completed).length,
      __today: tasks.filter(t => t.due_date === todayStr && !t.completed).length,
      __upcoming: tasks.filter(t => t.due_date && t.due_date >= todayStr && !t.completed).length,
      __completed: tasks.filter(t => t.completed).length,
    };
  }, [tasks]);

  const listCounts = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (t.completed) return;
      m[t.list_name] = (m[t.list_name] || 0) + 1;
    });
    return m;
  }, [tasks]);

  /* ── Actions ── */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const listForTask = activeList.startsWith('__') ? newListName : activeList;
      const res = await authFetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          due_date: newDueDate || (activeList === '__today' ? today() : null),
          priority: newPriority,
          list_name: listForTask,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setTasks(prev => [...prev, d.task]);
        setNewTitle('');
        setNewDueDate('');
        setNewPriority(0);
        if (!lists.includes(listForTask)) setLists(prev => [...prev, listForTask]);
        inputRef.current?.focus();
      }
    } catch { }
  };

  const handleToggle = async (task) => {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next, completed_at: next ? new Date().toISOString() : null } : t));
    try {
      await authFetch(`${API_BASE}/api/tasks/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !next } : t));
    }
  };

  const handleDelete = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (editingId === id) setEditingId(null);
    try {
      await authFetch(`${API_BASE}/api/tasks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch { fetchTasks(); }
  };

  const handleStartEdit = (task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditNotes(task.notes || '');
    setEditDueDate(task.due_date || '');
    setEditDueTime(task.due_time || '');
    setEditPriority(task.priority);
    setEditListName(task.list_name);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    const body = {
      title: editTitle.trim(),
      notes: editNotes.trim() || null,
      due_date: editDueDate || null,
      due_time: editDueTime || null,
      priority: editPriority,
      list_name: editListName,
    };
    setTasks(prev => prev.map(t => t.id === editingId ? { ...t, ...body } : t));
    setEditingId(null);
    try {
      await authFetch(`${API_BASE}/api/tasks/${editingId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!lists.includes(editListName)) setLists(prev => [...prev, editListName]);
    } catch { fetchTasks(); }
  };

  const handleCreateList = () => {
    const name = newListInput.trim();
    if (!name || lists.includes(name)) { setShowNewList(false); setNewListInput(''); return; }
    setLists(prev => [...prev, name]);
    setActiveList(name);
    setShowNewList(false);
    setNewListInput('');
  };

  const activeLabel = SMART_LISTS.find(s => s.id === activeList)?.label || activeList;

  if (loading) return <div className="tasks-page"><p style={{ padding: 24, color: '#94a3b8' }}>Loading…</p></div>;

  return (
    <div className="tasks-page">
      {/* ── Sidebar ── */}
      <div className={`tasks-sidebar${sidebarOpen ? ' tasks-sidebar--open' : ''}`}>
        <div className="tasks-sidebar-header">
          <span className="tasks-sidebar-title">Lists</span>
          <button className="tasks-sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <div className="tasks-sidebar-smart">
          {SMART_LISTS.map(s => (
            <button
              key={s.id}
              className={`tasks-sidebar-item${activeList === s.id ? ' tasks-sidebar-item--active' : ''}`}
              onClick={() => { setActiveList(s.id); setSidebarOpen(false); }}
            >
              <span className="tasks-sidebar-icon">{s.icon}</span>
              <span className="tasks-sidebar-label">{s.label}</span>
              {counts[s.id] > 0 && <span className="tasks-sidebar-badge">{counts[s.id]}</span>}
            </button>
          ))}
        </div>
        <div className="tasks-sidebar-divider" />
        <div className="tasks-sidebar-custom">
          {lists.filter(l => l !== 'Inbox').map(l => (
            <button
              key={l}
              className={`tasks-sidebar-item${activeList === l ? ' tasks-sidebar-item--active' : ''}`}
              onClick={() => { setActiveList(l); setSidebarOpen(false); }}
            >
              <span className="tasks-sidebar-icon">📋</span>
              <span className="tasks-sidebar-label">{l}</span>
              {listCounts[l] > 0 && <span className="tasks-sidebar-badge">{listCounts[l]}</span>}
            </button>
          ))}
          {showNewList ? (
            <div className="tasks-new-list-row">
              <input
                className="tasks-new-list-input"
                placeholder="List name"
                value={newListInput}
                onChange={e => setNewListInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') { setShowNewList(false); setNewListInput(''); } }}
                autoFocus
              />
              <button className="tasks-new-list-btn" onClick={handleCreateList}>Add</button>
            </div>
          ) : (
            <button className="tasks-sidebar-add" onClick={() => setShowNewList(true)}>+ New List</button>
          )}
        </div>
      </div>
      {sidebarOpen && <div className="tasks-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main area ── */}
      <div className="tasks-main">
        <div className="tasks-header">
          <button className="tasks-menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <h2 className="tasks-header-title">{activeLabel}</h2>
          <span className="tasks-header-count">{filtered.length}</span>
        </div>

        {/* ── Add task ── */}
        {activeList !== '__completed' && (
          <div className="tasks-add-area">
            {!showAddForm ? (
              <button className="tasks-add-trigger" onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}>
                <span className="tasks-add-plus">+</span> Add a task
              </button>
            ) : (
              <form className="tasks-add-form" onSubmit={handleAdd}>
                <input
                  ref={inputRef}
                  className="tasks-add-input"
                  placeholder="Task name"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowAddForm(false); setNewTitle(''); } }}
                />
                <div className="tasks-add-meta">
                  <input
                    type="date"
                    className="tasks-add-date"
                    value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                  />
                  <select className="tasks-add-priority" value={newPriority} onChange={e => setNewPriority(Number(e.target.value))}>
                    {PRIORITY_META.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {activeList.startsWith('__') && (
                    <select className="tasks-add-list" value={newListName} onChange={e => setNewListName(e.target.value)}>
                      {lists.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  )}
                  <button type="submit" className="tasks-add-submit">Add</button>
                  <button type="button" className="tasks-add-cancel" onClick={() => { setShowAddForm(false); setNewTitle(''); }}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── Task list ── */}
        <div className="tasks-list">
          {filtered.length === 0 && (
            <div className="tasks-empty">
              <span className="tasks-empty-icon">{activeList === '__completed' ? '🎉' : '📭'}</span>
              <span className="tasks-empty-text">
                {activeList === '__completed' ? 'No completed tasks yet' : 'All clear — nothing here'}
              </span>
            </div>
          )}
          {filtered.map(task => (
            <div key={task.id} className={`tasks-item${task.completed ? ' tasks-item--done' : ''}${editingId === task.id ? ' tasks-item--editing' : ''}`}>
              {editingId === task.id ? (
                /* ── Edit mode ── */
                <div className="tasks-edit-panel">
                  <input
                    ref={editInputRef}
                    className="tasks-edit-title"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  />
                  <textarea
                    className="tasks-edit-notes"
                    placeholder="Add notes…"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    rows={2}
                  />
                  <div className="tasks-edit-meta">
                    <label className="tasks-edit-meta-label">
                      Due
                      <input type="date" className="tasks-edit-meta-input" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                    </label>
                    <label className="tasks-edit-meta-label">
                      Time
                      <input type="time" className="tasks-edit-meta-input" value={editDueTime} onChange={e => setEditDueTime(e.target.value)} />
                    </label>
                    <label className="tasks-edit-meta-label">
                      Priority
                      <select className="tasks-edit-meta-input" value={editPriority} onChange={e => setEditPriority(Number(e.target.value))}>
                        {PRIORITY_META.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="tasks-edit-meta-label">
                      List
                      <select className="tasks-edit-meta-input" value={editListName} onChange={e => setEditListName(e.target.value)}>
                        {lists.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="tasks-edit-actions">
                    <button className="tasks-edit-save" onClick={handleSaveEdit}>Save</button>
                    <button className="tasks-edit-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="tasks-edit-delete" onClick={() => handleDelete(task.id)}>Delete</button>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <div className="tasks-item-row">
                  <button
                    className={`tasks-checkbox${task.completed ? ' tasks-checkbox--done' : ''}`}
                    style={{ borderColor: PRIORITY_META[task.priority]?.dot || '#555' }}
                    onClick={() => handleToggle(task)}
                  >
                    {task.completed && <span className="tasks-checkbox-check">✓</span>}
                  </button>
                  <div className="tasks-item-content" onClick={() => !task.completed && handleStartEdit(task)}>
                    <span className="tasks-item-title">{task.title}</span>
                    <div className="tasks-item-chips">
                      {task.due_date && (
                        <span className={`tasks-chip tasks-chip--date${isOverdue(task.due_date) && !task.completed ? ' tasks-chip--overdue' : ''}`}>
                          {fmt(task.due_date)}{task.due_time ? ` ${task.due_time}` : ''}
                        </span>
                      )}
                      {task.priority > 0 && (
                        <span className="tasks-chip" style={{ color: PRIORITY_META[task.priority].color }}>
                          {'!'.repeat(task.priority)}
                        </span>
                      )}
                      {(activeList.startsWith('__') && activeList !== '__inbox' && task.list_name !== 'Inbox') && (
                        <span className="tasks-chip tasks-chip--list">{task.list_name}</span>
                      )}
                    </div>
                    {task.notes && <span className="tasks-item-notes">{task.notes}</span>}
                  </div>
                  <button className="tasks-item-delete" onClick={() => handleDelete(task.id)}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TasksPage;
