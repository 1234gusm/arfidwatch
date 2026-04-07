import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE from './apiBase';

function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devCode, setDevCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setInfo('');
    setDevCode('');
    if (!username || !email) {
      setError('Both fields are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email: email.trim().toLowerCase() }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { data = { error: 'Unexpected response.' }; }
      if (res.ok) {
        setInfo(data.message || 'A reset code has been sent to your email.');
        if (data.dev_reset_code) {
          setDevCode(data.dev_reset_code);
        }
        navigate('/reset-password', {
          state: {
            username: username.trim(),
            email: email.trim().toLowerCase(),
            devCode: data.dev_reset_code || '',
          },
        });
      } else {
        setError(data.error || 'Could not find that account.');
      }
    } catch {
      setError('Could not reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🔑</div>
        <p className="auth-tagline">Your personal health companion</p>
        <h2>Reset your password</h2>
        <p style={{ color: '#5a7a99', fontSize: '0.87rem', textAlign: 'center', marginTop: -8, marginBottom: 18 }}>
          Enter your username and email. We&apos;ll send a reset code.
        </p>
        {error && <div className="error-msg">{error}</div>}
        {info && <div className="profile-flash">{info}</div>}
        {devCode && (
          <div className="profile-hint" style={{ marginBottom: 12 }}>
            Dev code: <strong>{devCode}</strong>
          </div>
        )}
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
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
      <p className="auth-footer">
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
