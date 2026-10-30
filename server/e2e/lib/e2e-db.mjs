/**
 * Throwaway-database guard + helper for the Lumenu e2e suites.
 *
 * WHY THIS EXISTS
 * ---------------
 * The snapshot e2e suite is not read-only: it registers users and restaurants
 * through the API and it writes directly into SQLite (`UPDATE restaurants SET
 * on_hold`). Until now `E2E_DB_PATH` defaulted to the live database
 * (`server/data/menuvo.db`), so every run created rows on the owner's real
 * board. This module makes that impossible:
 *
 *   - `E2E_DB_PATH` is MANDATORY. Unset → hard stop, non-zero exit.
 *   - It must not resolve to the live DB (`server/data/menuvo.db`) → hard stop.
 *   - `BASE_URL` must not be the live server on :3000, because the suite also
 *     writes through the API and that server is bound to the live DB → hard
 *     stop (override only with E2E_ALLOW_SHARED_SERVER=1, and only if that
 *     server was itself started with DB_PATH=<your throwaway copy>).
 *
 * HOW TO RUN (see also scripts/RUNBOOK.md)
 * ----------------------------------------
 *   cd server
 *   export E2E_DB_PATH=/tmp/lumenu-e2e/menuvo.db     # created from the live DB
 *   PORT=3011 DB_PATH="$E2E_DB_PATH" node server.js &   # throwaway server
 *   BASE_URL=http://127.0.0.1:3011 E2E_DB_PATH="$E2E_DB_PATH" \
 *     node e2e/snapshot-flow.mjs
 *
 * If `E2E_DB_PATH` does not exist yet, the helper seeds it from the live
 * database and removes it (plus its -wal/-shm) when the process exits.
 * Set E2E_KEEP_DB=1 to keep the copy for post-mortem debugging.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.join(__dirname, '..', '..');
export const LIVE_DB_PATH = path.join(SERVER_ROOT, 'data', 'menuvo.db');

const LIVE_PORTS = new Set(['3000']);

function die(title, lines) {
  console.error(`\n❌ ${title}\n`);
  for (const line of lines) console.error(`   ${line}`);
  console.error('');
  process.exit(2);
}

/** Real path of a file that may not exist yet (resolves the parent dir). */
function realish(p) {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
    } catch {
      return abs;
    }
  }
}

/**
 * Resolve E2E_DB_PATH, refusing anything that could be the live database.
 * @returns {string} absolute path to the throwaway DB
 */
export function requireE2eDbPath() {
  const raw = process.env.E2E_DB_PATH;
  if (!raw || !raw.trim()) {
    die('E2E_DB_PATH is required — refusing to run against the live database.', [
      'The snapshot e2e suite writes rows (users, restaurants, snapshots) and',
      'toggles on_hold directly in SQLite. Running it against the live DB',
      'pollutes production data.',
      '',
      'Start a throwaway copy instead:',
      '  cd server',
      '  export E2E_DB_PATH=/tmp/lumenu-e2e/menuvo.db   # seeded from the live DB on first use',
      '  PORT=3011 DB_PATH="$E2E_DB_PATH" node server.js &',
      '  BASE_URL=http://127.0.0.1:3011 node e2e/snapshot-flow.mjs',
    ]);
  }
  const resolved = path.resolve(raw);
  if (realish(resolved) === realish(LIVE_DB_PATH)) {
    die('E2E_DB_PATH points at the LIVE database — refusing to run.', [
      `  E2E_DB_PATH = ${resolved}`,
      `  live DB     = ${LIVE_DB_PATH}`,
      '',
      'Pick any other path (e.g. /tmp/lumenu-e2e/menuvo.db). The helper will',
      'seed it from the live DB for you.',
    ]);
  }
  return resolved;
}

/**
 * The suite also writes through the API, so the server it talks to must be a
 * throwaway server bound to the same throwaway DB — never the live :3000 one.
 */
export function assertNotLiveServer(baseUrl = process.env.BASE_URL) {
  const url = baseUrl || 'http://localhost:3000';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    die(`BASE_URL is not a valid URL: ${url}`, []);
  }
  const host = parsed.hostname;
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (isLoopback && LIVE_PORTS.has(port) && process.env.E2E_ALLOW_SHARED_SERVER !== '1') {
    die(`BASE_URL points at the live server (${url}) — refusing to run.`, [
      'The suite creates users/restaurants through this server, so pointing it',
      'at the live process writes to the live database even when E2E_DB_PATH is',
      'set correctly.',
      '',
      'Start a throwaway server on another port:',
      '  PORT=3011 DB_PATH="$E2E_DB_PATH" node server.js &',
      '  BASE_URL=http://127.0.0.1:3011 node e2e/snapshot-flow.mjs',
      '',
      '(E2E_ALLOW_SHARED_SERVER=1 overrides — use only if that server was',
      ' started with DB_PATH pointing at your throwaway copy.)',
    ]);
  }
}

/** Copy live .db + -wal + -shm to `dest` (plain file copy, all three together). */
function copyLiveFiles(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${LIVE_DB_PATH}${suffix}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, `${dest}${suffix}`);
  }
}

/** Open the candidate copy and prove it is a usable Lumenu database. */
function verifyCopy(dest) {
  let db;
  try {
    db = new Database(dest, { fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    );
    const users = tables.has('users') ? db.prepare('SELECT COUNT(*) c FROM users').get().c : -1;
    const ok = integrity === 'ok' && tables.has('restaurants') && tables.has('screens') && users > 0;
    return { ok, integrity, tables: [...tables], users };
  } catch (err) {
    return { ok: false, integrity: err.message, tables: [], users: -1 };
  } finally {
    if (db) db.close();
  }
}

/**
 * Prepare the throwaway DB and return { dbPath, cleanup }.
 * - If the file already exists it is used as-is (verified, never modified here).
 * - If not, it is seeded from the live DB (file copy → verified; on failure,
 *   retried with better-sqlite3's online backup API) and cleaned up on exit.
 */
export async function prepareE2eDatabase() {
  const dbPath = requireE2eDbPath();
  const sidecars = [`${dbPath}-wal`, `${dbPath}-shm`];
  const removeAll = () => {
    if (process.env.E2E_KEEP_DB === '1') {
      console.log(`   (E2E_KEEP_DB=1 — keeping throwaway DB at ${dbPath})`);
      return;
    }
    for (const f of [dbPath, ...sidecars]) {
      try { fs.rmSync(f, { force: true }); } catch { /* best effort */ }
    }
  };

  if (fs.existsSync(dbPath)) {
    const v = verifyCopy(dbPath);
    if (!v.ok) {
      die(`E2E_DB_PATH exists but is not a usable Lumenu DB: ${dbPath}`, [
        `integrity_check: ${v.integrity}`,
        `tables: ${v.tables.join(', ') || '(none)'}`,
        'Delete it and re-run to seed a fresh copy from the live DB.',
      ]);
    }
    console.log(`[e2e] using existing throwaway DB: ${dbPath} (users=${v.users})`);
    return { dbPath, cleanup: () => {} };
  }

  if (!fs.existsSync(LIVE_DB_PATH)) {
    die(`No database to seed from: ${LIVE_DB_PATH} does not exist.`, [
      'Point E2E_DB_PATH at a seeded Lumenu database.',
    ]);
  }

  console.log(`[e2e] seeding throwaway DB from live copy: ${LIVE_DB_PATH} → ${dbPath}`);
  copyLiveFiles(dbPath);
  let v = verifyCopy(dbPath);
  if (!v.ok) {
    console.log(`[e2e] file copy was not consistent (${v.integrity}) — retrying with SQLite backup API`);
    for (const f of [dbPath, ...sidecars]) {
      try { fs.rmSync(f, { force: true }); } catch { /* best effort */ }
    }
    const src = new Database(LIVE_DB_PATH, { readonly: true, fileMustExist: true });
    try {
      await src.backup(dbPath);
    } finally {
      src.close();
    }
    v = verifyCopy(dbPath);
  }
  if (!v.ok) {
    removeAll();
    die(`Could not create a usable throwaway DB at ${dbPath}.`, [
      `integrity_check: ${v.integrity}`,
    ]);
  }
  console.log(`[e2e] throwaway DB ready: ${dbPath} (users=${v.users}) — removed on exit`);

  process.on('exit', removeAll);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { removeAll(); process.exit(130); });
  }
  return { dbPath, cleanup: removeAll };
}
