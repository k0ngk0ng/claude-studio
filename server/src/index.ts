import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initDatabase } from './db.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';

const PORT = parseInt(process.env.PORT || '3456', 10);

// Initialize database
initDatabase();

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',  // Electron app uses file:// or localhost
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/api/health', (c) => c.json({
  status: 'ok',
  version: '0.0.1',
  registrationDisabled: process.env.DISABLE_REGISTRATION === 'true',
}));

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/settings', settingsRoutes);

// Start
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] ClaudeStudio server running on http://localhost:${info.port}`);
});
