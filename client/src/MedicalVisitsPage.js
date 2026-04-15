import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './MedicalVisitsPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

/* ── Constants ── */
const VISIT_TYPES = [
  { id: 'er',          label: 'ER',          emoji: '🚨', color: '#ef4444' },
  { id: 'doctor',      label: 'Doctor',      emoji: '🩺', color: '#3b82f6' },
  { id: 'specialist',  label: 'Specialist',  emoji: '🔬', color: '#a855f7' },
  { id: 'urgent_care', label: 'Urgent Care', emoji: '⚡', color: '#f59e0b' },
  { id: 'telehealth',  label: 'Telehealth',  emoji: '💻', color: '#14b8a6' },
];
const typeMap = Object.fromEntries(VISIT_TYPES.map(t => [t.id, t]));

const BLANK_FORM = {
  date: '', visit_type: 'doctor', facility: '', provider: '', specialty: '',
  chief_complaint: '', diagnoses: '', notes: '', disposition: '', follow_up: '',
  vitals: { BP: '', HR: '', Resp: '', SpO2: '', Temp: '', Weight: '' },
  labs: [],
  ecgs: [],
  medications: '',
};
const BLANK_LAB = { name: '', value: '', range: '', flag: '' };
const BLANK_ECG = { time: '', rate: '', interpretation: '', critical: false };

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const safeJSON = (s, fallback = null) => {
  if (!s || s === 'null') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

/* ── Component ── */
function MedicalVisitsPage({ token }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedVisits, setExpandedVisits] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);

  /* Filters */
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  /* ── Fetch ── */
  const fetchVisits = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${API_BASE}/api/medical-visits`, { credentials: 'include' });
      const json = await res.json();
      setVisits(json.data || []);
    } catch (_) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) fetchVisits(); }, [token, fetchVisits]);

  /* ── Filtered & sorted list ── */
  const filtered = useMemo(() => {
    let list = [...visits];
    if (typeFilter !== 'all') list = list.filter(v => v.visit_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        [v.facility, v.provider, v.specialty, v.chief_complaint, v.notes, v.disposition, v.follow_up, v.diagnoses_json]
          .some(f => f && f.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    return list;
  }, [visits, typeFilter, search, sortDir]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const byType = {};
    VISIT_TYPES.forEach(t => { byType[t.id] = 0; });
    visits.forEach(v => { byType[v.visit_type] = (byType[v.visit_type] || 0) + 1; });
    return { total: visits.length, byType };
  }, [visits]);

  /* ── Form helpers ── */
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setVital = (key, val) => setForm(f => ({ ...f, vitals: { ...f.vitals, [key]: val } }));
  const setLab = (i, key, val) => setForm(f => {
    const labs = [...f.labs]; labs[i] = { ...labs[i], [key]: val }; return { ...f, labs };
  });
  const addLab = () => setForm(f => ({ ...f, labs: [...f.labs, { ...BLANK_LAB }] }));
  const removeLab = (i) => setForm(f => ({ ...f, labs: f.labs.filter((_, j) => j !== i) }));
  const setEcg = (i, key, val) => setForm(f => {
    const ecgs = [...f.ecgs]; ecgs[i] = { ...ecgs[i], [key]: val }; return { ...f, ecgs };
  });
  const addEcg = () => setForm(f => ({ ...f, ecgs: [...f.ecgs, { ...BLANK_ECG }] }));
  const removeEcg = (i) => setForm(f => ({ ...f, ecgs: f.ecgs.filter((_, j) => j !== i) }));

  const openNewForm = () => {
    setEditingId(null);
    setForm({ ...BLANK_FORM, vitals: { ...BLANK_FORM.vitals }, labs: [], ecgs: [] });
    setShowForm(true);
  };

  const openEditForm = (v) => {
    const diagnoses = safeJSON(v.diagnoses_json, []);
    const vitals = safeJSON(v.vitals_json, {});
    const labs = safeJSON(v.labs_json, []);
    const ecgs = safeJSON(v.ecgs_json, []);
    const meds = safeJSON(v.medications_json, []);
    setEditingId(v.id);
    setForm({
      date: v.date || '',
      visit_type: v.visit_type || 'doctor',
      facility: v.facility || '',
      provider: v.provider || '',
      specialty: v.specialty || '',
      chief_complaint: v.chief_complaint || '',
      diagnoses: Array.isArray(diagnoses) ? diagnoses.join(', ') : '',
      notes: v.notes || '',
      disposition: v.disposition || '',
      follow_up: v.follow_up || '',
      vitals: { BP: '', HR: '', Resp: '', SpO2: '', Temp: '', Weight: '', ...vitals },
      labs: Array.isArray(labs) ? labs : [],
      ecgs: Array.isArray(ecgs) ? ecgs : [],
      medications: Array.isArray(meds) ? meds.join(', ') : '',
    });
    setShowForm(true);
    setExpandedVisits(prev => { const n = new Set(prev); n.add(v.id); return n; });
  };

  const cancelForm = () => { setShowForm(false); setEditingId(null); };

  /* ── Save (create or update) ── */
  const saveVisit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.visit_type) return;
    setSaving(true);
    const vitalsClean = Object.fromEntries(Object.entries(form.vitals).filter(([, v]) => v));
    const body = {
      date: form.date,
      visit_type: form.visit_type,
      facility: form.facility || null,
      provider: form.provider || null,
      specialty: form.specialty || null,
      chief_complaint: form.chief_complaint || null,
      diagnoses_json: form.diagnoses ? form.diagnoses.split(',').map(s => s.trim()).filter(Boolean) : [],
      vitals_json: Object.keys(vitalsClean).length ? vitalsClean : null,
      labs_json: form.labs.length ? form.labs.filter(l => l.name) : null,
      ecgs_json: form.ecgs.length ? form.ecgs.filter(e2 => e2.time || e2.rate) : null,
      medications_json: form.medications ? form.medications.split(',').map(s => s.trim()).filter(Boolean) : null,
      notes: form.notes || null,
      disposition: form.disposition || null,
      follow_up: form.follow_up || null,
    };
    try {
      if (editingId) {
        await authFetch(`${API_BASE}/api/medical-visits/${editingId}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await authFetch(`${API_BASE}/api/medical-visits`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      cancelForm();
      fetchVisits();
    } catch (_) {} finally { setSaving(false); }
  };

  const deleteVisit = async (id) => {
    if (!window.confirm('Delete this visit? This cannot be undone.')) return;
    await authFetch(`${API_BASE}/api/medical-visits/${id}`, { method: 'DELETE', credentials: 'include' });
    setExpandedVisits(prev => { const n = new Set(prev); n.delete(id); return n; });
    fetchVisits();
  };

  /* ── Expand/Collapse helpers ── */
  const toggleExpand = (id) => setExpandedVisits(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allExpanded = filtered.length > 0 && filtered.every(v => expandedVisits.has(v.id));
  const toggleAll = () => {
    if (allExpanded) setExpandedVisits(new Set());
    else setExpandedVisits(new Set(filtered.map(v => v.id)));
  };

  if (!token) return <div style={{ padding: '20px', textAlign: 'center' }}>Please log in</div>;

  return (
    <div className="mv-page">
      {/* ── Header ── */}
      <div className="mv-page-header">
        <h2>Medical Visits</h2>
        <div className="mv-header-actions">
          {filtered.length > 0 && (
            <button className="mv-expand-all-btn" onClick={toggleAll}>
              {allExpanded ? '⊟ Collapse All' : '⊞ Expand All'}
            </button>
          )}
          <button className="mv-add-btn" onClick={showForm ? cancelForm : openNewForm}>
            {showForm ? '✕ Cancel' : '+ Add Visit'}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {visits.length > 0 && (
        <div className="mv-stats-bar">
          <span className="mv-stat-total">{stats.total} visit{stats.total !== 1 ? 's' : ''}</span>
          {VISIT_TYPES.map(t => stats.byType[t.id] > 0 && (
            <span key={t.id} className="mv-stat-chip" style={{ borderColor: t.color }}>
              {t.emoji} {stats.byType[t.id]}
            </span>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      {visits.length > 0 && (
        <div className="mv-filters">
          <div className="mv-type-filters">
            <button className={`mv-type-chip ${typeFilter === 'all' ? 'mv-type-chip--active' : ''}`}
              onClick={() => setTypeFilter('all')}>All</button>
            {VISIT_TYPES.map(t => (
              <button key={t.id}
                className={`mv-type-chip ${typeFilter === t.id ? 'mv-type-chip--active' : ''}`}
                style={typeFilter === t.id ? { background: t.color + '30', borderColor: t.color, color: t.color } : {}}
                onClick={() => setTypeFilter(f => f === t.id ? 'all' : t.id)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div className="mv-search-sort">
            <input className="mv-search" placeholder="Search visits…" value={search}
              onChange={e => setSearch(e.target.value)} />
            <button className="mv-sort-btn" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}>
              {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
            </button>
          </div>
        </div>
      )}

      {/* ── Form (create / edit) ── */}
      {showForm && (
        <form className="mv-form" onSubmit={saveVisit}>
          <div className="mv-form-title">{editingId ? '✏️ Edit Visit' : '🆕 New Visit'}</div>

          {/* Basic info */}
          <fieldset className="mv-fieldset">
            <legend>Visit Info</legend>
            <div className="mv-form-row">
              <label>Date<input type="date" value={form.date} onChange={e => setField('date', e.target.value)} required /></label>
              <label>Type
                <select value={form.visit_type} onChange={e => setField('visit_type', e.target.value)}>
                  {VISIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mv-form-row">
              <label>Facility<input value={form.facility} onChange={e => setField('facility', e.target.value)} placeholder="Hospital / clinic name" /></label>
              <label>Provider<input value={form.provider} onChange={e => setField('provider', e.target.value)} placeholder="Dr. name, PA, NP…" /></label>
            </div>
            <div className="mv-form-row">
              <label>Specialty<input value={form.specialty} onChange={e => setField('specialty', e.target.value)} placeholder="Cardiology, PCP, Psych…" /></label>
              <label>Chief Complaint<input value={form.chief_complaint} onChange={e => setField('chief_complaint', e.target.value)} placeholder="Reason for visit" /></label>
            </div>
            <label>Diagnoses (comma-separated)<input value={form.diagnoses} onChange={e => setField('diagnoses', e.target.value)} placeholder="SVT, Anxiety, …" /></label>
          </fieldset>

          {/* Vitals */}
          <fieldset className="mv-fieldset">
            <legend>Vitals</legend>
            <div className="mv-vitals-grid">
              {[['BP', 'Blood Pressure', '120/80 mmHg'], ['HR', 'Heart Rate', '80 bpm'],
                ['Resp', 'Resp. Rate', '18 /min'],  ['SpO2', 'SpO₂', '98%'],
                ['Temp', 'Temperature', '98.6°F'],  ['Weight', 'Weight', '132 lb']
              ].map(([key, label, ph]) => (
                <label key={key}>{label}<input value={form.vitals[key] || ''} onChange={e => setVital(key, e.target.value)} placeholder={ph} /></label>
              ))}
            </div>
          </fieldset>

          {/* Labs */}
          <fieldset className="mv-fieldset">
            <legend>Labs ({form.labs.length})</legend>
            {form.labs.map((lab, i) => (
              <div key={i} className="mv-lab-row">
                <input placeholder="Test name" value={lab.name} onChange={e => setLab(i, 'name', e.target.value)} />
                <input placeholder="Value" value={lab.value} onChange={e => setLab(i, 'value', e.target.value)} className="mv-lab-val" />
                <input placeholder="Range" value={lab.range} onChange={e => setLab(i, 'range', e.target.value)} />
                <select value={lab.flag} onChange={e => setLab(i, 'flag', e.target.value)} className="mv-lab-flag-sel">
                  <option value="">Normal</option>
                  <option value="LOW">LOW</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <button type="button" className="mv-remove-row" onClick={() => removeLab(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="mv-add-row-btn" onClick={addLab}>+ Add Lab</button>
          </fieldset>

          {/* ECGs */}
          <fieldset className="mv-fieldset">
            <legend>ECGs ({form.ecgs.length})</legend>
            {form.ecgs.map((ecg, i) => (
              <div key={i} className="mv-ecg-row">
                <input placeholder="Time" value={ecg.time} onChange={e => setEcg(i, 'time', e.target.value)} className="mv-ecg-time-in" />
                <input placeholder="Rate (BPM)" value={ecg.rate} onChange={e => setEcg(i, 'rate', e.target.value)} type="number" className="mv-ecg-rate-in" />
                <input placeholder="Interpretation" value={ecg.interpretation} onChange={e => setEcg(i, 'interpretation', e.target.value)} />
                <label className="mv-ecg-crit-label"><input type="checkbox" checked={!!ecg.critical} onChange={e => setEcg(i, 'critical', e.target.checked)} /> Critical</label>
                <button type="button" className="mv-remove-row" onClick={() => removeEcg(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="mv-add-row-btn" onClick={addEcg}>+ Add ECG</button>
          </fieldset>

          {/* Meds & notes */}
          <fieldset className="mv-fieldset">
            <legend>Medications & Notes</legend>
            <label>Medications (comma-separated)<input value={form.medications} onChange={e => setField('medications', e.target.value)} placeholder="Lorazepam 1mg, Quetiapine 200mg…" /></label>
            <label>Notes<textarea rows={4} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Clinical course, provider notes, history…" /></label>
          </fieldset>

          {/* Disposition & follow-up */}
          <fieldset className="mv-fieldset">
            <legend>Outcome</legend>
            <div className="mv-form-row">
              <label>Disposition<input value={form.disposition} onChange={e => setField('disposition', e.target.value)} placeholder="Discharged, Admitted, etc." /></label>
              <label>Follow-up<input value={form.follow_up} onChange={e => setField('follow_up', e.target.value)} placeholder="Cardiology in 2 weeks…" /></label>
            </div>
          </fieldset>

          <div className="mv-form-actions">
            <button type="button" className="mv-cancel-btn" onClick={cancelForm}>Cancel</button>
            <button type="submit" className="mv-save-btn" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update Visit' : 'Save Visit'}
            </button>
          </div>
        </form>
      )}

      {/* ── Loading ── */}
      {loading && <div className="mv-loading">Loading visits…</div>}

      {/* ── Empty state ── */}
      {!loading && visits.length === 0 && !showForm && (
        <div className="mv-empty">
          <div className="mv-empty-icon">🏥</div>
          <p>No visits recorded yet.</p>
          <button className="mv-add-btn" onClick={openNewForm}>+ Add Your First Visit</button>
        </div>
      )}

      {/* ── No filter results ── */}
      {!loading && visits.length > 0 && filtered.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', marginTop: '2rem' }}>No visits match your filters.</p>
      )}

      {/* ── Visit cards ── */}
      {filtered.map(v => {
        const expanded = expandedVisits.has(v.id);
        const diagnoses = safeJSON(v.diagnoses_json, []);
        const vitals = safeJSON(v.vitals_json, null);
        const labs = safeJSON(v.labs_json, null);
        const ecgs = safeJSON(v.ecgs_json, null);
        const meds = safeJSON(v.medications_json, null);
        const tInfo = typeMap[v.visit_type] || { emoji: '📋', label: v.visit_type, color: '#94a3b8' };
        const flaggedLabs = Array.isArray(labs) ? labs.filter(l => l.flag) : [];
        const normalLabs = Array.isArray(labs) ? labs.filter(l => !l.flag) : [];

        return (
          <div key={v.id} className={`mv-card mv-card--${v.visit_type}`}>
            <div className="mv-card-header" onClick={() => toggleExpand(v.id)}>
              <span className="mv-badge" style={{ color: tInfo.color }}>{tInfo.emoji} {tInfo.label}</span>
              <span className="mv-date">{fmtDate(v.date)}</span>
              <span className="mv-facility">{v.facility}</span>
              {v.provider && <span className="mv-provider">{v.provider}</span>}
              {v.chief_complaint && !expanded && <span className="mv-complaint-preview">{v.chief_complaint}</span>}
              <span className="mv-expand-icon">{expanded ? '▾' : '▸'}</span>
            </div>

            {expanded && (
              <div className="mv-card-body">
                {/* Chief complaint & Specialty */}
                {(v.specialty || v.chief_complaint) && (
                  <div className="mv-detail-row">
                    {v.specialty && <span className="mv-detail-tag mv-tag-specialty">🏷️ {v.specialty}</span>}
                    {v.chief_complaint && <span className="mv-detail-tag mv-tag-complaint">💬 {v.chief_complaint}</span>}
                  </div>
                )}

                {/* Diagnoses chips */}
                {Array.isArray(diagnoses) && diagnoses.length > 0 && (
                  <div className="mv-diagnoses">
                    <strong>Diagnoses</strong>
                    <div className="mv-dx-chips">
                      {diagnoses.map((dx, i) => <span key={i} className="mv-dx-chip">{dx}</span>)}
                    </div>
                  </div>
                )}

                {/* Vitals grid */}
                {vitals && Object.keys(vitals).length > 0 && (
                  <div className="mv-section">
                    <strong>Vitals</strong>
                    <div className="mv-vitals-display">
                      {Object.entries(vitals).map(([k, val]) => (
                        <div key={k} className="mv-vital-tile">
                          <span className="mv-vital-label">{k}</span>
                          <span className="mv-vital-value">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Labs — flagged first, then normal */}
                {labs && Array.isArray(labs) && labs.length > 0 && (
                  <div className="mv-section">
                    <strong>Labs ({labs.length} tests{flaggedLabs.length > 0 && <span className="mv-flag-count"> — {flaggedLabs.length} flagged</span>})</strong>
                    {flaggedLabs.length > 0 && (
                      <>
                        <div className="mv-lab-section-label mv-lab-flagged-label">⚠️ Abnormal</div>
                        <table className="mv-labs-table">
                          <thead><tr><th>Test</th><th>Value</th><th>Range</th><th>Flag</th></tr></thead>
                          <tbody>{flaggedLabs.map((l, i) => (
                            <tr key={i} className="mv-lab-flagged">
                              <td>{l.name}</td><td>{l.value}</td><td>{l.range || ''}</td>
                              <td><span className={`mv-flag-badge mv-flag--${(l.flag || '').toLowerCase()}`}>{l.flag}</span></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </>
                    )}
                    {normalLabs.length > 0 && (
                      <>
                        <div className="mv-lab-section-label">✅ Normal ({normalLabs.length})</div>
                        <table className="mv-labs-table mv-labs-normal">
                          <thead><tr><th>Test</th><th>Value</th><th>Range</th></tr></thead>
                          <tbody>{normalLabs.map((l, i) => (
                            <tr key={i}><td>{l.name}</td><td>{l.value}</td><td>{l.range || ''}</td></tr>
                          ))}</tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}

                {/* ECGs */}
                {ecgs && Array.isArray(ecgs) && ecgs.length > 0 && (
                  <div className="mv-section">
                    <strong>ECGs ({ecgs.length})</strong>
                    {ecgs.map((ecg, i) => (
                      <div key={i} className={`mv-ecg-item ${ecg.critical ? 'mv-ecg-item--critical' : ''}`}>
                        <span className="mv-ecg-time">{ecg.time}</span>
                        <span className="mv-ecg-rate">{ecg.rate} BPM</span>
                        {ecg.interpretation && <span className="mv-ecg-interp">{ecg.interpretation}</span>}
                        {ecg.critical && <span className="mv-ecg-critical">⚠️ CRITICAL</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Medications */}
                {meds && Array.isArray(meds) && meds.length > 0 && (
                  <div className="mv-section">
                    <strong>Medications</strong>
                    <div className="mv-med-chips">{meds.map((m, i) => <span key={i} className="mv-med-chip">💊 {m}</span>)}</div>
                  </div>
                )}

                {/* Notes */}
                {v.notes && (
                  <div className="mv-section">
                    <strong>Notes</strong>
                    <div className="mv-notes-text">{v.notes}</div>
                  </div>
                )}

                {/* Disposition & Follow-up */}
                {(v.disposition || v.follow_up) && (
                  <div className="mv-section mv-outcome">
                    {v.disposition && <div className="mv-outcome-item"><strong>Disposition:</strong> {v.disposition}</div>}
                    {v.follow_up && <div className="mv-outcome-item"><strong>Follow-up:</strong> {v.follow_up}</div>}
                  </div>
                )}

                {/* Actions */}
                <div className="mv-card-actions">
                  <button className="mv-edit-btn" onClick={(e) => { e.stopPropagation(); openEditForm(v); }}>✏️ Edit</button>
                  <button className="mv-delete-btn" onClick={(e) => { e.stopPropagation(); deleteVisit(v.id); }}>🗑️ Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MedicalVisitsPage;
