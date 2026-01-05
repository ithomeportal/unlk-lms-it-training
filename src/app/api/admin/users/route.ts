import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.created_at,
        COUNT(DISTINCT e.id) as enrollments_count,
        COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.id END) as completed_courses
      FROM users u
      LEFT JOIN enrollments e ON e.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
