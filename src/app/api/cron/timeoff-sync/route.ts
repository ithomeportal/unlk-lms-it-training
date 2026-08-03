import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { readRoster } from '@/lib/timeoff-db';
import { planRosterSync, type LmsUserRow } from '@/lib/timeoff-roster';
import { recordSyncRun, type SyncOutcome } from '@/lib/timeoff-sync-log';

/**
 * Nightly employee-status sync: mirror Time-Off's `users."isActive"` onto the
 * LMS's `users.is_active`.
 *
 * Time-Off is the company's system of record for employment status. Until this
 * route existed nothing ever wrote `is_active = false` in the LMS, so every
 * account created since launch was still "active" — and the weekly HR e-mail
 * named two people who had left the company months earlier.
 *
 * Schedule: 03:00 America/Chicago, from n8n workflow
 * "LMS - DAILY EMPLOYEE STATUS SYNC". NOT vercel.json: Vercel evaluates cron
 * expressions in UTC only, so "03:00 Central" would silently become 02:00 for
 * half the year. Same reasoning as the weekly digest.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, byte-identical to /api/health/deep
 * and /api/reports/weekly-digest. Machine-authenticated, so it lives outside
 * /api/admin, whose routes all resolve a session.
 *
 * Failure policy: this route returns a NON-200 on any failure, and each unit of
 * work has its own try/catch. Both are deliberate. A background job that puts
 * several sequential awaits in one try lets one bad row kill unrelated work, and
 * a job that swallows its error and returns 200 goes unnoticed for days — that
 * exact pair of mistakes cost a 3-day silent outage on a sibling project.
 *
 * Full write-up: docs/SPEC-EMPLOYEE-STATUS-SYNC.md
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  const fail = async (message: string) => {
    await recordSyncRun({
      ok: false,
      rosterCount: 0,
      checked: 0,
      deactivated: 0,
      reactivated: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
      error: message,
    });
    console.error('timeoff-sync failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  };

  // --- 1. Read the Time-Off roster -----------------------------------------
  const roster = await readRoster();

  if (!roster.configured) {
    // No credential in this environment. A no-op, not a failure — but recorded
    // so it cannot be mistaken for "nothing changed tonight".
    await recordSyncRun({
      ok: true,
      rosterCount: 0,
      checked: 0,
      deactivated: 0,
      reactivated: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
      error: 'TIMEOFF_DATABASE_URL is not set — sync skipped',
    });
    return NextResponse.json({
      success: true,
      data: { skipped: true, reason: 'TIMEOFF_DATABASE_URL is not configured' },
    });
  }

  if (roster.error) {
    return fail(`Could not read the Time-Off roster: ${roster.error}`);
  }

  // --- 2. Read the LMS user list -------------------------------------------
  let lmsUsers: LmsUserRow[];
  try {
    lmsUsers = await query<LmsUserRow>(
      `SELECT id, lower(email) AS email, is_active FROM users WHERE email IS NOT NULL`
    );
  } catch (error) {
    return fail(`Could not read LMS users: ${(error as Error).message}`);
  }

  // --- 3. Decide what to change (pure, unit-tested) -------------------------
  const plan = planRosterSync(roster.employees, lmsUsers);
  if (plan.refusedReason) {
    return fail(plan.refusedReason);
  }

  // --- 4. Apply, one account at a time -------------------------------------
  // Separate statements rather than one bulk UPDATE: a single failure must not
  // discard the other accounts' changes, and the log needs to name what moved.
  const changes = [...plan.deactivate, ...plan.reactivate];
  const applied: string[] = [];
  const failures: string[] = [];
  let deactivated = 0;
  let reactivated = 0;

  for (const change of changes) {
    try {
      await execute(`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [
        change.isActive,
        change.id,
      ]);
      applied.push(`${change.email} -> ${change.isActive ? 'active' : 'inactive'}`);
      if (change.isActive) reactivated += 1;
      else deactivated += 1;
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      // The address is logged on purpose: this is a server log, not e-mail, and
      // without the identity the operator cannot act on the failure.
      failures.push(`${change.email}: ${code} ${(error as Error).message}`);
      console.error(`timeoff-sync: could not update ${change.email}:`, error);
    }
  }

  const outcome: SyncOutcome = {
    ok: failures.length === 0,
    rosterCount: roster.employees.length,
    checked: plan.checked,
    deactivated,
    reactivated,
    unmatched: plan.unmatched.length,
    durationMs: Date.now() - startedAt,
    error: failures.length ? failures.join(' | ') : null,
  };
  await recordSyncRun(outcome);

  if (failures.length) {
    return NextResponse.json(
      {
        success: false,
        error: `${failures.length} of ${changes.length} account updates failed`,
        data: { deactivated, reactivated, failures },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      rosterCount: outcome.rosterCount,
      checked: outcome.checked,
      deactivated,
      reactivated,
      unmatched: outcome.unmatched,
      changes: applied,
      durationMs: outcome.durationMs,
    },
  });
}
