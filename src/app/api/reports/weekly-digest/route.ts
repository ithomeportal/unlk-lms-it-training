import { NextRequest, NextResponse } from 'next/server';
import { buildWeeklyDigest } from '@/lib/reports/digest';
import {
  fetchCompliance,
  fetchCourses,
  fetchKpis,
  fetchLearners,
  fetchTrend,
} from '@/lib/reports/queries';
import { lastSuccessfulSyncAt } from '@/lib/timeoff-sync-log';
import type { ComplianceSummary } from '@/lib/reports/types';

/**
 * The weekly executive-summary report, as ready-to-send email.
 *
 * Returns `{ subject, html, meta }`. It does NOT send anything: delivery is the
 * n8n workflow "LMS — WEEKLY TRAINING REPORT", which fires Mondays at 07:00
 * America/Chicago and mails the body through the standard Outlook reports
 * sender.
 *
 * Why the schedule lives in n8n rather than in vercel.json alongside the health
 * cron: **Vercel cron expressions are evaluated in UTC only.** "07:00 Central"
 * would therefore be 07:00 for half the year and 08:00 for the other half. n8n
 * runs with `settings.timezone: America/Chicago`, so it tracks DST.
 *
 * Why the HTML is built here rather than in an n8n Code node: it comes from the
 * same `queries.ts` functions that render /admin/reports. Re-deriving the
 * numbers on the n8n side would fork the metric definitions — credited vs
 * measured time, the LESSON_DONE OR-condition, system-account exclusion — and
 * the email would eventually contradict the screen with nothing to explain why.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, the same shape as
 * /api/health/deep. Machine-authenticated, so it lives outside /api/admin,
 * whose routes all resolve a session.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMPTY_SUMMARY: ComplianceSummary = {
  total: 0,
  completed: 0,
  overdue: 0,
  due_soon: 0,
  in_progress: 0,
  not_started: 0,
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Six independent queries, concurrently.
    //
    // Every fetcher is called with its DEFAULT scope, which is current
    // employees only — see `learnerScope` in queries.ts. That default is what
    // keeps ex-employees out of this email; do not pass `includeInactive` here.
    // The report went to HR naming two people who had left the company because
    // fetchLearners had no such filter while fetchKpis did.
    const [kpis, trend, learners, courses, complianceRows, rosterSyncedAt] = await Promise.all([
      fetchKpis(),
      fetchTrend(12),
      fetchLearners(),
      fetchCourses(),
      fetchCompliance(),
      lastSuccessfulSyncAt(),
    ]);

    const summary = complianceRows.reduce<ComplianceSummary>(
      (acc, row) => {
        acc.total += 1;
        acc[row.state] += 1;
        return acc;
      },
      { ...EMPTY_SUMMARY }
    );

    const digest = buildWeeklyDigest({
      kpis,
      trend,
      learners,
      courses,
      compliance: { rows: complianceRows, summary },
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      rosterSyncedAt,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          subject: digest.subject,
          html: digest.html,
          generatedAt: new Date().toISOString(),
          meta: digest.meta,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Weekly digest build failed:', error);
    // A 500 with no `html` is the point. The sender retries three times and
    // then hands off to the n8n error workflow; a 200 carrying a partial or
    // empty body would mail HR a blank report and look like a quiet week.
    return NextResponse.json(
      { success: false, error: `Failed to build the weekly digest: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
