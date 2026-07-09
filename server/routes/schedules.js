import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/screens/:screenId/schedules — list schedules
router.get('/screens/:screenId/schedules', authMiddleware, (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.screenId, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const schedules = db.prepare(
    'SELECT * FROM schedules WHERE screen_id = ? ORDER BY created_at DESC'
  ).all(req.params.screenId);

  res.json({ schedules });
});

// POST /api/screens/:screenId/schedules — create schedule
router.post('/screens/:screenId/schedules', authMiddleware, (req, res) => {
  const db = getDb();
  const screen = db.prepare(`
    SELECT s.* FROM screens s
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE s.id = ? AND r.user_id = ?
  `).get(req.params.screenId, req.user.id);

  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const { menu_name, start_time, end_time, days_of_week } = req.body;
  if (!menu_name || !start_time || !end_time) {
    return res.status(400).json({ error: 'menu_name, start_time, and end_time are required' });
  }

  const id = uuidv4();
  const daysJson = days_of_week ? JSON.stringify(days_of_week) : JSON.stringify([0, 1, 2, 3, 4, 5, 6]);

  db.prepare(`
    INSERT INTO schedules (id, screen_id, menu_name, start_time, end_time, days_of_week)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.screenId, menu_name, start_time, end_time, daysJson);

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  res.status(201).json({ schedule });
});

// PATCH /api/schedules/:id
router.patch('/schedules/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const schedule = db.prepare(`
    SELECT sc.* FROM schedules sc
    JOIN screens s ON sc.screen_id = s.id
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE sc.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!schedule) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const { menu_name, start_time, end_time, days_of_week } = req.body;
  const updates = [];
  const values = [];

  if (menu_name !== undefined) { updates.push('menu_name = ?'); values.push(menu_name); }
  if (start_time !== undefined) { updates.push('start_time = ?'); values.push(start_time); }
  if (end_time !== undefined) { updates.push('end_time = ?'); values.push(end_time); }
  if (days_of_week !== undefined) {
    updates.push('days_of_week = ?');
    values.push(typeof days_of_week === 'string' ? days_of_week : JSON.stringify(days_of_week));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  res.json({ schedule: updated });
});

// DELETE /api/schedules/:id
router.delete('/schedules/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const schedule = db.prepare(`
    SELECT sc.* FROM schedules sc
    JOIN screens s ON sc.screen_id = s.id
    JOIN restaurants r ON s.restaurant_id = r.id
    WHERE sc.id = ? AND r.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!schedule) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
