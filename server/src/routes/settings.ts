import { Hono } from 'hono';
import { getUserById, getUserSettings, setUserSetting } from '../db.js';
import { verifyToken } from '../auth.js';

export const settingsRoutes = new Hono();

// Helper: extract user from Bearer token
async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const userId = await verifyToken(token);
  if (!userId) return null;
  return getUserById(userId);
}

// GET /api/settings
settingsRoutes.get('/', async (c) => {
  const user = await getUserFromToken(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const settings = getUserSettings(user.id);
  return c.json(settings);
});

// PUT /api/settings
settingsRoutes.put('/', async (c) => {
  const user = await getUserFromToken(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { key, value } = await c.req.json();
  if (!key) {
    return c.json({ error: 'Key is required' }, 400);
  }

  setUserSetting(user.id, key, value);
  return c.json({ success: true });
});
