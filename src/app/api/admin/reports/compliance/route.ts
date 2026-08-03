import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin } from '@/lib/permissions';
import { fetchCompliance, scopeFromParams } from '@/lib/reports/queries';

/**
 * Mandatory-training compliance: one row per assigned learner x required course.
 *
 * This is the report whose absence let a stuck "Required Training" banner go
 * unnoticed — there was no screen anywhere that stated plainly who had and had
 * not completed a required course.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canViewAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await fetchCompliance(scopeFromParams(request.nextUrl.searchParams));

    const summary = {
      total: rows.length,
      completed: rows.filter((r) => r.state === 'completed').length,
      overdue: rows.filter((r) => r.state === 'overdue').length,
      due_soon: rows.filter((r) => r.state === 'due_soon').length,
      in_progress: rows.filter((r) => r.state === 'in_progress').length,
      not_started: rows.filter((r) => r.state === 'not_started').length,
    };

    return NextResponse.json({ success: true, data: { rows, summary } });
  } catch (error) {
    console.error('Reports compliance error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
