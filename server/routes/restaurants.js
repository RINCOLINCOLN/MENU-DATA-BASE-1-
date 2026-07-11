import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All restaurant routes require auth
router.use(authMiddleware);

// GET /api/restaurants — list user's restaurants
router.get('/', (req, res) => {
  const db = getDb();
  const restaurants = db.prepare(
    'SELECT * FROM restaurants WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json({ restaurants });
});

// POST /api/restaurants — create a restaurant
router.post('/', (req, res) => {
  const { name, logo_url } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO restaurants (id, user_id, name, logo_url) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, name, logo_url || null);

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  res.status(201).json({ restaurant });
});

// GET /api/restaurants/:id — get single restaurant
router.get('/:id', (req, res) => {
  const db = getDb();
  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }
  res.json({ restaurant });
});

// PATCH /api/restaurants/:id — update restaurant
router.patch('/:id', (req, res) => {
  const db = getDb();
  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const { name, logo_url } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (logo_url !== undefined) { updates.push('logo_url = ?'); values.push(logo_url); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  res.json({ restaurant: updated });
});

// GET /api/restaurants/:id/screens — list screens for a restaurant
router.get('/:id/screens', (req, res) => {
  const db = getDb();
  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const screens = db.prepare(`
    SELECT s.*, t.name as template_name, t.video_url, t.config_json
    FROM screens s
    LEFT JOIN templates t ON s.template_id = t.id
    WHERE s.restaurant_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.id);

  res.json({ screens });
});

// POST /api/restaurants/:id/screens — create a screen
router.post('/:id/screens', (req, res) => {
  const db = getDb();
  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const { name, orientation, template_id, slug } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const screenId = uuidv4();
  // Use provided slug or generate a friendly one from the name
  let uniqueSlug = slug;
  if (!uniqueSlug) {
    uniqueSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    // If slug is empty after sanitization, fall back to UUID
    if (!uniqueSlug) {
      uniqueSlug = uuidv4().replace(/-/g, '').substring(0, 12);
    }
  }
  // Ensure slug is unique
  const existing = db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(uniqueSlug);
  if (existing) {
    uniqueSlug = `${uniqueSlug}-${uuidv4().replace(/-/g, '').substring(0, 6)}`;
  }

  db.prepare(`
    INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(screenId, req.params.id, name, uniqueSlug, orientation || 'landscape', template_id || null);

  const screen = db.prepare('SELECT * FROM screens WHERE id = ?').get(screenId);
  res.status(201).json({ screen });
});

// DELETE /api/restaurants/:id — delete restaurant (cascades to screens, menu_items, schedules)
router.delete('/:id', (req, res) => {
  const db = getDb();
  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  // Delete related data
  const screens = db.prepare('SELECT id FROM screens WHERE restaurant_id = ?').all(req.params.id);
  for (const screen of screens) {
    db.prepare('DELETE FROM menu_items WHERE screen_id = ?').run(screen.id);
    db.prepare('DELETE FROM schedules WHERE screen_id = ?').run(screen.id);
  }
  db.prepare('DELETE FROM screens WHERE restaurant_id = ?').run(req.params.id);
  db.prepare('DELETE FROM restaurants WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

export default router;
