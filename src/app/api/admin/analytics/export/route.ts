import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth';
import { query } from '@/lib/db';

interface ExportRow {
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  total_session_time_minutes: number;
  courses_enrolled: number;
  courses_in_progress: number;
  courses_completed: number;
  overall_progress_percent: number;
  total_learning_time_minutes: number;
  quizzes_taken: number;
  quizzes_passed: number;
  average_quiz_score: number | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0];
}

function escapeCSV(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // Only super_admin can export
    if (!user || !isSuperAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized - Super Admin access required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    // Get all users with aggregated analytics
    const users = await query<ExportRow>(`
      WITH login_stats AS (
        SELECT
          user_id,
          COUNT(*) as login_count,
          COALESCE(SUM(session_duration_seconds), 0) / 60 as total_session_time_minutes
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
          COALESCE(SUM(lp.time_spent_seconds), 0) / 60 as total_learning_time_minutes,
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
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login_at,
        COALESCE(ls.login_count, 0)::int as login_count,
        COALESCE(ls.total_session_time_minutes, 0)::int as total_session_time_minutes,
        COALESCE(es.enrolled, 0)::int as courses_enrolled,
        COALESCE(es.in_progress, 0)::int as courses_in_progress,
        COALESCE(es.completed, 0)::int as courses_completed,
        COALESCE(ps.overall_progress, 0)::int as overall_progress_percent,
        COALESCE(ps.total_learning_time_minutes, 0)::int as total_learning_time_minutes,
        COALESCE(qs.quizzes_taken, 0)::int as quizzes_taken,
        COALESCE(qs.quizzes_passed, 0)::int as quizzes_passed,
        ROUND(qs.avg_score::numeric, 1) as average_quiz_score
      FROM users u
      LEFT JOIN login_stats ls ON ls.user_id = u.id
      LEFT JOIN enrollment_stats es ON es.user_id = u.id
      LEFT JOIN progress_stats ps ON ps.user_id = u.id
      LEFT JOIN quiz_stats qs ON qs.user_id = u.id
      ORDER BY u.created_at DESC
    `);

    if (format === 'json') {
      return NextResponse.json({ data: users });
    }

    // Generate CSV
    const headers = [
      'Email',
      'Name',
      'Role',
      'Active',
      'Created At',
      'Last Login',
      'Login Count',
      'Total Session Time (min)',
      'Courses Enrolled',
      'Courses In Progress',
      'Courses Completed',
      'Overall Progress %',
      'Total Learning Time (min)',
      'Quizzes Taken',
      'Quizzes Passed',
      'Average Quiz Score'
    ];

    const rows = users.map(u => [
      escapeCSV(u.email),
      escapeCSV(u.name),
      escapeCSV(u.role),
      escapeCSV(u.is_active ? 'Yes' : 'No'),
      escapeCSV(formatDate(u.created_at)),
      escapeCSV(formatDate(u.last_login_at)),
      escapeCSV(u.login_count),
      escapeCSV(u.total_session_time_minutes),
      escapeCSV(u.courses_enrolled),
      escapeCSV(u.courses_in_progress),
      escapeCSV(u.courses_completed),
      escapeCSV(u.overall_progress_percent),
      escapeCSV(u.total_learning_time_minutes),
      escapeCSV(u.quizzes_taken),
      escapeCSV(u.quizzes_passed),
      escapeCSV(u.average_quiz_score)
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `user-analytics-${date}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting analytics:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
