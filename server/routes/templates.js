import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Multer config for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid video format. Allowed: ${allowed.join(', ')}`));
    }
  }
});

const router = Router();

// GET /api/templates — list all templates (public or user's)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
  res.json({ templates });
});

// GET /api/templates/:id — get single template
router.get('/:id', (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ template });
});

// POST /api/templates — upload video template + config
router.post('/', authMiddleware, upload.single('video'), (req, res) => {
  const { name, video_duration_ms, orientation, config_json } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const db = getDb();
  const id = uuidv4();
  const videoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // Validate config_json if provided
  let configParsed = config_json;
  if (configParsed && typeof configParsed === 'string') {
    try {
      JSON.parse(configParsed);
    } catch {
      return res.status(400).json({ error: 'config_json must be valid JSON' });
    }
  }

  db.prepare(`
    INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    videoUrl,
    video_duration_ms ? parseInt(video_duration_ms) : null,
    orientation || 'landscape',
    configParsed || null
  );

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  res.status(201).json({ template });
});

// PATCH /api/templates/:id — update template metadata
router.patch('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const { name, video_duration_ms, orientation, config_json } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (video_duration_ms !== undefined) { updates.push('video_duration_ms = ?'); values.push(video_duration_ms); }
  if (orientation !== undefined) { updates.push('orientation = ?'); values.push(orientation); }

  if (config_json !== undefined) {
    if (typeof config_json === 'string') {
      try { JSON.parse(config_json); } catch { return res.status(400).json({ error: 'config_json must be valid JSON' }); }
    }
    updates.push('config_json = ?');
    values.push(typeof config_json === 'string' ? config_json : JSON.stringify(config_json));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  res.json({ template: updated });
});

// DELETE /api/templates/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Remove unused screens referencing this template
  db.prepare('UPDATE screens SET template_id = NULL WHERE template_id = ?').run(req.params.id);
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

export default router;
