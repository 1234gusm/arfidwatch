import { Query } from 'node-appwrite';

/**
 * Auth routes (Appwrite version).
 *
 * Registration, login, forgot/reset password, and session management are
 * handled client-side with the Appwrite Account SDK.  The only server-side
 * auth routes that remain are:
 *   - POST /api/auth/change-password  (requires Appwrite Users SDK)
 *   - GET  /api/auth/me               (returns user info from header)
 */
export async function handleAuth({ req, res, db, users, userId, body, method, path }) {

  // GET /api/auth/me — return basic user info
  if (method === 'GET' && path === '/api/auth/me') {
    try {
      const user = await users.get(userId);
      return res.json({
        authenticated: true,
        id: userId,
        username: user.name || user.email || userId,
        email: user.email || null,
      });
    } catch (e) {
      return res.json({ error: 'user not found' }, 404);
    }
  }

  // POST /api/auth/change-password
  if (method === 'POST' && path === '/api/auth/change-password') {
    const { new_password } = body;
    if (!new_password) {
      return res.json({ error: 'new_password required' }, 400);
    }
    if (new_password.length < 8) {
      return res.json({ error: 'Password must be at least 8 characters long.' }, 400);
    }
    if (new_password.length > 128) {
      return res.json({ error: 'Password must be 128 characters or fewer.' }, 400);
    }
    try {
      await users.updatePassword(userId, new_password);
      return res.json({ ok: true });
    } catch (e) {
      return res.json({ error: 'Failed to change password.' }, 500);
    }
  }

  // POST /api/auth/logout — no-op on server (client deletes session)
  if (method === 'POST' && path === '/api/auth/logout') {
    return res.json({ ok: true });
  }

  return res.json({ error: 'Not found' }, 404);
}
