import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin } from '@/lib/permissions';
import { fetchCourses } from '@/lib/reports/queries';

/** Per-course rollup: completion rate, pace, effort ratio, drop-off point. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !canViewAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const courses = await fetchCourses();
    return NextResponse.json({ success: true, data: { courses } });
  } catch (error) {
    console.error('Reports courses error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
