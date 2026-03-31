import API_BASE from './apiBase';

/* ── In-memory JWT token (fallback when cross-site cookies are blocked) ── */
let _token = null;

export function setAuthToken(t) { _token = t; }
export function getAuthToken() { return _token; }
export function clearAuthToken() { _token = null; }

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
      if (data?.authenticated) return data;
    }
  } catch (_) {}
  return null;
}
