import { account, functions, storage, ID } from './appwrite';

const FUNCTION_ID = 'api';
const UPLOAD_BUCKET = 'uploads';

/* ── Thin Response wrapper around Appwrite Function execution result ───── */
class FnResponse {
  constructor(exec) {
    this.status = exec.responseStatusCode || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this._body = exec.responseBody || '';
  }
  async json() { return JSON.parse(this._body); }
  async text() { return this._body; }
}

/**
 * Drop-in replacement for fetch that routes every API call through the
 * Appwrite Function.  Existing call-sites keep working unchanged:
 *     authFetch(`${API_BASE}/api/medications`)        // works (API_BASE is '')
 *     authFetch('/api/profile', { method: 'PUT', body: JSON.stringify({…}) })
 */
export async function authFetch(url, opts = {}) {
  // Strip any origin / API_BASE prefix — keep only the /api/… path + query
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const method = (opts.method || 'GET').toUpperCase();
  const inHeaders = { ...(opts.headers || {}) };

  let bodyStr = '';

  if (opts.body != null) {
    if (typeof FormData !== 'undefined' && opts.body instanceof FormData) {
      // File upload: push to Appwrite Storage first, then tell the function
      const file = opts.body.get('file');
      if (file) {
        const uploaded = await storage.createFile(UPLOAD_BUCKET, ID.unique(), file);
        bodyStr = JSON.stringify({ fileId: uploaded.$id, filename: file.name, bucketId: UPLOAD_BUCKET });
      }
    } else if (typeof opts.body === 'string') {
      bodyStr = opts.body;
    } else {
      bodyStr = JSON.stringify(opts.body);
    }
  }

  const exec = await functions.createExecution(
    FUNCTION_ID,
    bodyStr,
    false,   // async = false
    path,
    method,
    inHeaders,
  );

  return new FnResponse(exec);
}

/* ── Legacy exports (used in a few places) ──────────────────────────────── */
export function setAuthToken() {}   // no-op — Appwrite manages sessions
export function getAuthToken() { return null; }
export function clearAuthToken() {} // no-op

/**
 * Check if we have a valid Appwrite session.
 * Returns { authenticated, id, username, email } or null.
 */
export async function checkSession() {
  try {
    const user = await account.get();
    return { authenticated: true, id: user.$id, username: user.name, email: user.email };
  } catch (_) {
    return null;
  }
}
