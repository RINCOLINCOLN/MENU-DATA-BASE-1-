import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/screens/:id — get single screen
router.get('/:id', (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.*, r.name as restaurant_name, t.name as template_name, t.video_url, t.config_json
    FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    LEFT JOIN templates t ON s.template_id = t.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }
  res.json({ screen });
});

// PATCH /api/screens/:id — update screen
router.patch('/:id', (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const { name, orientation, template_id } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (orientation !== undefined) { updates.push('orientation = ?'); values.push(orientation); }
  if (template_id !== undefined) { updates.push('template_id = ?'); values.push(template_id); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE screens SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM screens WHERE id = ?').get(req.params.id);
  res.json({ screen: updated });
});

// DELETE /api/screens/:id — delete screen
router.delete('/:id', (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  db.prepare('DELETE FROM menu_items WHERE screen_id = ?').run(req.params.id);
  db.prepare('DELETE FROM schedules WHERE screen_id = ?').run(req.params.id);
  db.prepare('DELETE FROM screens WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

export default router;
