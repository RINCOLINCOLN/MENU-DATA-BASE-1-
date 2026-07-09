import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastScreenUpdate } from './websocket.js';

const router = Router();

// GET /api/screens/:screenId/menu-items — list menu items for a screen
router.get('/screens/:screenId/menu-items', authMiddleware, (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.screenId, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const items = db.prepare(
    'SELECT * FROM menu_items WHERE screen_id = ? ORDER BY category, sort_order'
  ).all(req.params.screenId);

  res.json({ menu_items: items });
});

// POST /api/screens/:screenId/menu-items — create menu item
router.post('/screens/:screenId/menu-items', authMiddleware, (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.screenId, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const { name, description, price, category, availability, text_zone_id } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const id = uuidv4();
  // Get next sort_order
  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max FROM menu_items WHERE screen_id = ?'
  ).get(req.params.screenId);

  const sortOrder = (maxOrder?.max || 0) + 1;

  db.prepare(`
    INSERT INTO menu_items (id, screen_id, name, description, price, category, availability, text_zone_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.screenId, name, description || null, price || null, category || null,
    availability || 'available', text_zone_id || null, sortOrder);

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);

  // Broadcast update via WebSocket
  broadcastScreenUpdate(req.params.screenId, { type: 'menu_item_created', item });

  res.status(201).json({ menu_item: item });
});

// PATCH /api/menu-items/:id — update menu item
router.patch('/menu-items/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT mi.* FROM menu_items mi
    JOIN screens s ON mi.screen_id = s.id
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE mi.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  const { name, description, price, category, availability, text_zone_id, sort_order } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (price !== undefined) { updates.push('price = ?'); values.push(price); }
  if (category !== undefined) { updates.push('category = ?'); values.push(category); }
  if (availability !== undefined) { updates.push('availability = ?'); values.push(availability); }
  if (text_zone_id !== undefined) { updates.push('text_zone_id = ?'); values.push(text_zone_id); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(req.params.id);

  db.prepare(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);

  // Broadcast update via WebSocket
  broadcastScreenUpdate(item.screen_id, { type: 'menu_item_updated', item: updated });

  res.json({ menu_item: updated });
});

// DELETE /api/menu-items/:id
router.delete('/menu-items/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT mi.* FROM menu_items mi
    JOIN screens s ON mi.screen_id = s.id
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE mi.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);

  // Broadcast update via WebSocket
  broadcastScreenUpdate(item.screen_id, { type: 'menu_item_deleted', item_id: req.params.id });

  res.json({ success: true });
});

export default router;
