import React, { useState, useEffect } from 'react';
import './ProfilePage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';
import { localToday, localOffset, localMonthAgo } from './utils/dateUtils';
import RemindersCard from './RemindersCard';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom (manual dates)' },
];

function ProfilePage({ token }) {
  const [username,        setUsername]        = useState('');
  const [usernameEdit,    setUsernameEdit]    = useState(false);
  const [newUsername,     setNewUsername]     = useState('');
  const [usernamePassword,setUsernamePassword]= useState('');
  const [email,           setEmail]           = useState('');
  const [emailEdit,       setEmailEdit]       = useState(false);
  const [newEmail,        setNewEmail]        = useState('');
  const [changingPw,      setChangingPw]      = useState(false);
  const [currentPw,       setCurrentPw]       = useState('');
  const [newPw,           setNewPw]           = useState('');
  const [confirmPw,       setConfirmPw]       = useState('');
  const [resetCodeSent,   setResetCodeSent]   = useState(false);
  const [resetDevCode,    setResetDevCode]    = useState('');
  const [resetCode,       setResetCode]       = useState('');
  const [resetPw,         setResetPw]         = useState('');
  const [resetPwConfirm,  setResetPwConfirm]  = useState('');
  const [resetBusy,       setResetBusy]       = useState(false);
  const [exportPeriod,    setExportPeriod]    = useState('week');
  const [shareToken,      setShareToken]      = useState(null);
  const [hasPasscode,     setHasPasscode]     = useState(false);
  const [changingPasscode,setChangingPasscode]= useState(false);
  const [newPasscode,     setNewPasscode]     = useState('');
  const [copied,          setCopied]          = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [flash,           setFlash]           = useState(null);
  const [foodLogStatus,   setFoodLogStatus]   = useState({ count: 0, earliest: null, latest: null });
  const [medStatus,       setMedStatus]       = useState({ count: 0, earliest: null, latest: null });
  const [shareFoodLog,    setShareFoodLog]    = useState(false);
  const [shareMeds,       setShareMeds]       = useState(false);
  const [shareJournal,    setShareJournal]    = useState(false);
  const [shareFoodNotes,  setShareFoodNotes]  = useState(false);
  const [sharePeriod,     setSharePeriod]     = useState(null);
  const [hasIngestKey,    setHasIngestKey]    = useState(false);
  const [ingestKey,       setIngestKey]       = useState('');
  const [ingestCopied,    setIngestCopied]    = useState(false);
  const [ingestLastUsed,  setIngestLastUsed]  = useState(null);
  const [exportCustomStart, setExportCustomStart] = useState(() => localOffset(-30));
  const [exportCustomEnd,   setExportCustomEnd]   = useState(() => localToday());
  const [includeJournal,    setIncludeJournal]    = useState(true);
  const [quickExport,       setQuickExport]       = useState(false);
  const [exporting,         setExporting]         = useState(false);
  const [exportError,       setExportError]       = useState(null);

  const appBasePath = window.location.pathname.replace(/\/$/, '');
  const shareUrl = shareToken
    ? `${window.location.origin}${appBasePath}/#/share/${shareToken}`
    : null;

  const showFlash = msg => { setFlash(msg); setTimeout(() => setFlash(null), 2500); };

  const applyProfileData = (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.username !== undefined) setUsername(d.username || '');
    if (d.email !== undefined) setEmail(d.email || '');
    if (d.export_period !== undefined) setExportPeriod(d.export_period || 'week');
    if (d.share_token !== undefined) setShareToken(d.share_token || null);
    if (d.has_passcode !== undefined) setHasPasscode(!!d.has_passcode);
    if (d.share_food_log !== undefined) setShareFoodLog(!!d.share_food_log);
    if (d.share_medications !== undefined) setShareMeds(!!d.share_medications);
    if (d.share_journal !== undefined) setShareJournal(!!d.share_journal);
    if (d.share_food_notes !== undefined) setShareFoodNotes(!!d.share_food_notes);
    if (d.share_period !== undefined) setSharePeriod(d.share_period || null);
    if (d.has_ingest_key !== undefined) setHasIngestKey(!!d.has_ingest_key);
    if (d.ingest_key_last_used_at !== undefined) setIngestLastUsed(d.ingest_key_last_used_at || null);
  };

  useEffect(() => {
    authFetch(`${API_BASE}/api/profile`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(applyProfileData)
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));

    authFetch(`${API_BASE}/api/food-log/status`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => setFoodLogStatus({ count: d.count || 0, earliest: d.earliest, latest: d.latest }))
      .catch(() => {});

    authFetch(`${API_BASE}/api/medications/status`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => setMedStatus({ count: d.count || 0, earliest: d.earliest, latest: d.latest }))
      .catch(() => {});

  }, [token]);

  const handleSaveEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    try {
      const d = await callPut({ email: trimmed || null });
      const savedEmail = Object.prototype.hasOwnProperty.call(d || {}, 'email')
        ? (d?.email || '')
        : (trimmed || '');
      setEmail(savedEmail);
      setNewEmail('');
      setEmailEdit(false);
      showFlash(savedEmail.trim() ? 'Email saved' : 'Email removed');
    } catch { setError('Failed to save email'); }
  };

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) {
      setError('Please enter a username.');
      return;
    }
    if (!usernamePassword.trim()) {
      setError('Enter your account password to confirm username change.');
      return;
    }
    try {
      const d = await callPut({ username: trimmed, username_password: usernamePassword });
      setUsername(d.username || trimmed);
      setUsernamePassword('');
      setUsernameEdit(false);
      showFlash('Username updated');
    } catch {
      setError('Failed to update username. Check your account password and try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) { setError('Fill in both password fields.'); return; }
    if (newPw !== confirmPw) { setError('New passwords do not match.'); return; }
    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    try {
      const res = await authFetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed to change password'); return; }
      setCurrentPw(''); setNewPw(''); setConfirmPw(''); setChangingPw(false);
      showFlash('Password changed');
    } catch { setError('Failed to change password'); }
  };

  const handleSendResetCode = async () => {
    if (!username || !email) {
      setError('Add an email address first to use reset-by-email code.');
      return;
    }
    setError(null);
    setResetBusy(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Failed to send reset code');
        return;
      }
      setResetCodeSent(true);
      setResetDevCode(d.dev_reset_code || '');
      showFlash('Reset code sent to your email');
    } catch {
      setError('Failed to send reset code');
    } finally {
      setResetBusy(false);
    }
  };

  const handleResetByCode = async () => {
    if (!username || !email) {
      setError('Username and email are required.');
      return;
    }
    if (!resetCode.trim()) {
      setError('Enter the reset code from your email.');
      return;
    }
    if (!resetPw) {
      setError('Enter a new password.');
      return;
    }
    if (resetPw.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (resetPw !== resetPwConfirm) {
      setError('Reset passwords do not match.');
      return;
    }

    setError(null);
    setResetBusy(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          code: resetCode.trim(),
          password: resetPw,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Failed to reset password');
        return;
      }

      setResetCode('');
      setResetPw('');
      setResetPwConfirm('');
      setResetCodeSent(false);
      setResetDevCode('');
      showFlash('Password reset complete');
    } catch {
      setError('Failed to reset password');
    } finally {
      setResetBusy(false);
    }
  };

  const callPut = async body => {
    setError(null);
    const res = await authFetch(`${API_BASE}/api/profile`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('save failed');
    const d = await res.json();
    applyProfileData(d);
    return d;
  };

  const handleSavePeriod = async (nextPeriod) => {
    const prev = exportPeriod;
    setExportPeriod(nextPeriod);
    try {
      await callPut({ export_period: nextPeriod });
      showFlash('Export period saved');
    } catch {
      setExportPeriod(prev);
      setError('Failed to save');
    }
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

  const handleSetSharePeriod = async (val) => {
    try {
      await callPut({ share_period: val });
      setSharePeriod(val);
      showFlash(val ? 'Doctor view period locked' : 'Doctor can now choose view period');
    } catch { setError('Failed to save doctor view period'); }
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
      await authFetch(`${API_BASE}/api/food-log/clear`, {
        method: 'DELETE',
        credentials: 'include',
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

  const handleToggleMedsShare = async (val) => {
    try {
      setShareMeds(val);
      await callPut({ share_medications: val });
    } catch { setError('Failed to update'); setShareMeds(!val); }
  };

  const handleToggleJournalShare = async (val) => {
    try {
      setShareJournal(val);
      await callPut({ share_journal: val });
    } catch { setError('Failed to update'); setShareJournal(!val); }
  };

  const handleToggleFoodNotesShare = async (val) => {
    try {
      setShareFoodNotes(val);
      await callPut({ share_food_notes: val });
    } catch { setError('Failed to update'); setShareFoodNotes(!val); }
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

  const handleExport = async () => {
    setExporting(true); setExportError(null);
    let start, end;
    if (exportPeriod === 'custom') {
      start = exportCustomStart; end = exportCustomEnd;
    } else if (exportPeriod === 'today') {
      start = localToday(); end = localToday();
    } else if (exportPeriod === 'week') {
      start = localOffset(-7); end = localToday();
    } else {
      start = localMonthAgo(); end = localToday();
    }
    const params = new URLSearchParams({ start, end, includeJournal: includeJournal ? '1' : '0', quick: quickExport ? '1' : '0' });
    try {
      const res = await authFetch(`${API_BASE}/api/journal/export?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) { setExportError('Export failed — check server logs.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `arfidwatch-${start}-to-${end}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setExportError('Export error: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const ingestConnection = !hasIngestKey
    ? { label: 'Not connected', hint: 'Generate a key, then add it to your Health Auto Export automation.' }
    : (ingestLastUsed
      ? { label: 'Connected', hint: `Last data received ${new Date(ingestLastUsed).toLocaleString()}.` }
      : { label: 'Waiting', hint: 'Key is ready. Send your first export to complete connection.' });

  if (loading) return <div className="profile-page"><p>Loading…</p></div>;

  return (
    <div className="profile-page">
      <h2>Settings</h2>

      {error  && <p className="profile-error">{error}</p>}
      {flash  && <p className="profile-flash">{flash}</p>}

      {/* Account */}
      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-field-label">Username</span>
          {!usernameEdit ? (
            <>
              <span className="profile-field-value" style={{ flex: 1 }}>{username}</span>
              <button
                className="profile-btn-secondary"
                onClick={() => {
                  setNewUsername(username);
                  setUsernamePassword('');
                  setUsernameEdit(true);
                }}
              >
                Change
              </button>
            </>
          ) : (
            <div className="profile-passcode-row" style={{ width: '100%' }}>
              <input
                type="text"
                className="profile-passcode-input"
                placeholder="New username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="profile-passcode-input"
                placeholder="Confirm with account password"
                value={usernamePassword}
                onChange={e => setUsernamePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
              />
              <button className="profile-save-btn" onClick={handleSaveUsername}>Save</button>
              <button
                className="profile-btn-secondary"
                onClick={() => {
                  setUsernameEdit(false);
                  setNewUsername('');
                  setUsernamePassword('');
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {!usernameEdit && (
          <p className="profile-hint" style={{ marginTop: 8 }}>
            Changing your username requires your current account password.
          </p>
        )}

        <div className="profile-section-title">Email Address</div>
        {!emailEdit ? (
          <div className="profile-row">
            {email ? (
              <>
                <span className="profile-field-value" style={{ flex: 1 }}>{email}</span>
                <button className="profile-btn-secondary" onClick={() => { setNewEmail(email); setEmailEdit(true); }}>Change</button>
              </>
            ) : (
              <>
                <span className="profile-hint" style={{ flex: 1, color: '#b05800' }}>No email — add one for account recovery</span>
                <button className="profile-btn-secondary" onClick={() => { setNewEmail(''); setEmailEdit(true); }}>Add email</button>
              </>
            )}
          </div>
        ) : (
          <div className="profile-passcode-row">
            <input
              type="email"
              className="profile-passcode-input"
              placeholder="Enter email address"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveEmail()}
              autoFocus
            />
            <button className="profile-save-btn" onClick={handleSaveEmail}>Save</button>
            {email && (
              <button className="profile-btn-danger" onClick={() => { setNewEmail(''); handleSaveEmail(); }}>Remove</button>
            )}
            <button className="profile-btn-secondary" onClick={() => { setEmailEdit(false); setNewEmail(''); }}>Cancel</button>
          </div>
        )}

        <div className="profile-section-title">Change Password</div>
        {!changingPw ? (
          <button className="profile-btn-secondary" onClick={() => setChangingPw(true)}>Change password</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="password"
              className="profile-passcode-input"
              placeholder="Current password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              className="profile-passcode-input"
              placeholder="New password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
            />
            <input
              type="password"
              className="profile-passcode-input"
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            />
            <div className="profile-row">
              <button className="profile-save-btn" onClick={handleChangePassword}>Save new password</button>
              <button className="profile-btn-secondary" onClick={() => { setChangingPw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>Cancel</button>
            </div>
          </div>
        )}

        <div className="profile-section-title" style={{ marginTop: 14 }}>Reset Password Via Email Code</div>
        <p className="profile-hint" style={{ marginBottom: 8 }}>
          Sends a verification code to your account email and lets you reset without current password.
        </p>
        <div className="profile-row">
          <button className="profile-btn-secondary" onClick={handleSendResetCode} disabled={resetBusy || !email}>
            {resetBusy ? 'Sending…' : 'Send reset code'}
          </button>
          {!email && <span className="profile-hint" style={{ marginLeft: 8 }}>Add an email first</span>}
        </div>
        {resetCodeSent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {resetDevCode && (
              <p className="profile-hint">Dev code: <strong>{resetDevCode}</strong></p>
            )}
            <input
              type="text"
              className="profile-passcode-input"
              placeholder="Email reset code"
              value={resetCode}
              onChange={e => setResetCode(e.target.value)}
            />
            <input
              type="password"
              className="profile-passcode-input"
              placeholder="New password"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
            />
            <input
              type="password"
              className="profile-passcode-input"
              placeholder="Confirm new password"
              value={resetPwConfirm}
              onChange={e => setResetPwConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleResetByCode()}
            />
            <div className="profile-row">
              <button className="profile-save-btn" onClick={handleResetByCode} disabled={resetBusy}>
                {resetBusy ? 'Saving…' : 'Reset password'}
              </button>
              <button
                className="profile-btn-secondary"
                onClick={() => {
                  setResetCodeSent(false);
                  setResetDevCode('');
                  setResetCode('');
                  setResetPw('');
                  setResetPwConfirm('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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

            <div className="profile-section-title" style={{ marginTop: 16 }}>Doctor View Period</div>
            <p className="profile-hint">
              Set how far back your doctor sees data. Leave it at "Doctor chooses" to let them pick.
            </p>
            <div className="profile-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {[
                { id: null,         label: 'Doctor chooses' },
                { id: 'week',       label: '1 week' },
                { id: 'two_weeks',  label: '2 weeks' },
                { id: 'month',      label: '1 month' },
              ].map(opt => (
                <button
                  key={String(opt.id)}
                  className={sharePeriod === opt.id ? 'profile-save-btn' : 'profile-btn-secondary'}
                  style={{ padding: '5px 13px', fontSize: '0.85rem' }}
                  onClick={() => handleSetSharePeriod(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="profile-save-btn" onClick={handleGenerateShare}>
            Generate share link
          </button>
        )}
      </div>

      {/* Export */}
      <div className="profile-card">
        <div className="profile-section-title">Export PDF Report</div>
        <p className="profile-hint">Download a full PDF of your health data &amp; journal.</p>

        <div className="profile-row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.id}
              className={exportPeriod === p.id ? 'profile-save-btn' : 'profile-btn-secondary'}
              style={{ padding: '5px 13px', fontSize: '0.85rem' }}
              onClick={() => handleSavePeriod(p.id)}
            >{p.label}</button>
          ))}
        </div>

        {exportPeriod === 'custom' && (
          <div className="profile-row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 6, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="profile-hint" style={{ margin: 0 }}>From</span>
              <input type="date" className="profile-passcode-input" style={{ width: 'auto' }} value={exportCustomStart} onChange={e => setExportCustomStart(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="profile-hint" style={{ margin: 0 }}>To</span>
              <input type="date" className="profile-passcode-input" style={{ width: 'auto' }} value={exportCustomEnd} onChange={e => setExportCustomEnd(e.target.value)} />
            </div>
          </div>
        )}

        <div className="profile-toggle-row" style={{ marginTop: 10 }}>
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Include journal entries</span>
          </div>
          <button
            className={`profile-toggle-switch${includeJournal ? ' profile-toggle-switch--on' : ''}`}
            onClick={() => setIncludeJournal(v => !v)}
            role="switch"
            aria-checked={includeJournal}
          ><span className="profile-toggle-knob" /></button>
        </div>

        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Quick export</span>
            <span className="profile-toggle-sub">Primary metrics only, no daily tables</span>
          </div>
          <button
            className={`profile-toggle-switch${quickExport ? ' profile-toggle-switch--on' : ''}`}
            onClick={() => setQuickExport(v => !v)}
            role="switch"
            aria-checked={quickExport}
          ><span className="profile-toggle-knob" /></button>
        </div>

        {exportError && <p className="profile-error" style={{ marginTop: 10 }}>{exportError}</p>}

        <button className="profile-save-btn" style={{ marginTop: 14 }} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Generating…' : '⬇️ Download PDF'}
        </button>
      </div>

      {/* Food Log */}
      <div className="profile-card">
        <div className="profile-section-title">Health Auto Export API</div>
        <p className="profile-hint">
          Endpoint:
          <br />
          <code className="profile-code">https://arfidwatch.onrender.com/api/health/import</code>
        </p>
        <div className="profile-hint profile-setup-instructions">
          <strong>How to set up in Health Auto Export:</strong>
          <ol style={{ margin: '6px 0 0 0', paddingLeft: '18px', lineHeight: 1.7 }}>
            <li>Open the <strong>Health Auto Export</strong> app and go to <strong>Automations</strong>.</li>
            <li>Create a new automation and set <strong>Automation Type</strong> to <strong>REST API</strong>.</li>
            <li>Paste the endpoint URL above into the URL field.</li>
            <li>Set <strong>Data Type</strong> to <strong>Health Metrics</strong> and select <strong>All</strong> health metrics.</li>
            <li>Under <strong>Headers</strong>, add: <code>X-INGEST-KEY</code> → your key below.</li>
            <li>Set <strong>Content-Type</strong> to <code>application/json</code>.</li>
            <li>Enable the automation and tap <strong>Run</strong> to sync.</li>
          </ol>
        </div>

        <div className="profile-row" style={{ marginBottom: 8 }}>
          <span className="profile-field-label">Connection</span>
          <span className={`profile-badge${ingestConnection.label === 'Connected' ? ' profile-badge--green' : ''}`}>
            {ingestConnection.label}
          </span>
        </div>
        <p className="profile-hint" style={{ marginBottom: 10 }}>{ingestConnection.hint}</p>

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
      </div>

      <div className="profile-card">
        <div className="profile-section-title">Doctor Share — Journal</div>
        <p className="profile-hint">
          When enabled, your journal entry titles and mood for the share period will be visible to your doctor on the share page. Entry text is never shared.
        </p>
        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Share journal with doctor</span>
            <span className="profile-toggle-sub">
              {shareJournal ? 'Journal visible on share page' : 'Journal hidden from share page'}
            </span>
          </div>
          <button
            className={`profile-toggle-switch${shareJournal ? ' profile-toggle-switch--on' : ''}`}
            onClick={() => handleToggleJournalShare(!shareJournal)}
            role="switch"
            aria-checked={shareJournal}
          >
            <span className="profile-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-section-title">Doctor Share — Food Notes</div>
        <p className="profile-hint">
          When enabled, texture and taste notes you add to food log entries will be visible to your doctor on the share page.
        </p>
        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Share food notes with doctor</span>
            <span className="profile-toggle-sub">
              {shareFoodNotes ? 'Food notes visible on share page' : 'Food notes hidden from share page'}
            </span>
          </div>
          <button
            className={`profile-toggle-switch${shareFoodNotes ? ' profile-toggle-switch--on' : ''}`}
            onClick={() => handleToggleFoodNotesShare(!shareFoodNotes)}
            role="switch"
            aria-checked={shareFoodNotes}
          >
            <span className="profile-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-section-title">Medication Log</div>
        <p className="profile-hint">
          Share medications log to your doctor.
        </p>

        {medStatus.count > 0 ? (
          <div className="profile-toggle-row">
            <div className="profile-toggle-info">
              <span className="profile-toggle-label">
                {medStatus.count.toLocaleString()} entries
                {medStatus.earliest && medStatus.latest ? ` · ${medStatus.earliest} - ${medStatus.latest}` : ''}
              </span>
              <span className="profile-toggle-sub">
                {shareMeds ? 'Medication log visible to doctor' : 'Medication log hidden from share view'}
              </span>
            </div>
            <button
              className={`profile-toggle-switch${shareMeds ? ' profile-toggle-switch--on' : ''}`}
              onClick={() => handleToggleMedsShare(!shareMeds)}
              role="switch"
              aria-checked={shareMeds}
            >
              <span className="profile-toggle-knob" />
            </button>
          </div>
        ) : (
          <p className="profile-hint" style={{ fontStyle: 'italic' }}>No medication entries yet.</p>
        )}
      </div>

      <RemindersCard />
    </div>
  );
}

export default ProfilePage;
