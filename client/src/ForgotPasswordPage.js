import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { account } from './appwrite';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email) {
      setError('Email is required.');
      return;
    }
    setLoading(true);
    try {
      const resetUrl = `${window.location.origin}/reset-password`;
      await account.createRecovery(email.trim().toLowerCase(), resetUrl);
      setInfo('A recovery link has been sent to your email.');
    } catch (err) {
      setError(err?.message || 'Could not send recovery email.');
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
          Enter your email and we&apos;ll send a recovery link.
        </p>
        {error && <div className="error-msg">{error}</div>}
        {info && <div className="profile-flash">{info}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email address</label>
            <input
              type="email"
              placeholder="Email on your account"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
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
