import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin } from '@/lib/permissions';
import { fetchLearningCurve, scopeFromParams } from '@/lib/reports/queries';

/** Per-learner cumulative weekly completions — the learning curve itself. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canViewAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const points = await fetchLearningCurve(12, scopeFromParams(request.nextUrl.searchParams));
    return NextResponse.json({ success: true, data: { points } });
  } catch (error) {
    console.error('Reports curve error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
