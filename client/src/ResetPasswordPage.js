import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { account } from './appwrite';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') || '';
  const secret = searchParams.get('secret') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!password) { setError('Please enter a new password.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!userId || !secret) {
      setError('Invalid recovery link. Please request a new one from the forgot-password page.');
      return;
    }
    setLoading(true);
    try {
      await account.updateRecovery(userId, secret, password);
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!userId || !secret) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Reset password</h2>
          <p style={{ color: '#5a7a99', textAlign: 'center' }}>
            Use the recovery link from your email, or request a new one.
          </p>
        </div>
        <p className="auth-footer"><Link to="/forgot-password">Forgot password</Link></p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">✅</div>
          <h2>Password updated!</h2>
          <p style={{ color: '#5a7a99', textAlign: 'center', marginBottom: 20 }}>
            Your password has been changed. You can now log in with your new password.
          </p>
          <button className="auth-submit" onClick={() => navigate('/login')}>Go to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🔐</div>
        <p className="auth-tagline">Your personal health companion</p>
        <h2>Choose a new password</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>New password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label>Confirm new password</label>
            <input
              type="password"
              placeholder="Repeat your new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
      <p className="auth-footer"><Link to="/login">Back to login</Link></p>
    </div>
  );
}

export default ResetPasswordPage;
