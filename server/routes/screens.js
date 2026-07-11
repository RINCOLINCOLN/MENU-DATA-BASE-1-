import { Router } from 'express';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * Helper: detect if a param is a UUID (has hyphens and is 36 chars) or a friendly slug.
 * Query by unique_slug if not a UUID, otherwise by id.
 */
function lookupScreen(db, param, userId) {
  const isUuid = param.includes('-') && param.length === 36;
  const column = isUuid ? 's.id' : 's.unique_slug';
  return db.prepare(`
    SELECT s.*, r.name as restaurant_name, t.name as template_name, t.video_url, t.config_json
    FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    LEFT JOIN templates t ON s.template_id = t.id
    WHERE ${column} = ? AND r.user_id = ?
  `).get(param, userId);
}

function lookupScreenForWrite(db, param, userId) {
  const isUuid = param.includes('-') && param.length === 36;
  const column = isUuid ? 's.id' : 's.unique_slug';
  return db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE ${column} = ? AND r.user_id = ?
  `).get(param, userId);
}

// GET /api/screens/:id — get single screen (by UUID or slug)
router.get('/:id', (req, res) => {
  const db = getDb();
  const screen = lookupScreen(db, req.params.id, req.user.id);
  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }
  res.json({ screen });
});

// PATCH /api/screens/:id — update screen (by UUID or slug)
router.patch('/:id', (req, res) => {
  const db = getDb();
  const screen = lookupScreenForWrite(db, req.params.id, req.user.id);
  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const { name, orientation, template_id, slug } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (orientation !== undefined) { updates.push('orientation = ?'); values.push(orientation); }
  if (template_id !== undefined) { updates.push('template_id = ?'); values.push(template_id); }
  if (slug !== undefined) { updates.push('unique_slug = ?'); values.push(slug); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(screen.id);
  db.prepare(`UPDATE screens SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM screens WHERE id = ?').get(screen.id);
  res.json({ screen: updated });
});

// DELETE /api/screens/:id — delete screen (by UUID or slug)
router.delete('/:id', (req, res) => {
  const db = getDb();
  const screen = lookupScreenForWrite(db, req.params.id, req.user.id);
  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  db.prepare('DELETE FROM menu_items WHERE screen_id = ?').run(screen.id);
  db.prepare('DELETE FROM schedules WHERE screen_id = ?').run(screen.id);
  db.prepare('DELETE FROM screens WHERE id = ?').run(screen.id);

  res.json({ success: true });
});

export default router;