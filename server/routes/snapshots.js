/**
 * Snapshots API — "Snapshot-to-digital" perk backend.
 *
 * POST /api/snapshots        (auth, multipart "photo") → { snapshot_id, status: "processing" }
 * GET  /api/snapshots/:id    (auth, owner) → { snapshot_id, status, original_url, mockup_url?, message?, ... }
 * PATCH /api/snapshots/:id   (auth, owner) → mark for owner manual redesign ({ needs_redesign })
 * GET  /api/snapshots        (auth) → list the user's snapshots
 *
 * The AI mockup pipeline runs async after upload (OCR + Lumenu template/menu
 * generation); the dashboard polls GET /:id until status is "ready"|"failed".
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { runSnapshotPipeline } from '../lib/snapshotPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'uploads', 'snapshots');
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SNAPSHOTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext || '.jpg'}`);
  },
});
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20MB max photo
const upload = multer({
  storage,
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)
      || /^image\//.test(file.mimetype || '');
    if (ok) cb(null, true);
    else cb(new Error('Invalid image format. Please upload a photo (JPG, PNG, or WebP).'));
  },
});

const router = Router();

function snapshotPayload(row, db) {
  const payload = {
    snapshot_id: row.id,
    status: row.status, // 'processing' | 'ready' | 'failed'
    original_url: `/uploads/snapshots/${path.basename(row.original_path)}`,
    mockup_url: row.mockup_path ? `/uploads/snapshots/${path.basename(row.mockup_path)}` : null,
    price_stripped: !!row.price_stripped,
    needs_redesign: !!row.needs_redesign,
    created_at: row.created_at,
  };
  if (row.error_message) payload.message = row.error_message;

  let menuData = null;
  if (row.menu_json) {
    try { menuData = JSON.parse(row.menu_json); } catch { menuData = null; }
  }
  if (menuData) {
    payload.menu_items = menuData.items;   // editable phone-side (name/price/category/zone/fonts)
    payload.categories = menuData.categories;
    payload.orientation = menuData.orientation;
    // Price placement + glyph heuristics (owner requirement): the dashboard
    // mockup uses these so prices render where/sized as in the original photo.
    if (menuData.price_layout) {
      payload.suggested_price_zone = menuData.price_layout.position;       // 'right_column' | 'inline'
      payload.price_font_ratio = menuData.price_layout.font_ratio;         // price glyph size ÷ item name glyph size
      payload.price_bold = !!menuData.price_layout.bold;
      payload.price_align = menuData.price_layout.align;
      payload.price_leader = !!menuData.price_layout.leader;
      if (menuData.price_layout.margin_right_frac != null) payload.price_margin_right = menuData.price_layout.margin_right_frac;
    }
  }
  if (row.template_id) {
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(row.template_id);
    if (t) {
      let textZones = null;
      if (t.config_json) { try { textZones = JSON.parse(t.config_json); } catch { textZones = null; } }
      payload.template = { id: t.id, name: t.name, orientation: t.orientation, text_zones: textZones };
    }
  }
  if (row.screen_id) {
    const s = db.prepare('SELECT * FROM screens WHERE id = ?').get(row.screen_id);
    if (s) {
      payload.screen = {
        id: s.id,
        name: s.name,
        slug: s.unique_slug,
        orientation: s.orientation,
        data_url: `/api/screens/${s.unique_slug}/data`,
      };
    }
  }
  return payload;
}

// GET /api/snapshots — list the current user's snapshots (newest first)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ snapshots: rows.map((r) => snapshotPayload(r, db)) });
});

// POST /api/snapshots — upload a menu photo; pipeline runs async
router.post('/', authMiddleware, (req, res, next) => {
  // Map multer errors (bad type, size) to 400 instead of the generic 500 handler.
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'photo file is required' });
  }
  const db = getDb();
  const restaurantId = req.body.restaurant_id || null;
  if (restaurantId) {
    const owned = db.prepare('SELECT id FROM restaurants WHERE id = ? AND user_id = ?')
      .get(restaurantId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Restaurant not found' });
  }
  const id = uuidv4();
  db.prepare(
    `INSERT INTO snapshots (id, user_id, restaurant_id, original_path, status, price_stripped)
     VALUES (?, ?, ?, ?, 'processing', 0)`
  ).run(id, req.user.id, restaurantId, `/uploads/snapshots/${req.file.filename}`);

  // Fire-and-forget pipeline — the response stays "processing" per contract;
  // the dashboard polls GET /:id until ready|failed.
  runSnapshotPipeline(id).catch((err) => console.error('[snapshots] pipeline error', err));

  res.status(201).json({ snapshot_id: id, status: 'processing' });
});

// GET /api/snapshots/:id — polled by the dashboard until the mockup is ready
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snapshotPayload(row, db));
});

// PATCH /api/snapshots/:id — owner-redesign path placeholder: flag the
// snapshot so the Lumenu service can rebuild it manually.
router.patch('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Snapshot not found' });
  const updates = [];
  const values = [];
  if (req.body.needs_redesign !== undefined) {
    updates.push('needs_redesign = ?');
    values.push(req.body.needs_redesign ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE snapshots SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(snapshotPayload(db.prepare('SELECT * FROM snapshots WHERE id = ?').get(req.params.id), db));
});

export default router;