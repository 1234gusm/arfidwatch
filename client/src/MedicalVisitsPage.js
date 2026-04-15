import React, { useState, useEffect } from 'react';
import './MedicalVisitsPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

function MedicalVisitsPage({ token }) {
  const [visits, setVisits] = useState([]);
  const [expandedVisits, setExpandedVisits] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', visit_type: 'doctor', facility: '', provider: '', specialty: '', chief_complaint: '', diagnoses: '', notes: '', disposition: '', follow_up: '' });

  const fetchVisits = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/medical-visits`, { credentials: 'include' });
      const json = await res.json();
      setVisits(json.data || []);
    } catch (_) {}
  };

  useEffect(() => {
    if (token) fetchVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const createVisit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.visit_type) return;
    const body = { ...form, diagnoses_json: form.diagnoses ? form.diagnoses.split(',').map(s => s.trim()) : [] };
    delete body.diagnoses;
    await authFetch(`${API_BASE}/api/medical-visits`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    setForm({ date: '', visit_type: 'doctor', facility: '', provider: '', specialty: '', chief_complaint: '', diagnoses: '', notes: '', disposition: '', follow_up: '' });
    fetchVisits();
  };

  const deleteVisit = async (id) => {
    if (!window.confirm('Delete this visit?')) return;
    await authFetch(`${API_BASE}/api/medical-visits/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchVisits();
  };

  if (!token) return <div style={{padding:'20px',textAlign:'center'}}>Please log in</div>;

  const typeBadge = { er: '🚨 ER', doctor: '🩺 Doctor', specialist: '🔬 Specialist', urgent_care: '⚡ Urgent Care', telehealth: '💻 Telehealth' };

  return (
    <div className="mv-page">
      <div className="mv-page-header">
        <h2>Medical Visits</h2>
        <button className="mv-add-btn" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Visit'}
        </button>
      </div>

      {showForm && (
        <form className="mv-form" onSubmit={createVisit}>
          <div className="mv-form-row">
            <label>Date<input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} required /></label>
            <label>Type
              <select value={form.visit_type} onChange={e => setForm(f => ({...f, visit_type: e.target.value}))}>
                <option value="er">ER</option>
                <option value="doctor">Doctor</option>
                <option value="specialist">Specialist</option>
                <option value="urgent_care">Urgent Care</option>
                <option value="telehealth">Telehealth</option>
              </select>
            </label>
          </div>
          <div className="mv-form-row">
            <label>Facility<input value={form.facility} onChange={e => setForm(f => ({...f, facility: e.target.value}))} /></label>
            <label>Provider<input value={form.provider} onChange={e => setForm(f => ({...f, provider: e.target.value}))} /></label>
          </div>
          <div className="mv-form-row">
            <label>Specialty<input value={form.specialty} onChange={e => setForm(f => ({...f, specialty: e.target.value}))} /></label>
            <label>Chief Complaint<input value={form.chief_complaint} onChange={e => setForm(f => ({...f, chief_complaint: e.target.value}))} /></label>
          </div>
          <label>Diagnoses (comma-separated)<input value={form.diagnoses} onChange={e => setForm(f => ({...f, diagnoses: e.target.value}))} /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /></label>
          <div className="mv-form-row">
            <label>Disposition<input value={form.disposition} onChange={e => setForm(f => ({...f, disposition: e.target.value}))} /></label>
            <label>Follow-up<input value={form.follow_up} onChange={e => setForm(f => ({...f, follow_up: e.target.value}))} /></label>
          </div>
          <button type="submit" className="mv-save-btn">Save Visit</button>
        </form>
      )}

      {visits.length === 0 && !showForm && (
        <p className="muted">No visits recorded yet.</p>
      )}

      {visits.map(v => {
        const expanded = expandedVisits.has(v.id);
        const diagnoses = (() => { try { return JSON.parse(v.diagnoses_json); } catch { return []; } })();
        const vitals = (() => { try { return JSON.parse(v.vitals_json); } catch { return null; } })();
        const labs = (() => { try { return JSON.parse(v.labs_json); } catch { return null; } })();
        const ecgs = (() => { try { return JSON.parse(v.ecgs_json); } catch { return null; } })();
        const meds = (() => { try { return JSON.parse(v.medications_json); } catch { return null; } })();
        return (
          <div key={v.id} className={`mv-card mv-card--${v.visit_type}`}>
            <div className="mv-card-header" onClick={() => setExpandedVisits(prev => { const n = new Set(prev); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n; })}>
              <span className="mv-badge">{typeBadge[v.visit_type] || v.visit_type}</span>
              <span className="mv-date">{v.date}</span>
              <span className="mv-facility">{v.facility}</span>
              {v.provider && <span className="mv-provider">{v.provider}</span>}
              <span className="mv-expand-icon">{expanded ? '▾' : '▸'}</span>
            </div>
            {expanded && (
              <div className="mv-card-body">
                {v.specialty && <p><strong>Specialty:</strong> {v.specialty}</p>}
                {v.chief_complaint && <p><strong>Chief Complaint:</strong> {v.chief_complaint}</p>}
                {Array.isArray(diagnoses) && diagnoses.length > 0 && (
                  <div className="mv-diagnoses"><strong>Diagnoses:</strong> {diagnoses.join(', ')}</div>
                )}
                {vitals && (
                  <div className="mv-vitals">
                    <strong>Vitals:</strong>
                    <ul>{Object.entries(vitals).map(([k,val]) => <li key={k}>{k}: {val}</li>)}</ul>
                  </div>
                )}
                {labs && (
                  <div className="mv-labs">
                    <strong>Labs:</strong>
                    {Array.isArray(labs) ? (
                      <table className="mv-labs-table">
                        <thead><tr><th>Test</th><th>Value</th><th>Range</th><th>Flag</th></tr></thead>
                        <tbody>{labs.map((l,i) => (
                          <tr key={i} className={l.flag ? 'mv-lab-flagged' : ''}>
                            <td>{l.name}</td><td>{l.value}</td><td>{l.range || ''}</td><td>{l.flag || ''}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ) : <pre>{JSON.stringify(labs, null, 2)}</pre>}
                  </div>
                )}
                {ecgs && Array.isArray(ecgs) && ecgs.length > 0 && (
                  <div className="mv-ecgs">
                    <strong>ECGs:</strong>
                    {ecgs.map((ecg, i) => (
                      <div key={i} className="mv-ecg-item">
                        <span className="mv-ecg-time">{ecg.time}</span> — {ecg.rate} BPM
                        {ecg.interpretation && <span className="mv-ecg-interp"> — {ecg.interpretation}</span>}
                        {ecg.critical && <span className="mv-ecg-critical"> ⚠️ CRITICAL</span>}
                      </div>
                    ))}
                  </div>
                )}
                {meds && Array.isArray(meds) && meds.length > 0 && (
                  <div className="mv-meds"><strong>Medications at visit:</strong> {meds.join(', ')}</div>
                )}
                {v.notes && <div className="mv-notes"><strong>Notes:</strong><div className="mv-notes-text">{v.notes}</div></div>}
                {v.disposition && <p><strong>Disposition:</strong> {v.disposition}</p>}
                {v.follow_up && <p><strong>Follow-up:</strong> {v.follow_up}</p>}
                <button className="mv-delete-btn" onClick={() => deleteVisit(v.id)}>Delete Visit</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MedicalVisitsPage;
