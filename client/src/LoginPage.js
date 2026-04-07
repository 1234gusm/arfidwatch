import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API_BASE from './apiBase';
import { setAuthToken } from './auth';

function LoginPage({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { error: 'Server returned an unexpected response.' };
      }

      if (res.ok && data.ok) {
        if (data.token) setAuthToken(data.token);
        setToken('authenticated');
        navigate('/');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Could not reach server. Please try again in a moment.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo"><img src={process.env.PUBLIC_URL + '/logo192.png'} alt="ArfidWatch" style={{ width: 64, height: 64, borderRadius: 12 }} /></div>
        <p className="auth-tagline">Your personal health companion</p>
        <h2>Welcome back</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Username or Email</label>
          <input
            type="text"
            placeholder="Enter your username or email"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="auth-field">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="auth-submit">Log In</button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/forgot-password" style={{ fontSize: '0.84rem', color: '#5a7a99' }}>Forgot password?</Link>
        </div>
        </form>
      </div>
      <p className="auth-footer">
        Don’t have an account? <Link to="/register">Create one — it’s quick!</Link>
      </p>
    </div>
  );
}

export default LoginPage;