import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin } from '@/lib/permissions';
import { fetchLearners } from '@/lib/reports/queries';

/** Per-learner rollup: courses completed, time spent, quiz performance, status. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canViewAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get('search')?.trim() || undefined;
    const learners = await fetchLearners(search);

    return NextResponse.json({ success: true, data: { learners } });
  } catch (error) {
    console.error('Reports learners error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
