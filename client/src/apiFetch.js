import API_BASE from './apiBase';

/**
 * Wrapper around fetch that always includes credentials (cookies).
 * Usage: apiFetch('/api/profile') or apiFetch('/api/profile', { method: 'PUT', ... })
 * Automatically prepends API_BASE to relative paths.
 */
export default function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}
