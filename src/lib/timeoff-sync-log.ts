import { execute, queryOne } from '@/lib/db';

/**
 * Provenance for the nightly Time-Off roster sync (`timeoff_sync_runs`,
 * migration 012).
 *
 * This exists so a dead sync is visible. Every screen fed by the mirrored
 * `users.is_active` renders identically whether the sync ran last night or
 * stopped running in March — which is exactly how the original problem went
 * unnoticed. The weekly digest prints the last successful run, so a stale date
 * on a report someone actually reads is the alarm.
 *
 * Kept out of the route file: Next.js route modules may only export HTTP
 * handlers and route config, so a shared helper cannot live there.
 */

export interface SyncOutcome {
  ok: boolean;
  rosterCount: number;
  checked: number;
  deactivated: number;
  reactivated: number;
  unmatched: number;
  durationMs: number;
  error: string | null;
}

/**
 * Append one row per run. Best-effort by design: if the log write fails, the
 * HTTP response must still reflect what actually happened to the accounts, so
 * this never throws.
 */
export async function recordSyncRun(outcome: SyncOutcome): Promise<void> {
  try {
    await execute(
      `INSERT INTO timeoff_sync_runs
         (ok, roster_count, checked, deactivated, reactivated, unmatched, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        outcome.ok,
        outcome.rosterCount,
        outcome.checked,
        outcome.deactivated,
        outcome.reactivated,
        outcome.unmatched,
        outcome.durationMs,
        outcome.error,
      ]
    );
  } catch (error) {
    // SQLSTATE 42501 here means migration 012's GRANT never ran in this
    // environment — it will not reproduce locally, where .env.local is avnadmin.
    console.error('timeoff-sync: could not write timeoff_sync_runs:', error);
  }
}

/**
 * When the roster was last synced successfully, for the "as of" line in the
 * weekly digest. Null when the table is empty or unreadable — rendered as
 * "never", which is the honest reading.
 */
export async function lastSuccessfulSyncAt(): Promise<Date | null> {
  try {
    const row = await queryOne<{ ran_at: Date }>(
      `SELECT ran_at FROM timeoff_sync_runs WHERE ok = true ORDER BY ran_at DESC LIMIT 1`
    );
    return row?.ran_at ?? null;
  } catch (error) {
    console.error('timeoff-sync: could not read last sync time:', error);
    return null;
  }
}
