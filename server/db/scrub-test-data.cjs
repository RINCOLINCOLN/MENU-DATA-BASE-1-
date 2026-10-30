#!/usr/bin/env node
/**
 * GUARDED scrub of e2e / QA test rows out of a Lumenu database.
 *
 * Modeled on db/apply-demo-showcase.cjs: guarded, transactional, dry-run by
 * default, prints a before/after census, and never writes to a row it does not
 * target.
 *
 * WHAT IT DELETES (identities only — never name/slug patterns):
 *   - users whose email ends in `@test.app` (snap-e2e-*, snap-other-*, snap-ui-* …)
 *   - restaurants owned by those users, plus the two known QA restaurant names
 *     `UI Test Eatery` / `Snap Test Eatery` (which must be owned by a test user)
 *   - their snapshots, screens, menu_items, schedules
 *   - the templates captured from those snapshots/screens (only when nothing
 *     else still references them)
 *   - the uploaded photo files named by the deleted snapshots' original_path /
 *     mockup_path — and nothing else in uploads/
 *
 * WHAT IT NEVER TOUCHES (deny-list, asserted before any deletion):
 *   owner account 13783d04-65af-4372-b523-806c0c4028a8 / owner@menuvo.app,
 *   restaurant `Lupitas`, screen `right-tv-luptitas`, marco@trattoria.demo,
 *   the three showcase restaurants + their four screens, and the owner's
 *   historical `failed` snapshot rows.
 *
 * WHY THE DISCRIMINATOR MATTERS: a real customer snapshot also produces
 * `snapshot-<8hex>` screen slugs and "<Restaurant> Menu" screen names. Matching
 * on those patterns would delete real customer boards.
 *
 * USAGE (run from server/):
 *   node db/scrub-test-data.cjs                 # DRY-RUN: census + plan, no writes
 *   node db/scrub-test-data.cjs --apply         # back up, then delete (one transaction)
 *   node db/scrub-test-data.cjs --db=/tmp/copy.db --apply
 *
 * On --apply it first writes a consistent snapshot of the database to
 * server/data-backup-restore-<YYYY-MM-DD>/menuvo.pre-scrub-<stamp>.db using
 * SQLite's VACUUM INTO (safe while the live server holds the DB open in WAL
 * mode — a naive `cp` of just the .db would miss the WAL).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..'); // server/
const DEFAULT_DB = path.join(ROOT, 'data', 'menuvo.db');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = !APPLY;
const dbArg = args.find((a) => a.startsWith('--db='));
const backupArg = args.find((a) => a.startsWith('--backup-dir='));
const uploadsArg = args.find((a) => a.startsWith('--uploads-dir='));
const DB_PATH = dbArg ? path.resolve(dbArg.slice(5)) : process.env.LUMENU_DB || DEFAULT_DB;

// Upload files are only removed when the DB being scrubbed IS the live DB (or
// when --uploads-dir explicitly says which uploads tree belongs to it). Without
// this, a rehearsal like `--db=/tmp/copy.db --apply` would delete the live
// server's photo files while the live DB still referenced them.
const samePath = (a, b) => {
  const r = (p) => {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  };
  return r(a) === r(b);
};
const IS_LIVE_DB = samePath(DB_PATH, DEFAULT_DB);
const UPLOADS_DIR = uploadsArg ? path.resolve(uploadsArg.slice('--uploads-dir='.length)) : path.join(ROOT, 'uploads');
const CAN_DELETE_UPLOADS = IS_LIVE_DB || Boolean(uploadsArg);

// ── Protected identities (deny-list) ────────────────────────────────────────
const OWNER_USER_ID = '13783d04-65af-4372-b523-806c0c4028a8';
const OWNER_USER_EMAIL = 'owner@menuvo.app';
const OWNER_RESTAURANT_NAME = 'Lupitas';
const OWNER_SCREEN_SLUG = 'right-tv-luptitas';
const DEMO_USER_EMAIL = 'marco@trattoria.demo';
const SHOWCASE_RESTAURANT_NAMES = ['Sol y Sombra Taquería', 'Ember & Oak Coffee Bar', 'Oliva Trattoria'];
const SHOWCASE_SCREEN_SLUGS = ['sol-y-sombra-main', 'brew-main-board', 'brew-bar-display', 'trattoria-menu'];
// The owner's historical snapshots backfilled to 'failed' on 2026-10-27.
const HISTORICAL_OWNER_FAILED_SNAPSHOT_IDS = [
  '3be38aa3-0384-41ae-b994-f5ca80e6d3b9',
  'f1ebcc07-5caa-47f2-a6c5-7f38a61f692d',
];

// ── Test-data identities (the ONLY safe discriminators) ─────────────────────
const TEST_EMAIL_DOMAIN = '@test.app';
const TEST_EMAIL_PREFIXES = ['snap-e2e-', 'snap-other-', 'snap-ui-'];
const TEST_RESTAURANT_NAMES = ['UI Test Eatery', 'Snap Test Eatery'];

// ── Guards (read-only) ──────────────────────────────────────────────────────
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Database not found: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, DRY ? { readonly: true, fileMustExist: true } : { fileMustExist: true });
db.pragma('foreign_keys = ON');

const abort = (msg) => {
  console.error(`\n❌ ABORT — ${msg}\n   Nothing was deleted. DB: ${DB_PATH}\n`);
  db.close();
  process.exit(1);
};
const log = (msg) => console.log(`  ${msg}`);
const plan = (msg) => console.log(`  → ${msg}`);

// 1) Presence checks: this is the safety catch that stops a wrong-DB run.
const missing = [];
if (!db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(OWNER_SCREEN_SLUG)) {
  missing.push(`screen ${OWNER_SCREEN_SLUG}`);
}
const showcaseRestaurants = db
  .prepare('SELECT id, name FROM restaurants WHERE name IN (?, ?, ?)')
  .all(...SHOWCASE_RESTAURANT_NAMES);
if (showcaseRestaurants.length !== SHOWCASE_RESTAURANT_NAMES.length) {
  missing.push(`showcase restaurants (${SHOWCASE_RESTAURANT_NAMES.join(', ')})`);
}
for (const slug of SHOWCASE_SCREEN_SLUGS) {
  if (!db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(slug)) missing.push(`screen ${slug}`);
}
const ownerUser = db.prepare('SELECT id, email FROM users WHERE id = ?').get(OWNER_USER_ID);
if (!ownerUser) missing.push(`owner user ${OWNER_USER_ID}`);
if (missing.length) {
  abort(`this does not look like the Lumenu production DB — missing: ${missing.join('; ')}`);
}

// 2) Resolve every protected row so it can be asserted against the delete set.
const protectedRestaurants = db
  .prepare(`SELECT id, name FROM restaurants WHERE name IN (?, ?, ?, ?)`)
  .all(OWNER_RESTAURANT_NAME, ...SHOWCASE_RESTAURANT_NAMES);
const protectedRestaurantIds = new Set(protectedRestaurants.map((r) => r.id));
const protectedScreens = db
  .prepare(`SELECT id, unique_slug FROM screens WHERE unique_slug IN (?, ?, ?, ?, ?)`)
  .all(OWNER_SCREEN_SLUG, ...SHOWCASE_SCREEN_SLUGS);
const protectedScreenIds = new Set(protectedScreens.map((s) => s.id));
const protectedUserIds = new Set([OWNER_USER_ID]);
const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_USER_EMAIL);
if (demoUser) protectedUserIds.add(demoUser.id);
if (protectedRestaurants.length !== 1 + SHOWCASE_RESTAURANT_NAMES.length) {
  abort(`expected ${1 + SHOWCASE_RESTAURANT_NAMES.length} protected restaurants, found ${protectedRestaurants.length}`);
}
if (protectedScreens.length !== 1 + SHOWCASE_SCREEN_SLUGS.length) {
  abort(`expected ${1 + SHOWCASE_SCREEN_SLUGS.length} protected screens, found ${protectedScreens.length}`);
}
const protectedSnapshots = db
  .prepare(`SELECT id, user_id, status FROM snapshots WHERE id IN (?, ?)`)
  .all(...HISTORICAL_OWNER_FAILED_SNAPSHOT_IDS);
if (protectedSnapshots.length !== HISTORICAL_OWNER_FAILED_SNAPSHOT_IDS.length) {
  abort('the owner\'s two historical failed snapshots are not both present — refusing to run blind');
}
const protectedSnapshotIds = new Set(protectedSnapshots.map((s) => s.id));

// ── Discovery: test identities ──────────────────────────────────────────────
const testUsers = db
  .prepare(`SELECT id, email, name, created_at FROM users WHERE lower(email) LIKE ? ORDER BY created_at`)
  .all(`%${TEST_EMAIL_DOMAIN}`);
const suspiciousUsers = testUsers.filter(
  (u) => !TEST_EMAIL_PREFIXES.some((p) => u.email.toLowerCase().startsWith(p))
);
const testUserIds = new Set(testUsers.map((u) => u.id));
for (const id of testUserIds) {
  if (protectedUserIds.has(id)) abort(`protected user ${id} matched the test-user discriminator`);
}

const allRestaurants = db
  .prepare('SELECT id, name, user_id, created_at FROM restaurants ORDER BY created_at')
  .all();
const testRestaurants = allRestaurants.filter(
  (r) => testUserIds.has(r.user_id) || TEST_RESTAURANT_NAMES.includes(r.name)
);
for (const r of testRestaurants) {
  if (protectedRestaurantIds.has(r.id)) abort(`protected restaurant "${r.name}" (${r.id}) matched the test discriminator`);
  if (!testUserIds.has(r.user_id)) {
    abort(
      `restaurant "${r.name}" (${r.id}) is a QA name but is owned by a non-test user (${r.user_id}) — ` +
        'refusing to delete real data'
    );
  }
}
const testRestaurantIds = new Set(testRestaurants.map((r) => r.id));

const allScreens = db
  .prepare('SELECT id, name, unique_slug, restaurant_id, template_id FROM screens ORDER BY name')
  .all();
const testScreens = allScreens.filter((s) => testRestaurantIds.has(s.restaurant_id));
for (const s of testScreens) {
  if (protectedScreenIds.has(s.id)) abort(`protected screen ${s.unique_slug} (${s.id}) belongs to a test restaurant`);
}
const testScreenIds = new Set(testScreens.map((s) => s.id));

// Snapshots: by test user, or attached to a test restaurant/screen.
const allSnapshots = db
  .prepare(
    `SELECT s.id, s.user_id, s.restaurant_id, s.screen_id, s.template_id, s.status,
            s.original_path, s.mockup_path, s.created_at, u.email
       FROM snapshots s LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at`
  )
  .all();
const testSnapshots = allSnapshots.filter(
  (s) => testUserIds.has(s.user_id) || testRestaurantIds.has(s.restaurant_id) || testScreenIds.has(s.screen_id)
);
for (const s of testSnapshots) {
  if (protectedSnapshotIds.has(s.id)) abort(`protected snapshot ${s.id} matched the test discriminator`);
  if (s.user_id === OWNER_USER_ID) abort(`owner snapshot ${s.id} matched the test discriminator`);
}
const testSnapshotIds = new Set(testSnapshots.map((s) => s.id));

// ── Templates: only those captured from the deleted snapshots/screens and
//    no longer referenced by anything that survives.
const candidateTemplateIds = new Set();
for (const s of testSnapshots) if (s.template_id) candidateTemplateIds.add(s.template_id);
for (const s of testScreens) if (s.template_id) candidateTemplateIds.add(s.template_id);
const survivingScreenTemplateIds = new Set(
  allScreens.filter((s) => !testScreenIds.has(s.id)).map((s) => s.template_id).filter(Boolean)
);
const survivingSnapshotTemplateIds = new Set(
  allSnapshots.filter((s) => !testSnapshotIds.has(s.id)).map((s) => s.template_id).filter(Boolean)
);
const testTemplates = [];
const keptTemplates = [];
for (const id of candidateTemplateIds) {
  const tpl = db.prepare('SELECT id, name FROM templates WHERE id = ?').get(id);
  if (!tpl) continue;
  if (survivingScreenTemplateIds.has(id) || survivingSnapshotTemplateIds.has(id)) {
    keptTemplates.push(tpl);
  } else {
    testTemplates.push(tpl);
  }
}
const testTemplateIds = new Set(testTemplates.map((t) => t.id));

// ── Rows that will be removed from the child tables ─────────────────────────
const screenIdList = [...testScreenIds];
const inClause = (n) => Array.from({ length: n }, () => '?').join(',');
const testMenuItems =
  screenIdList.length > 0
    ? db.prepare(`SELECT id, screen_id, name, price FROM menu_items WHERE screen_id IN (${inClause(screenIdList.length)})`).all(...screenIdList)
    : [];
const testSchedules =
  screenIdList.length > 0
    ? db.prepare(`SELECT id, screen_id, menu_name FROM schedules WHERE screen_id IN (${inClause(screenIdList.length)})`).all(...screenIdList)
    : [];

// ── Upload files: only the paths named by the snapshots we delete ───────────
const survivingUploadPaths = new Set(
  allSnapshots
    .filter((s) => !testSnapshotIds.has(s.id))
    .flatMap((s) => [s.original_path, s.mockup_path])
    .filter(Boolean)
);
const uploadFilesToDelete = [];
const uploadFilesSkipped = [];
for (const s of testSnapshots) {
  for (const p of [s.original_path, s.mockup_path]) {
    if (!p) continue;
    if (survivingUploadPaths.has(p)) {
      uploadFilesSkipped.push({ path: p, why: 'still referenced by a surviving snapshot' });
      continue;
    }
    const abs = path.resolve(ROOT, p.replace(/^\/+/, ''));
    if (!abs.startsWith(UPLOADS_DIR + path.sep)) {
      uploadFilesSkipped.push({ path: p, why: 'resolves outside uploads/ — refusing' });
      continue;
    }
    uploadFilesToDelete.push({ snapshot: s.id, url: p, abs, exists: fs.existsSync(abs) });
  }
}

// ── Census ─────────────────────────────────────────────────────────────────
const TABLES = ['users', 'restaurants', 'templates', 'screens', 'menu_items', 'schedules', 'snapshots'];
const census = () => Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
const before = census();

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`\nLumenu test-data scrub (${DRY ? 'DRY-RUN — nothing will be deleted' : 'LIVE — deletions will be committed'})`);
console.log(`  DB: ${DB_PATH}\n`);

console.log('Guards:');
log(`✅ ${OWNER_SCREEN_SLUG} present`);
log(`✅ showcase restaurants present (${SHOWCASE_RESTAURANT_NAMES.join(', ')})`);
log(`✅ demo screens present (${SHOWCASE_SCREEN_SLUGS.join(', ')})`);
log(`✅ deny-list resolved: ${protectedUserIds.size} users, ${protectedRestaurantIds.size} restaurants, ${protectedScreenIds.size} screens, ${protectedSnapshotIds.size} snapshots`);

console.log('\nCensus (before):');
log(JSON.stringify(before));

console.log('\nTest identities found:');
if (testUsers.length === 0) log('(none)');
for (const u of testUsers) log(`user      ${u.id}  ${u.email}  "${u.name}"  created ${u.created_at}`);
if (suspiciousUsers.length) {
  console.log(`  ⚠ ${suspiciousUsers.length} @test.app user(s) do not match a known prefix — check them before --apply:`);
  for (const u of suspiciousUsers) log(`  ?? ${u.email}`);
}
for (const r of testRestaurants) log(`restaurant ${r.id}  "${r.name}"  owner ${r.user_id}  created ${r.created_at}`);
for (const s of testScreens) log(`screen     ${s.id}  "${s.name}"  slug ${s.unique_slug}`);
for (const s of testSnapshots) log(`snapshot   ${s.id}  ${s.status}  ${s.email}  ${s.original_path}`);

console.log('\nDelete plan (FK order):');
plan(`${testSnapshots.length} snapshots`);
for (const s of testSnapshots) plan(`   ${s.id}  ${s.status}  ${s.email}  ${s.original_path}`);
plan(`${testMenuItems.length} menu_items (screens: ${screenIdList.length})`);
plan(`${testSchedules.length} schedules`);
plan(`${testScreens.length} screens`);
for (const s of testScreens) plan(`   ${s.id}  "${s.name}"  ${s.unique_slug}`);
plan(`${testTemplates.length} templates`);
for (const t of testTemplates) plan(`   ${t.id}  "${t.name}"`);
plan(`${testRestaurants.length} restaurants`);
for (const r of testRestaurants) plan(`   ${r.id}  "${r.name}"`);
plan(`${testUsers.length} users`);
for (const u of testUsers) plan(`   ${u.id}  ${u.email}`);
plan(`${uploadFilesToDelete.length} upload files (from the deleted snapshots' original_path/mockup_path)`);
for (const f of uploadFilesToDelete) plan(`   ${f.url}  ${f.exists ? '' : '(already missing) '}snapshot ${f.snapshot}`);
if (!CAN_DELETE_UPLOADS) {
  console.log(
    `\n⚠ upload files will NOT be removed: this is not the live DB (${DB_PATH}).\n` +
      `  Pass --uploads-dir=<path to that DB's uploads tree> if it owns one.\n` +
      `  Rehearsal mode: the live ${UPLOADS_DIR} tree is left untouched.`
  );
}
if (keptTemplates.length) {
  console.log('\nTemplates kept (still referenced by surviving rows):');
  for (const t of keptTemplates) log(`${t.id}  "${t.name}"`);
}
if (uploadFilesSkipped.length) {
  console.log('\nUpload files kept:');
  for (const f of uploadFilesSkipped) log(`${f.path} — ${f.why}`);
}

// Everything below is a hard assert: no protected row may appear in any set.
const denyViolations = [
  ...[...testUserIds].filter((id) => protectedUserIds.has(id)).map((id) => `user ${id}`),
  ...[...testRestaurantIds].filter((id) => protectedRestaurantIds.has(id)).map((id) => `restaurant ${id}`),
  ...[...testScreenIds].filter((id) => protectedScreenIds.has(id)).map((id) => `screen ${id}`),
  ...[...testSnapshotIds].filter((id) => protectedSnapshotIds.has(id)).map((id) => `snapshot ${id}`),
];
if (denyViolations.length) abort(`deny-list violation in the delete plan: ${denyViolations.join(', ')}`);
console.log('\nDeny-list assert: ✅ no protected row is in the delete plan');

if (DRY) {
  console.log('\n── DRY-RUN complete — nothing was deleted. Re-run with --apply to commit. ──\n');
  db.close();
  process.exit(0);
}

// ── Backup (consistent copy, safe while the live server holds the DB open) ──
const now = new Date();
const iso = now.toISOString();
const dateOnly = iso.slice(0, 10);
const stamp = iso.slice(0, 19).replace(/[:T]/g, '-'); // 2026-10-29-20-15-00
const backupDir = backupArg ? path.resolve(backupArg.slice('--backup-dir='.length)) : path.join(ROOT, `data-backup-restore-${dateOnly}`);
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `menuvo.pre-scrub-${stamp}.db`);

(async () => {
  console.log(`\nBackup: writing a consistent copy to ${backupFile}`);
  try {
    // VACUUM INTO is atomic and includes everything committed in the WAL.
    db.prepare('VACUUM INTO ?').run(backupFile);
  } catch (err) {
    console.log(`  VACUUM INTO failed (${err.message}); falling back to the SQLite backup API`);
    const src = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      await src.backup(backupFile);
    } finally {
      src.close();
    }
  }
  const bdb = new Database(backupFile, { readonly: true, fileMustExist: true });
  const bIntegrity = bdb.pragma('integrity_check', { simple: true });
  const backupCensus = Object.fromEntries(TABLES.map((t) => [t, bdb.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
  bdb.close();
  const censusMatches = TABLES.every((t) => backupCensus[t] === before[t]);
  console.log(`  integrity_check: ${bIntegrity}`);
  console.log(`  backup census:   ${JSON.stringify(backupCensus)}`);
  if (bIntegrity !== 'ok' || !censusMatches) {
    abort(`backup verification failed (integrity=${bIntegrity}, census match=${censusMatches}) — nothing was deleted`);
  }
  console.log('  ✅ backup verified');

  // ── Delete: ONE transaction, rolled back on any error ────────────────────
  const del = (sql) => db.prepare(sql);
  const applyAll = db.transaction(() => {
    if (testSnapshotIds.size) {
      const stmt = del(`DELETE FROM snapshots WHERE id = ?`);
      for (const id of testSnapshotIds) stmt.run(id);
    }
    if (screenIdList.length) {
      const ph = inClause(screenIdList.length);
      const r1 = del(`DELETE FROM menu_items WHERE screen_id IN (${ph})`).run(...screenIdList);
      const r2 = del(`DELETE FROM schedules WHERE screen_id IN (${ph})`).run(...screenIdList);
      console.log(`  deleted ${r1.changes} menu_items, ${r2.changes} schedules`);
      const r3 = del(`DELETE FROM screens WHERE id IN (${ph})`).run(...screenIdList);
      console.log(`  deleted ${r3.changes} screens`);
    }
    if (testTemplateIds.size) {
      const stmt = del(`DELETE FROM templates WHERE id = ?`);
      let n = 0;
      for (const id of testTemplateIds) n += stmt.run(id).changes;
      console.log(`  deleted ${n} templates`);
    }
    if (testRestaurantIds.size) {
      const stmt = del(`DELETE FROM restaurants WHERE id = ?`);
      let n = 0;
      for (const id of testRestaurantIds) n += stmt.run(id).changes;
      console.log(`  deleted ${n} restaurants`);
    }
    if (testUserIds.size) {
      const stmt = del(`DELETE FROM users WHERE id = ?`);
      let n = 0;
      for (const id of testUserIds) n += stmt.run(id).changes;
      console.log(`  deleted ${n} users`);
    }
    console.log(`  deleted ${testSnapshotIds.size} snapshots`);
  });

  try {
    applyAll();
  } catch (err) {
    console.error(`\n❌ Transaction failed and was rolled back: ${err.message}`);
    console.error(`   The database is unchanged. Backup at ${backupFile}`);
    db.close();
    process.exit(1);
  }
  console.log('\n── Apply committed (single transaction) ──');

  // Upload files are not transactional: unlink only after the commit.
  console.log('\nUpload files:');
  let removed = 0;
  if (!CAN_DELETE_UPLOADS) {
    console.log(`  skipped — DB is a copy, not the live DB. Nothing under ${UPLOADS_DIR} was touched.`);
    console.log(`  (the ${uploadFilesToDelete.length} file(s) listed above are still on disk; use --uploads-dir to remove them)`);
  } else {
    for (const f of uploadFilesToDelete) {
      if (!f.exists) { console.log(`  - ${f.url} (already missing)`); continue; }
      try {
        fs.unlinkSync(f.abs);
        removed += 1;
        console.log(`  - ${f.url}`);
      } catch (err) {
        console.log(`  ! ${f.url} — ${err.message}`);
      }
    }
    console.log(`  ${removed} file(s) removed`);
  }

  const after = census();
  console.log('\nCensus (after):');
  log(JSON.stringify(after));
  console.log('Census diff:');
  for (const t of TABLES) log(`${t.padEnd(12)} ${before[t]} → ${after[t]}  (${after[t] - before[t]})`);

  // ── Post-apply verification: the protected rows are all still here ───────
  const checks = [
    ['owner user', db.prepare('SELECT id FROM users WHERE id = ?').get(OWNER_USER_ID)],
    ['marco@trattoria.demo', db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_USER_EMAIL)],
    ['restaurant Lupitas', db.prepare('SELECT id FROM restaurants WHERE name = ?').get(OWNER_RESTAURANT_NAME)],
    ['screen right-tv-luptitas', db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(OWNER_SCREEN_SLUG)],
  ];
  for (const name of SHOWCASE_RESTAURANT_NAMES) {
    checks.push([`restaurant ${name}`, db.prepare('SELECT id FROM restaurants WHERE name = ?').get(name)]);
  }
  for (const slug of SHOWCASE_SCREEN_SLUGS) {
    checks.push([`screen ${slug}`, db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(slug)]);
  }
  for (const id of HISTORICAL_OWNER_FAILED_SNAPSHOT_IDS) {
    checks.push([`snapshot ${id}`, db.prepare('SELECT id FROM snapshots WHERE id = ?').get(id)]);
  }
  console.log('\nPreserved (post-apply):');
  let ok = true;
  for (const [label, row] of checks) {
    if (!row) ok = false;
    console.log(`  ${row ? '✅' : '❌'} ${label}`);
  }
  const lupitasItems = db
    .prepare(
      `SELECT COUNT(*) c FROM menu_items mi JOIN screens s ON s.id = mi.screen_id WHERE s.unique_slug = ?`
    )
    .get(OWNER_SCREEN_SLUG).c;
  console.log(`  ${lupitasItems > 0 ? '✅' : '❌'} ${OWNER_SCREEN_SLUG} still has ${lupitasItems} menu item(s)`);

  db.close();
  if (!ok || lupitasItems === 0) {
    console.error(`\n❌ Post-apply verification failed. Restore from ${backupFile} if needed.\n`);
    process.exit(1);
  }
  console.log(`\nDone. Backup: ${backupFile}`);
  console.log('Restart the server so it drops any cached state (WAL changes are already visible to it).\n');
})().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  try { db.close(); } catch {}
  process.exit(1);
});
