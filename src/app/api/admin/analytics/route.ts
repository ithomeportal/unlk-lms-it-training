import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query } from '@/lib/db';

export interface UserAnalytics {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  total_session_time_seconds: number;
  courses_enrolled: number;
  courses_in_progress: number;
  courses_completed: number;
  overall_progress_percent: number;
  total_time_spent_seconds: number;
  quizzes_taken: number;
  quizzes_passed: number;
  average_quiz_score: number | null;
}

// Helper function to calculate minimum required time for a lesson
function calculateMinRequiredTime(
  contentType: string,
  durationMinutes: number,
  textContent: string | null
): number {
  let minTimeSeconds = 0;

  // Video time: Use 80% of stated duration as minimum
  if (contentType === 'video' || contentType === 'mixed') {
    minTimeSeconds += Math.floor(durationMinutes * 60 * 0.8);
  }

  // Text time: Calculate based on word count (150 words/min for learning)
  if ((contentType === 'text' || contentType === 'mixed') && textContent) {
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    const readingTimeSeconds = Math.ceil((wordCount / 150) * 60);
    // Minimum 3 minutes for any text lesson
    minTimeSeconds += Math.max(readingTimeSeconds, 180);
  }

  // If no duration set at all, default to 3 minutes
  return minTimeSeconds || 180;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get search/filter params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'last_login_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Get all users with aggregated analytics
    const users = await query<UserAnalytics>(`
      WITH login_stats AS (
        SELECT
          user_id,
          COUNT(*) as login_count,
          COALESCE(SUM(session_duration_seconds), 0) as total_session_time
        FROM login_history
        GROUP BY user_id
      ),
      enrollment_stats AS (
        SELECT
          user_id,
          COUNT(*) as enrolled,
          COUNT(*) FILTER (WHERE completed_at IS NULL) as in_progress,
          COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed
        FROM enrollments
        GROUP BY user_id
      ),
      progress_stats AS (
        SELECT
          lp.user_id,
          COALESCE(SUM(lp.time_spent_seconds), 0) as total_time_spent,
          CASE
            WHEN COUNT(*) > 0
            THEN ROUND(
              COUNT(*) FILTER (WHERE lp.status = 'completed')::numeric / COUNT(*) * 100
            )
            ELSE 0
          END as overall_progress
        FROM lesson_progress lp
        GROUP BY lp.user_id
      ),
      quiz_stats AS (
        SELECT
          user_id,
          COUNT(*) as quizzes_taken,
          COUNT(*) FILTER (WHERE passed = true) as quizzes_passed,
          AVG(score) as avg_score
        FROM quiz_attempts
        WHERE status = 'completed'
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login_at,
        COALESCE(ls.login_count, 0)::int as login_count,
        COALESCE(ls.total_session_time, 0)::int as total_session_time_seconds,
        COALESCE(es.enrolled, 0)::int as courses_enrolled,
        COALESCE(es.in_progress, 0)::int as courses_in_progress,
        COALESCE(es.completed, 0)::int as courses_completed,
        COALESCE(ps.overall_progress, 0)::int as overall_progress_percent,
        COALESCE(ps.total_time_spent, 0)::int as total_time_spent_seconds,
        COALESCE(qs.quizzes_taken, 0)::int as quizzes_taken,
        COALESCE(qs.quizzes_passed, 0)::int as quizzes_passed,
        qs.avg_score as average_quiz_score
      FROM users u
      LEFT JOIN login_stats ls ON ls.user_id = u.id
      LEFT JOIN enrollment_stats es ON es.user_id = u.id
      LEFT JOIN progress_stats ps ON ps.user_id = u.id
      LEFT JOIN quiz_stats qs ON qs.user_id = u.id
      WHERE
        u.role != 'super_admin' OR u.id = $1
      ${search ? `AND (u.email ILIKE $2 OR u.name ILIKE $2)` : ''}
      ORDER BY
        CASE WHEN $${search ? '3' : '2'} = 'last_login_at' AND $${search ? '4' : '3'} = 'desc' THEN u.last_login_at END DESC NULLS LAST,
        CASE WHEN $${search ? '3' : '2'} = 'last_login_at' AND $${search ? '4' : '3'} = 'asc' THEN u.last_login_at END ASC NULLS LAST,
        CASE WHEN $${search ? '3' : '2'} = 'name' AND $${search ? '4' : '3'} = 'desc' THEN u.name END DESC NULLS LAST,
        CASE WHEN $${search ? '3' : '2'} = 'name' AND $${search ? '4' : '3'} = 'asc' THEN u.name END ASC NULLS LAST,
        CASE WHEN $${search ? '3' : '2'} = 'courses_enrolled' AND $${search ? '4' : '3'} = 'desc' THEN COALESCE(es.enrolled, 0) END DESC,
        CASE WHEN $${search ? '3' : '2'} = 'courses_enrolled' AND $${search ? '4' : '3'} = 'asc' THEN COALESCE(es.enrolled, 0) END ASC,
        CASE WHEN $${search ? '3' : '2'} = 'overall_progress_percent' AND $${search ? '4' : '3'} = 'desc' THEN COALESCE(ps.overall_progress, 0) END DESC,
        CASE WHEN $${search ? '3' : '2'} = 'overall_progress_percent' AND $${search ? '4' : '3'} = 'asc' THEN COALESCE(ps.overall_progress, 0) END ASC,
        u.created_at DESC
    `, search
      ? [user.id, `%${search}%`, sortBy, sortOrder]
      : [user.id, sortBy, sortOrder]
    );

    // Get summary stats
    const summaryStats = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.last_login_at && new Date(u.last_login_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
      usersWithProgress: users.filter(u => u.courses_enrolled > 0).length,
      averageCompletion: users.length > 0
        ? Math.round(users.reduce((acc, u) => acc + u.overall_progress_percent, 0) / users.length)
        : 0
    };

    return NextResponse.json({
      users,
      summary: summaryStats
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
