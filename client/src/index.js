import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter as Router } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const LOCAL_API_BASE = 'http://localhost:4000';
const API_BASE = process.env.REACT_APP_API_URL || LOCAL_API_BASE;

// Keep existing code unchanged by rewriting hardcoded localhost API calls
// to the deployed API host when REACT_APP_API_URL is provided.
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith(LOCAL_API_BASE)) {
      const rewritten = API_BASE + input.slice(LOCAL_API_BASE.length);
      return originalFetch(rewritten, init);
    }
    return originalFetch(input, init);
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);

reportWebVitals();
