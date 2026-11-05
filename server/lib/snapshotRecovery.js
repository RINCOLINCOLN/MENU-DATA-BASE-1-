/**
 * snapshotRecovery.js — guarantees a snapshot row never stays at 'processing'
 * forever.
 *
 * Two independent guards:
 *   1. Every pipeline run is wrapped in a hard timeout and a catch-all, so an
 *      unexpected throw (or a hung OCR worker) still writes a terminal status.
 *   2. Boot-time sweep: if the server restarts mid-run (or the process is
 *      killed), any row still 'processing' and older than the age guard is
 *      marked 'failed' with a message the owner can act on. Rows newer than the
 *      guard are left alone so genuinely in-flight uploads are untouched.
 *
 * Both paths only ever touch rows whose status is still 'processing', so they
 * are idempotent and can never overwrite a 'ready' result.
 */
import { getDb } from '../db/database.js';

export const RESTART_MESSAGE =
  "This one didn't finish — the server restarted while it was reading your menu. Please try again.";
export const TIMEOUT_MESSAGE =
  "This one took too long to read. Please try again — it usually takes under a minute.";
export const UNEXPECTED_MESSAGE =
  "Something went wrong while reading your menu. Please try again.";

export const STUCK_MINUTES = 10;

let sweepTimer = null;

/**
 * Belt-and-braces: re-run the age-guarded sweep every few minutes while the
 * server is up. Covers a hung pipeline that the per-run timeout could not
 * unwind (e.g. a worker that never resolves) without ever touching a fresh row.
 */
export function startStuckSnapshotSweeper({ everyMs = 5 * 60 * 1000, maxAgeMinutes = STUCK_MINUTES } = {}) {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => {
    try { recoverStuckSnapshots({ maxAgeMinutes }); } catch (err) {
      console.error('[snapshots] sweep failed:', err.message);
    }
  }, everyMs);
  if (sweepTimer.unref) sweepTimer.unref();
  return sweepTimer;
}

/** Record a terminal 'failed' for a row that has not already finished. */
export function markSnapshotFailed(snapshotId, message, db = getDb()) {
  try {
    const res = db.prepare(
      `UPDATE snapshots SET status = 'failed', error_message = ?, updated_at = datetime('now')
       WHERE id = ? AND status = 'processing'`
    ).run(message, snapshotId);
    return res.changes > 0;
  } catch (err) {
    console.error('[snapshots] could not record failure for', snapshotId, err.message);
    return false;
  }
}

/**
 * Fail any snapshot left in 'processing' past the age guard. Idempotent and
 * age-guarded: a run that is genuinely in flight is younger than the guard.
 * Returns the ids it recovered.
 */
export function recoverStuckSnapshots({ maxAgeMinutes = STUCK_MINUTES, db = getDb() } = {}) {
  const rows = db.prepare(
    `SELECT id FROM snapshots
      WHERE status = 'processing'
        AND COALESCE(updated_at, created_at) < datetime('now', ?)`
  ).all(`-${maxAgeMinutes} minutes`);
  if (!rows.length) return [];
  const upd = db.prepare(
    `UPDATE snapshots SET status = 'failed', error_message = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'processing'`
  );
  const recovered = [];
  for (const r of rows) {
    if (upd.run(RESTART_MESSAGE, r.id).changes > 0) recovered.push(r.id);
  }
  if (recovered.length) {
    console.warn(`[snapshots] boot recovery: ${recovered.length} stuck snapshot(s) marked failed: ${recovered.join(', ')}`);
  }
  return recovered;
}
