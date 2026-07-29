import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin } from '@/lib/permissions';
import { fetchKpis, fetchTrend } from '@/lib/reports/queries';

/**
 * Executive summary: platform KPIs plus a 12-week activity trend.
 *
 * Read-only oversight, so `canViewAdmin` — admin, super_admin AND auditor.
 *
 * The SQL lives in src/lib/reports/queries.ts, shared with the CSV export, so
 * a number can never mean one thing on screen and another in the download.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !canViewAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Independent queries — run concurrently rather than in series as the
    // previous implementation did with its six sequential round trips.
    const [kpis, trend] = await Promise.all([fetchKpis(), fetchTrend(12)]);

    return NextResponse.json({ success: true, data: { kpis, trend } });
  } catch (error) {
    console.error('Reports summary error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
