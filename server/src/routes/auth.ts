import { Hono } from 'hono';
import { createUser, verifyPassword, getUserById, updateUser } from '../db.js';
import { signToken, verifyToken } from '../auth.js';

export const authRoutes = new Hono();

// Helper: extract user from Bearer token
async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const userId = await verifyToken(token);
  if (!userId) return null;
  return getUserById(userId);
}

// POST /api/auth/register
authRoutes.post('/register', async (c) => {
  if (process.env.DISABLE_REGISTRATION === 'true') {
    return c.json({ success: false, error: 'Registration is disabled' }, 403);
  }

  const { email, username, password } = await c.req.json();

  if (!email || !username || !password) {
    return c.json({ success: false, error: 'All fields are required' }, 400);
  }
  if (password.length < 6) {
    return c.json({ success: false, error: 'Password must be at least 6 characters' }, 400);
  }

  const result = createUser(email.trim().toLowerCase(), username.trim(), password);
  if ('error' in result) {
    return c.json({ success: false, error: result.error }, 409);
  }

  const token = await signToken(result.user.id);
  return c.json({ success: true, user: result.user, token });
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const { emailOrUsername, password } = await c.req.json();

  if (!emailOrUsername || !password) {
    return c.json({ success: false, error: 'All fields are required' }, 400);
  }

  const result = verifyPassword(emailOrUsername.trim(), password);
  if ('error' in result) {
    return c.json({ success: false, error: result.error }, 401);
  }

  const token = await signToken(result.user.id);
  return c.json({ success: true, user: result.user, token });
});

// GET /api/auth/validate
authRoutes.get('/validate', async (c) => {
  const user = await getUserFromToken(c.req.header('Authorization'));
  if (!user) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
  return c.json({ success: true, user });
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  // JWT is stateless — client just discards the token.
  // This endpoint exists for future token blacklist support.
  return c.json({ success: true });
});

// PUT /api/auth/profile
authRoutes.put('/profile', async (c) => {
  const user = await getUserFromToken(c.req.header('Authorization'));
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const updates = await c.req.json();
  const result = updateUser(user.id, updates);
  if ('error' in result) {
    return c.json({ success: false, error: result.error }, 409);
  }

  return c.json({ success: true, user: result.user });
});
