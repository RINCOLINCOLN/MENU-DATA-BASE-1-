import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'menuvo.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      logo_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      video_url TEXT,
      video_duration_ms INTEGER,
      orientation TEXT DEFAULT 'landscape',
      config_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS screens (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
      name TEXT NOT NULL,
      unique_slug TEXT UNIQUE NOT NULL,
      orientation TEXT DEFAULT 'landscape',
      template_id TEXT REFERENCES templates(id),
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      screen_id TEXT NOT NULL REFERENCES screens(id),
      name TEXT,
      description TEXT,
      price REAL,
      category TEXT,
      availability TEXT DEFAULT 'available',
      text_zone_id TEXT,
      font_family TEXT,
      font_size INTEGER,
      font_weight TEXT,
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      screen_id TEXT NOT NULL REFERENCES screens(id),
      menu_name TEXT,
      start_time TEXT,
      end_time TEXT,
      days_of_week TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add sort_order to screens for existing databases
  const screenCols = db.prepare('PRAGMA table_info(screens)').all();
  if (!screenCols.some(c => c.name === 'sort_order')) {
    db.exec('ALTER TABLE screens ADD COLUMN sort_order INTEGER DEFAULT 0');
  }
  // Migration: menu_items — name optional + per-item typography overrides
  // (nullable columns = item inherits its zone's font/color)
  const itemCols = db.prepare('PRAGMA table_info(menu_items)').all();
  const itemMigrations = [
    ['font_family', 'ALTER TABLE menu_items ADD COLUMN font_family TEXT'],
    ['font_size', 'ALTER TABLE menu_items ADD COLUMN font_size INTEGER'],
    ['font_weight', 'ALTER TABLE menu_items ADD COLUMN font_weight TEXT'],
    ['color', 'ALTER TABLE menu_items ADD COLUMN color TEXT'],
  ];
  for (const [col, ddl] of itemMigrations) {
    if (!itemCols.some(c => c.name === col)) db.exec(ddl);
  }
  // Migration: menu_items.name must be NULLABLE (price-only items). SQLite
  // cannot alter a column's NOT NULL, so rebuild the table when needed.
  const nameCol = db.prepare('PRAGMA table_info(menu_items)').all().find(c => c.name === 'name');
  if (nameCol && nameCol.notnull) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE menu_items_new (
          id TEXT PRIMARY KEY,
          screen_id TEXT NOT NULL REFERENCES screens(id),
          name TEXT,
          description TEXT,
          price REAL,
          category TEXT,
          availability TEXT DEFAULT 'available',
          text_zone_id TEXT,
          font_family TEXT,
          font_size INTEGER,
          font_weight TEXT,
          color TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO menu_items_new (id, screen_id, name, description, price, category, availability, text_zone_id, font_family, font_size, font_weight, color, sort_order, created_at, updated_at)
          SELECT id, screen_id, name, description, price, category, availability, text_zone_id, font_family, font_size, font_weight, color, sort_order, created_at, updated_at FROM menu_items;
        DROP TABLE menu_items;
        ALTER TABLE menu_items_new RENAME TO menu_items;
      `);
    })();
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export default getDb;
