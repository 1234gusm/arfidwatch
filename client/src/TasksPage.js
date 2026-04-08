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

const RECURRENCE_OPTIONS = [
  { value: '',         label: 'No repeat' },
  { value: 'daily',    label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'monthly',  label: 'Monthly' },
];

const RECURRENCE_LABELS = { daily: '🔁 Daily', weekdays: '🔁 Weekdays', weekly: '🔁 Weekly', monthly: '🔁 Monthly' };

const fmt12h = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m}${hr >= 12 ? 'p' : 'a'}`;
};

const relTime = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const SMART_LISTS = [
  { id: '__inbox',     label: 'Inbox',     icon: '📥' },
  { id: '__today',     label: 'Today',     icon: '📅' },
  { id: '__upcoming',  label: 'Upcoming',  icon: '🗓️' },
  { id: '__completed', label: 'Completed', icon: '✅' },
];

const fmt = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const tod = new Date(); tod.setHours(0,0,0,0);
  const tom = new Date(tod); tom.setDate(tom.getDate() + 1);
  if (d.getTime() === tod.getTime()) return 'Today';
  if (d.getTime() === tom.getTime()) return 'Tomorrow';
  const yest = new Date(tod); yest.setDate(yest.getDate() - 1);
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const isOverdue = (dateStr) => dateStr && dateStr < todayStr();

function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [lists, setLists] = useState(['Inbox']);
  const [activeList, setActiveList] = useState('__inbox');
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [newListName, setNewListName] = useState('Inbox');
  const [newRecurrence, setNewRecurrence] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingSubtaskOf, setAddingSubtaskOf] = useState(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  const [editListName, setEditListName] = useState('Inbox');
  const [editRecurrence, setEditRecurrence] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newListInput, setNewListInput] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const editInputRef = useRef(null);
  const subtaskInputRef = useRef(null);
  const addFormRef = useRef(null);

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

  /* ── Keyboard shortcut: 'n' to add task ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'n' && !showAddForm && activeList !== '__completed') {
        e.preventDefault();
        setShowAddForm(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showAddForm) {
        setShowAddForm(false); setNewTitle('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showAddForm, activeList]);

  /* ── Close add form on outside click ── */
  useEffect(() => {
    if (!showAddForm) return;
    const handler = (e) => {
      if (addFormRef.current && !addFormRef.current.contains(e.target)) {
        setShowAddForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddForm]);

  /* ── Build parent→children map ── */
  const childrenMap = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (t.parent_id) {
        if (!m[t.parent_id]) m[t.parent_id] = [];
        m[t.parent_id].push(t);
      }
    });
    // Sort children by sort_order
    Object.values(m).forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order));
    return m;
  }, [tasks]);

  /* ── Filtered tasks (top-level only) ── */
  const filtered = useMemo(() => {
    const td = todayStr();
    const topLevel = tasks.filter(t => !t.parent_id);
    let result;
    switch (activeList) {
      case '__inbox':
        result = topLevel.filter(t => t.list_name === 'Inbox' && !t.completed); break;
      case '__today':
        result = topLevel.filter(t => t.due_date && t.due_date <= td && !t.completed)
          .sort((a, b) => a.due_date.localeCompare(b.due_date)); break;
      case '__upcoming':
        result = topLevel.filter(t => t.due_date && t.due_date >= td && !t.completed)
          .sort((a, b) => a.due_date.localeCompare(b.due_date)); break;
      case '__completed':
        result = topLevel.filter(t => t.completed)
          .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')); break;
      default:
        result = topLevel.filter(t => t.list_name === activeList && !t.completed);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q)));
    }
    return result;
  }, [tasks, activeList, searchQuery]);

  /* ── Counts for sidebar badges ── */
  const counts = useMemo(() => {
    const td = todayStr();
    const top = tasks.filter(t => !t.parent_id);
    return {
      __inbox: top.filter(t => t.list_name === 'Inbox' && !t.completed).length,
      __today: top.filter(t => t.due_date && t.due_date <= td && !t.completed).length,
      __upcoming: top.filter(t => t.due_date && t.due_date >= td && !t.completed).length,
      __completed: top.filter(t => t.completed).length,
    };
  }, [tasks]);

  const listCounts = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (t.completed || t.parent_id) return;
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
          due_date: newDueDate || (activeList === '__today' ? todayStr() : null),
          priority: newPriority,
          list_name: listForTask,
          recurrence: newRecurrence || null,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setTasks(prev => [...prev, d.task]);
        setNewTitle('');
        setNewDueDate('');
        setNewPriority(0);
        setNewRecurrence('');
        if (!lists.includes(listForTask)) setLists(prev => [...prev, listForTask]);
        inputRef.current?.focus();
      }
    } catch { }
  };

  const handleAddSubtask = async (parentId) => {
    if (!subtaskTitle.trim()) return;
    try {
      const parent = tasks.find(t => t.id === parentId);
      const res = await authFetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: subtaskTitle.trim(),
          parent_id: parentId,
          list_name: parent?.list_name || 'Inbox',
          priority: 0,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setTasks(prev => [...prev, d.task]);
        setSubtaskTitle('');
        setAddingSubtaskOf(null);
      }
    } catch { }
  };

  const handleToggle = async (task) => {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next, completed_at: next ? new Date().toISOString() : null } : t));
    try {
      const res = await authFetch(`${API_BASE}/api/tasks/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      });
      if (res.ok) {
        const d = await res.json();
        // If a recurring task spawned a new occurrence, add it
        if (d.spawned) {
          setTasks(prev => [...prev, d.spawned]);
        }
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !next } : t));
    }
  };

  const handleDelete = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id && t.parent_id !== id));
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
    setEditRecurrence(task.recurrence || '');
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
      recurrence: editRecurrence || null,
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

  /* ── Drag to reorder ── */
  const handleDragStart = (e, taskId) => {
    setDragId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e, taskId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (taskId !== dragOverId) setDragOverId(taskId);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { handleDragEnd(); return; }
    const ids = filtered.map(t => t.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { handleDragEnd(); return; }

    // Reorder
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId);

    const order = reordered.map((id, i) => ({ id, sort_order: i }));
    // Optimistic UI update
    setTasks(prev => {
      const updated = [...prev];
      for (const o of order) {
        const idx = updated.findIndex(t => t.id === o.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: o.sort_order };
      }
      return updated;
    });
    handleDragEnd();

    try {
      await authFetch(`${API_BASE}/api/tasks/reorder`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
    } catch { fetchTasks(); }
  };

  const handleClearCompleted = async () => {
    const ids = tasks.filter(t => t.completed && !t.parent_id).map(t => t.id);
    if (!ids.length) return;
    setTasks(prev => prev.filter(t => !t.completed));
    try {
      await Promise.all(ids.map(id =>
        authFetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' })
      ));
    } catch { fetchTasks(); }
  };

  /* ── Render a single task item ── */
  const renderTask = (task, isSubtask = false) => {
    const children = childrenMap[task.id] || [];
    const completedChildren = children.filter(c => c.completed).length;

    return (
      <div key={task.id}>
        <div
          className={`tasks-item${task.completed ? ' tasks-item--done' : ''}${editingId === task.id ? ' tasks-item--editing' : ''}${isSubtask ? ' tasks-item--subtask' : ''}${task.priority > 0 ? ` tasks-item--p${task.priority}` : ''}${isOverdue(task.due_date) && !task.completed ? ' tasks-item--overdue' : ''}${dragId === task.id ? ' tasks-item--dragging' : ''}${dragOverId === task.id ? ' tasks-item--dragover' : ''}`}
          draggable={!isSubtask && activeList !== '__completed'}
          onDragStart={e => handleDragStart(e, task.id)}
          onDragOver={e => handleDragOver(e, task.id)}
          onDrop={e => handleDrop(e, task.id)}
          onDragEnd={handleDragEnd}
        >
          {editingId === task.id ? (
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
                <label className="tasks-edit-meta-label">
                  Repeat
                  <select className="tasks-edit-meta-input" value={editRecurrence} onChange={e => setEditRecurrence(e.target.value)}>
                    {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
            <div className="tasks-item-row">
              {!isSubtask && activeList !== '__completed' && (
                <span className="tasks-drag-handle" title="Drag to reorder">⠿</span>
              )}
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
                      {fmt(task.due_date)}{task.due_time ? ` ${fmt12h(task.due_time)}` : ''}
                    </span>
                  )}
                  {task.priority > 0 && (
                    <span className="tasks-chip" style={{ color: PRIORITY_META[task.priority].color }}>
                      ⚑ {PRIORITY_META[task.priority].label}
                    </span>
                  )}
                  {task.recurrence && (
                    <span className="tasks-chip tasks-chip--recurrence">{RECURRENCE_LABELS[task.recurrence] || '🔁'}</span>
                  )}
                  {(activeList.startsWith('__') && activeList !== '__inbox' && task.list_name !== 'Inbox') && (
                    <span className="tasks-chip tasks-chip--list">{task.list_name}</span>
                  )}
                  {children.length > 0 && (
                    <span className="tasks-chip tasks-chip--subtasks">{completedChildren}/{children.length} subtasks</span>
                  )}
                  {task.completed && task.completed_at && (
                    <span className="tasks-chip tasks-chip--completed-at">✓ {relTime(task.completed_at)}</span>
                  )}
                </div>
                {task.notes && <span className="tasks-item-notes">{task.notes}</span>}
                {children.length > 0 && (
                  <div className="tasks-progress">
                    <div className="tasks-progress-fill" style={{ width: `${(completedChildren / children.length) * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="tasks-item-actions">
                {!isSubtask && !task.completed && (
                  <button
                    className="tasks-item-add-subtask"
                    title="Add subtask"
                    onClick={(e) => { e.stopPropagation(); setAddingSubtaskOf(addingSubtaskOf === task.id ? null : task.id); setTimeout(() => subtaskInputRef.current?.focus(), 50); }}
                  >
                    ＋
                  </button>
                )}
                <button className="tasks-item-delete" onClick={() => handleDelete(task.id)}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* Subtask add form */}
        {addingSubtaskOf === task.id && (
          <div className="tasks-subtask-add">
            <input
              ref={subtaskInputRef}
              className="tasks-subtask-input"
              placeholder="Subtask name…"
              value={subtaskTitle}
              onChange={e => setSubtaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddSubtask(task.id);
                if (e.key === 'Escape') { setAddingSubtaskOf(null); setSubtaskTitle(''); }
              }}
            />
            <button className="tasks-subtask-submit" onClick={() => handleAddSubtask(task.id)}>Add</button>
            <button className="tasks-subtask-cancel" onClick={() => { setAddingSubtaskOf(null); setSubtaskTitle(''); }}>✕</button>
          </div>
        )}

        {/* Render children */}
        {children.length > 0 && (
          <div className="tasks-children">
            {children.map(child => renderTask(child, true))}
          </div>
        )}
      </div>
    );
  };

  const activeLabel = SMART_LISTS.find(s => s.id === activeList)?.label || activeList;

  if (loading) return (
    <div className="tasks-page">
      <div className="tasks-sidebar">
        {[...Array(5)].map((_, i) => <div key={i} className="tasks-skeleton-item" />)}
      </div>
      <div className="tasks-main">
        <div className="tasks-skeleton-header" />
        {[...Array(6)].map((_, i) => <div key={i} className="tasks-skeleton-task" />)}
      </div>
    </div>
  );

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
      {editingId && <div className="tasks-edit-overlay" onClick={() => { handleSaveEdit(); }} />}

      {/* ── Main area ── */}
      <div className="tasks-main">
        <div className="tasks-header">
          <button className="tasks-menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <h2 className="tasks-header-title">{activeLabel}</h2>
          <span className="tasks-header-count">{filtered.length}</span>
          <div className="tasks-search-wrap">
            <input
              className="tasks-search"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className="tasks-search-clear" onClick={() => setSearchQuery('')}>✕</button>}
          </div>
        </div>

        {/* ── Add task ── */}
        {activeList !== '__completed' && (
          <div className="tasks-add-area">
            {!showAddForm ? (
              <button className="tasks-add-trigger" onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}>
                <span className="tasks-add-plus">+</span> Add a task
              </button>
            ) : (
              <form className="tasks-add-form" onSubmit={handleAdd} ref={addFormRef}>
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
                  <select className="tasks-add-recurrence" value={newRecurrence} onChange={e => setNewRecurrence(e.target.value)}>
                    {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
              <span className="tasks-empty-icon">
                {searchQuery ? '🔍' :
                 activeList === '__completed' ? '🎉' :
                 activeList === '__today' ? '☀️' :
                 activeList === '__upcoming' ? '📅' :
                 activeList === '__inbox' ? '✨' : '📋'}
              </span>
              <span className="tasks-empty-text">
                {searchQuery ? 'No tasks match your search' :
                 activeList === '__completed' ? 'No completed tasks yet' :
                 activeList === '__today' ? 'No tasks due today — enjoy your free time!' :
                 activeList === '__upcoming' ? 'No upcoming tasks with due dates' :
                 activeList === '__inbox' ? 'Your inbox is empty — press N to add a task' :
                 `No tasks in ${activeLabel}`}
              </span>
            </div>
          )}
          {activeList === '__completed' && filtered.length > 0 && (
            <button className="tasks-clear-completed" onClick={handleClearCompleted}>🗑️ Clear all completed</button>
          )}
          {activeList === '__upcoming' ? (
            Object.entries(filtered.reduce((groups, t) => {
              const key = t.due_date || 'No date';
              (groups[key] = groups[key] || []).push(t);
              return groups;
            }, {})).map(([date, group]) => (
              <div key={date} className="tasks-date-group">
                <div className="tasks-date-group-header">
                  <span className="tasks-date-group-label">{fmt(date)}</span>
                  <span className="tasks-date-group-count">{group.length}</span>
                </div>
                {group.map(task => renderTask(task))}
              </div>
            ))
          ) : (
            filtered.map(task => renderTask(task))
          )}
        </div>
      </div>
    </div>
  );
}

export default TasksPage;
