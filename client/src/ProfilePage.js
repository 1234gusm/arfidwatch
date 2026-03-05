import React, { useState, useEffect } from 'react';
import './ProfilePage.css';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom (manual dates)' },
];

function ProfilePage({ token }) {
  const [username,        setUsername]        = useState('');
  const [exportPeriod,    setExportPeriod]    = useState('week');
  const [shareToken,      setShareToken]      = useState(null);
  const [hasPasscode,     setHasPasscode]     = useState(false);
  const [changingPasscode,setChangingPasscode]= useState(false);
  const [newPasscode,     setNewPasscode]     = useState('');
  const [periodSaved,     setPeriodSaved]     = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [flash,           setFlash]           = useState(null);
  const [foodLogStatus,   setFoodLogStatus]   = useState({ count: 0, earliest: null, latest: null });
  const [shareFoodLog,    setShareFoodLog]    = useState(false);
  const [hasIngestKey,    setHasIngestKey]    = useState(false);
  const [ingestKey,       setIngestKey]       = useState('');
  const [ingestCopied,    setIngestCopied]    = useState(false);
  const [ingestLastUsed,  setIngestLastUsed]  = useState(null);

  const appBasePath = window.location.pathname.replace(/\/$/, '');
  const shareUrl = shareToken
    ? `${window.location.origin}${appBasePath}/#/share/${shareToken}`
    : null;

  const showFlash = msg => { setFlash(msg); setTimeout(() => setFlash(null), 2500); };

  useEffect(() => {
    fetch('http://localhost:4000/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        setUsername(d.username || '');
        setExportPeriod(d.export_period || 'week');
        setShareToken(d.share_token || null);
        setHasPasscode(!!d.has_passcode);
        setShareFoodLog(!!d.share_food_log);
        setHasIngestKey(!!d.has_ingest_key);
        setIngestLastUsed(d.ingest_key_last_used_at || null);
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));

    fetch('http://localhost:4000/api/food-log/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setFoodLogStatus({ count: d.count || 0, earliest: d.earliest, latest: d.latest }))
      .catch(() => {});
  }, [token]);

  const callPut = async body => {
    setError(null);
    const res = await fetch('http://localhost:4000/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('save failed');
    return res.json();
  };

  const handleSavePeriod = async () => {
    try {
      await callPut({ export_period: exportPeriod });
      setPeriodSaved(true);
      setTimeout(() => setPeriodSaved(false), 2500);
    } catch { setError('Failed to save'); }
  };

  const handleGenerateShare = async () => {
    try {
      const d = await callPut({ regenerate_share: true });
      setShareToken(d.share_token);
      showFlash('Share link generated');
    } catch { setError('Failed to generate link'); }
  };

  const handleRemoveShare = async () => {
    if (!window.confirm('Remove the share link? Anyone with the current link will lose access.')) return;
    try {
      await callPut({ clear_share: true });
      setShareToken(null);
      setHasPasscode(false);
      showFlash('Share link removed');
    } catch { setError('Failed to remove link'); }
  };

  const handleSetPasscode = async () => {
    if (!newPasscode.trim()) { setError('Enter a passcode first'); return; }
    try {
      const d = await callPut({ passcode: newPasscode });
      setHasPasscode(d.has_passcode);
      setNewPasscode('');
      setChangingPasscode(false);
      showFlash('Passcode saved');
    } catch { setError('Failed to set passcode'); }
  };

  const handleClearPasscode = async () => {
    if (!window.confirm('Remove the passcode? The share link will be accessible without a code.')) return;
    try {
      const d = await callPut({ clear_passcode: true });
      setHasPasscode(d.has_passcode);
      showFlash('Passcode removed');
    } catch { setError('Failed to remove passcode'); }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClearFoodLog = async () => {
    if (!window.confirm('Remove all food log entries?')) return;
    try {
      await fetch('http://localhost:4000/api/food-log/clear', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setFoodLogStatus({ count: 0, earliest: null, latest: null });
      if (shareFoodLog) {
        setShareFoodLog(false);
        await callPut({ share_food_log: false });
      }
      showFlash('Food log cleared');
    } catch { setError('Failed to clear food log'); }
  };

  const handleToggleFoodLogShare = async (val) => {
    try {
      setShareFoodLog(val);
      await callPut({ share_food_log: val });
    } catch { setError('Failed to update'); setShareFoodLog(!val); }
  };

  const handleGenerateIngestKey = async () => {
    try {
      const d = await callPut({ regenerate_ingest_key: true });
      setHasIngestKey(!!d.has_ingest_key);
      setIngestLastUsed(d.ingest_key_last_used_at || null);
      setIngestKey(d.ingest_key || '');
      showFlash('Auto-export key generated. Copy it now.');
    } catch {
      setError('Failed to generate auto-export key');
    }
  };

  const handleRevokeIngestKey = async () => {
    if (!window.confirm('Revoke auto-export key? Existing automations will stop working.')) return;
    try {
      const d = await callPut({ clear_ingest_key: true });
      setHasIngestKey(!!d.has_ingest_key);
      setIngestLastUsed(null);
      setIngestKey('');
      showFlash('Auto-export key revoked');
    } catch {
      setError('Failed to revoke auto-export key');
    }
  };

  const handleCopyIngestKey = () => {
    if (!ingestKey) return;
    navigator.clipboard.writeText(ingestKey).then(() => {
      setIngestCopied(true);
      setTimeout(() => setIngestCopied(false), 2000);
    });
  };

  if (loading) return <div className="profile-page"><p>Loading…</p></div>;

  return (
    <div className="profile-page">
      <h2>Profile</h2>

      {error  && <p className="profile-error">{error}</p>}
      {flash  && <p className="profile-flash">{flash}</p>}

      {/* Account */}
      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-field-label">Username</span>
          <span className="profile-field-value">{username}</span>
        </div>
        <div className="profile-row">
          <span className="profile-field-label">Account security</span>
          <span className="profile-badge">bcrypt (cost 12)</span>
        </div>
      </div>

      {/* Export settings */}
      <div className="profile-card">
        <div className="profile-section-title">Export Settings</div>
        <div className="profile-row">
          <label className="profile-field-label" htmlFor="export-period">Default preview period</label>
          <select
            id="export-period"
            className="profile-select"
            value={exportPeriod}
            onChange={e => setExportPeriod(e.target.value)}
          >
            {PERIOD_OPTIONS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <button className="profile-save-btn" onClick={handleSavePeriod}>
          {periodSaved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Doctor share link */}
      <div className="profile-card">
        <div className="profile-section-title">Doctor Share Link</div>
        <p className="profile-hint">
          Generate a read-only link for your doctor. They see your health summary
          for the selected export period — no account needed.
        </p>

        {shareToken ? (
          <>
            <div className="share-link-row">
              <input className="share-link-input" readOnly value={shareUrl} />
              <button className="profile-btn-secondary" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="share-actions">
              <button className="profile-btn-secondary" onClick={handleGenerateShare}>Regenerate</button>
              <button className="profile-btn-danger" onClick={handleRemoveShare}>Remove link</button>
            </div>

            <div className="profile-section-title" style={{ marginTop: 16 }}>Passcode Protection</div>

            {hasPasscode && !changingPasscode ? (
              <div className="profile-row">
                <span className="profile-badge profile-badge--green">Passcode active</span>
                <button
                  className="profile-btn-secondary"
                  style={{ marginLeft: 10 }}
                  onClick={() => setChangingPasscode(true)}
                >
                  Change
                </button>
                <button
                  className="profile-btn-danger"
                  style={{ marginLeft: 6 }}
                  onClick={handleClearPasscode}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="profile-passcode-row">
                <input
                  type="password"
                  className="profile-passcode-input"
                  placeholder={hasPasscode ? 'New passcode' : 'Set a passcode for doctors'}
                  value={newPasscode}
                  onChange={e => setNewPasscode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetPasscode()}
                />
                <button className="profile-save-btn" onClick={handleSetPasscode}>Set</button>
                {changingPasscode && (
                  <button
                    className="profile-btn-secondary"
                    onClick={() => { setChangingPasscode(false); setNewPasscode(''); }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <button className="profile-save-btn" onClick={handleGenerateShare}>
            Generate share link
          </button>
        )}
      </div>

      {/* Food Log */}
      <div className="profile-card">
        <div className="profile-section-title">Health Auto Export API</div>
        <p className="profile-hint">
          Use a dedicated API key for automatic REST imports. Endpoint:
          <br />
          <code className="profile-code">POST https://arfidwatch.onrender.com/api/health/import</code>
        </p>

        {ingestKey ? (
          <div className="share-link-row">
            <input className="share-link-input" readOnly value={ingestKey} />
            <button className="profile-btn-secondary" onClick={handleCopyIngestKey}>
              {ingestCopied ? 'Copied!' : 'Copy key'}
            </button>
          </div>
        ) : (
          <p className="profile-hint">No key shown. Generate one below to connect your automation.</p>
        )}

        <div className="share-actions">
          <button className="profile-save-btn" onClick={handleGenerateIngestKey}>
            {hasIngestKey ? 'Rotate key' : 'Generate key'}
          </button>
          {hasIngestKey && (
            <button className="profile-btn-danger" onClick={handleRevokeIngestKey}>Revoke key</button>
          )}
        </div>

        {ingestLastUsed && (
          <p className="profile-hint">Last used: {new Date(ingestLastUsed).toLocaleString()}</p>
        )}
      </div>

      <div className="profile-card">
        <div className="profile-section-title">Food Log</div>
        <p className="profile-hint">
          Upload a MacroFactor food log CSV via the Health page — any file containing a
          &ldquo;Food&rdquo; column is automatically detected and stored here.
        </p>

        {foodLogStatus.count > 0 ? (
          <>
            <div className="profile-row">
              <span className="profile-badge profile-badge--green">
                {foodLogStatus.count.toLocaleString()} entries
                {foodLogStatus.earliest && foodLogStatus.latest
                  ? ` · ${foodLogStatus.earliest} – ${foodLogStatus.latest}`
                  : ''}
              </span>
              <button className="profile-btn-danger" onClick={handleClearFoodLog}>Clear</button>
            </div>

            <div className="profile-toggle-row">
              <div className="profile-toggle-info">
                <span className="profile-toggle-label">Include in share profile</span>
                <span className="profile-toggle-sub">
                  {shareFoodLog ? 'Meal-by-meal breakdown visible to doctor' : 'Food log hidden from share view'}
                </span>
              </div>
              <button
                className={`profile-toggle-switch${shareFoodLog ? ' profile-toggle-switch--on' : ''}`}
                onClick={() => handleToggleFoodLogShare(!shareFoodLog)}
                aria-pressed={shareFoodLog}
                role="switch"
              >
                <span className="profile-toggle-knob" />
              </button>
            </div>
          </>
        ) : (
          <p className="profile-hint" style={{ fontStyle: 'italic' }}>No food log data yet — upload your MacroFactor food log CSV on the Health page.</p>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
