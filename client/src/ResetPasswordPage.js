import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import API_BASE from './apiBase';

function ResetPasswordPage() {
  const location = useLocation();
  const stateUsername = location.state?.username || '';
  const stateEmail = location.state?.email || '';
  const stateDevCode = location.state?.devCode || '';
  const [username, setUsername] = useState(stateUsername);
  const [email, setEmail] = useState(stateEmail);
  const [code, setCode] = useState(stateDevCode);
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
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!username || !email || !code) {
      setError('Username, email, and reset code are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim().toLowerCase(), code: code.trim(), password }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { data = { error: 'Unexpected response.' }; }
      if (res.ok && data.ok) {
        setDone(true);
      } else {
        setError(data.error || 'Password reset failed.');
      }
    } catch {
      setError('Could not reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!stateUsername || !stateEmail) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Reset password</h2>
          <p style={{ color: '#5a7a99', textAlign: 'center' }}>
            Start from the forgot password page so we can verify your account details.
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
            <label>Username</label>
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label>Email address</label>
            <input
              type="email"
              placeholder="Email on your account"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label>Reset code</label>
            <input
              type="text"
              placeholder="6-digit code from your email"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label>New password</label>
            <input
              type="password"
              placeholder="At least 6 characters"
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
