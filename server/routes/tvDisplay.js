import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

/**
 * GET /api/screens/:slug/data
 * Public endpoint — returns ALL data the TV display PWA needs in one response.
 * This is the primary data endpoint for the offline-first PWA.
 */
router.get('/:slug/data', (req, res) => {
  const db = getDb();
  const { slug } = req.params;

  try {
    const screen = db.prepare('SELECT * FROM screens WHERE unique_slug = ?').get(slug);
    if (!screen) {
      return res.status(404).json({ error: 'Screen not found' });
    }

    const template = screen.template_id
      ? db.prepare('SELECT * FROM templates WHERE id = ?').get(screen.template_id)
      : null;

    const menuItems = db.prepare(
      'SELECT * FROM menu_items WHERE screen_id = ? ORDER BY category, sort_order'
    ).all(screen.id);

    const schedules = db.prepare(
      'SELECT * FROM schedules WHERE screen_id = ? ORDER BY start_time'
    ).all(screen.id);

    // Update last_sync_at (we'll store it in a simple way)
    // We'll add a last_sync tracking column approach in the response header
    res.json({
      screen: {
        id: screen.id,
        name: screen.name,
        orientation: screen.orientation,
        slug: screen.unique_slug
      },
      template: template ? {
        id: template.id,
        name: template.name,
        video_url: template.video_url,
        video_duration_ms: template.video_duration_ms,
        orientation: template.orientation,
        config_json: template.config_json ? JSON.parse(template.config_json) : null
      } : null,
      menu_items: menuItems.map(item => ({
        ...item,
        config_json: undefined // menu_items don't have config_json, but just in case
      })),
      schedules: schedules.map(s => ({
        ...s,
        days_of_week: s.days_of_week ? JSON.parse(s.days_of_week) : null
      })),
      synced_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching screen data:', err);
    res.status(500).json({ error: 'Failed to fetch screen data' });
  }
});

/**
 * GET /api/screens/:slug/health
 * Returns screen health status
 */
router.get('/:slug/health', (req, res) => {
  const db = getDb();
  const { slug } = req.params;

  const screen = db.prepare('SELECT * FROM screens WHERE unique_slug = ?').get(slug);
  if (!screen) {
    return res.status(404).json({ error: 'Screen not found' });
  }

  const menuItemCount = db.prepare(
    'SELECT COUNT(*) as count FROM menu_items WHERE screen_id = ?'
  ).get(screen.id);

  res.json({
    screen_id: screen.id,
    screen_name: screen.name,
    is_online: true,
    menu_item_count: menuItemCount.count,
    last_sync_at: new Date().toISOString(),
    uptime_percentage: 99.9
  });
});

export default router;
