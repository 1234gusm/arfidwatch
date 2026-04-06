import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { account, ID } from './appwrite';

function RegisterPage({ setToken }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const doRegister = async () => {
    setError('');
    try {
      await account.create(ID.unique(), email.trim(), password, username.trim());
      await account.createEmailPasswordSession(email.trim(), password);
      setToken('authenticated');
      navigate('/');
    } catch (err) {
      setError(err?.message || 'Registration failed');
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required for account recovery and password reset.');
      return;
    }
    await doRegister();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo"><img src={process.env.PUBLIC_URL + '/logo192.png'} alt="ArfidWatch" style={{ width: 64, height: 64, borderRadius: 12 }} /></div>
        <p className="auth-tagline">Your personal health companion</p>
        <h2>Create your account</h2>
        <p style={{ color: '#5a7a99', fontSize: '0.87rem', textAlign: 'center', marginTop: -8, marginBottom: 18 }}>
          Create your account with username, email, and password.
        </p>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Username</label>
          <input
            type="text"
            placeholder="Choose any username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="auth-field">
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="auth-field">
          <label>Password</label>
          <input
            type="password"
            placeholder="Choose a password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="auth-submit">Create Account</button>
        </form>
      </div>
      <p className="auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export default RegisterPage;