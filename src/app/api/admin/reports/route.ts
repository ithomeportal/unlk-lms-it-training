import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user stats
    const userStats = await queryOne<{ total: number; active: number }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active
      FROM users
    `);

    // Get course stats
    const courseStats = await queryOne<{ total: number; published: number }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_published = true) as published
      FROM courses
    `);

    // Get enrollment stats
    const enrollmentStats = await queryOne<{ total: number; completed: number }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed
      FROM enrollments
    `);

    // Get lesson stats
    const lessonStats = await queryOne<{ total: number; completed: number }>(`
      SELECT
        (SELECT COUNT(*) FROM lessons) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM lesson_progress
    `);

    // Get per-course performance
    const coursePerformance = await query<{
      id: string;
      title: string;
      enrollments: number;
      completions: number;
      completion_rate: number;
    }>(`
      SELECT
        c.id,
        c.title,
        COUNT(DISTINCT e.id) as enrollments,
        COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.id END) as completions,
        CASE
          WHEN COUNT(DISTINCT e.id) > 0
          THEN ROUND(COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.id END)::numeric / COUNT(DISTINCT e.id) * 100)
          ELSE 0
        END as completion_rate
      FROM courses c
      LEFT JOIN enrollments e ON e.course_id = c.id
      WHERE c.is_published = true
      GROUP BY c.id, c.title
      ORDER BY enrollments DESC
      LIMIT 10
    `);

    // Get recent activity
    const recentActivity = await query<{
      user_email: string;
      user_name: string | null;
      course_title: string;
      lesson_title: string;
      status: string;
      last_accessed_at: string;
    }>(`
      SELECT
        u.email as user_email,
        u.name as user_name,
        c.title as course_title,
        l.title as lesson_title,
        lp.status,
        lp.last_accessed_at
      FROM lesson_progress lp
      JOIN users u ON u.id = lp.user_id
      JOIN lessons l ON l.id = lp.lesson_id
      JOIN courses c ON c.id = lp.course_id
      ORDER BY lp.last_accessed_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      totalUsers: Number(userStats?.total || 0),
      activeUsers: Number(userStats?.active || 0),
      totalCourses: Number(courseStats?.total || 0),
      publishedCourses: Number(courseStats?.published || 0),
      totalEnrollments: Number(enrollmentStats?.total || 0),
      completedEnrollments: Number(enrollmentStats?.completed || 0),
      totalLessons: Number(lessonStats?.total || 0),
      lessonsCompleted: Number(lessonStats?.completed || 0),
      courseStats: coursePerformance,
      recentActivity,
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
