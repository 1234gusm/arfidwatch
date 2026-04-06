import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { account } from './appwrite';

function LoginPage({ setToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    try {
      await account.createEmailPasswordSession(email, password);
      setToken('authenticated');
      navigate('/');
    } catch (err) {
      setError(err?.message || 'Login failed');
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
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
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