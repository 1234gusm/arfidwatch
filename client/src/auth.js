import API_BASE from './apiBase';

/* ── Persistent JWT token (localStorage + in-memory) ── */
const TOKEN_KEY = 'aw_auth_token';
let _token = null;

// Restore token from localStorage on load
try { _token = localStorage.getItem(TOKEN_KEY); } catch (_) {}

export function setAuthToken(t) {
  _token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {}
}
export function getAuthToken() { return _token; }
export function clearAuthToken() {
  _token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
}

/**
 * Wrapper around fetch that automatically attaches credentials (cookie)
 * AND the Authorization header (in-memory token) so auth works regardless
 * of whether the browser allows cross-site cookies.
 */
export function authFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (_token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/**
 * Check if we have a valid session (cookie or in-memory token).
 * Returns { authenticated, id, username } or null.
 */
export async function checkSession() {
  try {
    const res = await authFetch(`${API_BASE}/api/auth/me`);
    if (res.ok) {
      const data = await res.json();
      if (data?.authenticated) {
        // Persist refreshed token from server
        if (data.token) setAuthToken(data.token);
        return data;
      }
    }
  } catch (_) {}
  return null;
}
