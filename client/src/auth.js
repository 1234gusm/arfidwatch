import { account, functions, storage, ID } from './appwrite';
import client from './appwrite';

const FUNCTION_ID = 'api';
const UPLOAD_BUCKET = 'uploads';

/* ── Thin Response wrapper around Appwrite Function execution result ───── */
class FnResponse {
  constructor(exec) {
    // If the function execution itself failed (crash / timeout), treat as 500
    if (exec.status === 'failed') {
      this.status = 500;
      this.ok = false;
      this._body = exec.responseBody || JSON.stringify({ error: exec.errors || 'Function execution failed' });
    } else {
      this.status = exec.responseStatusCode || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this._body = exec.responseBody || '';
    }
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
      // File upload: for files ≤ 5 MB, send as base64 inline to skip Storage round-trip.
      // Larger files still use Appwrite Storage as a staging area.
      const file = opts.body.get('file');
      if (file) {
        const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5 MB
        if (file.size <= MAX_INLINE_SIZE) {
          const buf = await file.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          bodyStr = JSON.stringify({ fileBase64: b64, filename: file.name });
        } else {
          const uploaded = await storage.createFile(UPLOAD_BUCKET, ID.unique(), file);
          bodyStr = JSON.stringify({ fileId: uploaded.$id, filename: file.name, bucketId: UPLOAD_BUCKET });
        }
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

/**
 * Guest-safe fetch: bypasses the Appwrite SDK and calls the function
 * execution REST API directly.  Use for share routes that must work
 * for unauthenticated visitors (no Appwrite session required).
 */
export async function guestFetch(url, opts = {}) {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const method = (opts.method || 'GET').toUpperCase();
  const inHeaders = { ...(opts.headers || {}) };

  let bodyStr = '';
  if (opts.body != null) {
    bodyStr = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const endpoint = client.config.endpoint;          // e.g. https://nyc.cloud.appwrite.io/v1
  const project  = client.config.project;

  const response = await fetch(
    `${endpoint}/functions/${FUNCTION_ID}/executions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': project,
      },
      body: JSON.stringify({
        body: bodyStr,
        async: false,
        path,
        method,
        headers: inHeaders,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Function execution failed: ${response.status}`);
  }
  const exec = await response.json();
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
