import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canViewAdmin, hasFullUserVisibility } from '@/lib/permissions';
import { query, queryOne } from '@/lib/db';
import { minRequiredSeconds } from '@/lib/learning-time';

export interface LoginHistoryItem {
  id: string;
  logged_in_at: string;
  logged_out_at: string | null;
  session_duration_seconds: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface CourseProgress {
  course_id: string;
  course_title: string;
  enrolled_at: string;
  completed_at: string | null;
  total_lessons: number;
  completed_lessons: number;
  validated_completed_lessons: number;
  progress_percent: number;
  validated_progress_percent: number;
  total_time_spent_seconds: number;
  lessons: LessonProgress[];
}

export interface LessonProgress {
  lesson_id: string;
  lesson_title: string;
  content_type: string;
  duration_minutes: number;
  min_required_seconds: number;
  status: string;
  time_spent_seconds: number;
  is_time_validated: boolean;
  completed_at: string | null;
  last_accessed_at: string | null;
}

export interface QuizAttempt {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  course_title: string;
  started_at: string;
  submitted_at: string | null;
  status: string;
  score: number | null;
  passed: boolean | null;
  passing_score: number;
  time_spent_seconds: number | null;
  total_questions: number;
}

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

/**
 * Expected engagement time for a lesson. The implementation moved to
 * src/lib/learning-time.ts so this route, the Reports zone and the tests all
 * apply one definition — it previously existed as two hand-copied versions,
 * one of them dead, in this route and api/admin/analytics/route.ts.
 */
const calculateMinRequiredTime = minRequiredSeconds;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !canViewAdmin(currentUser)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;

    // Get user details
    const user = await queryOne<UserDetail>(`
      SELECT id, email, name, role, is_active, created_at, last_login_at
      FROM users
      WHERE id = $1
    `, [userId]);

    // A plain admin does not see super_admins in the analytics LIST (that
    // query filters them out), but this detail route only checked canViewAdmin
    // — so guessing or copying a UUID reached the hidden record anyway,
    // including its full login history and IP addresses. Enforce the same
    // visibility rule the list applies. Viewing yourself is always allowed.
    if (user && !hasFullUserVisibility(currentUser) && user.role === 'super_admin' && user.id !== currentUser.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get login history
    const loginHistory = await query<LoginHistoryItem>(`
      SELECT
        id,
        logged_in_at,
        logged_out_at,
        session_duration_seconds,
        ip_address,
        user_agent
      FROM login_history
      WHERE user_id = $1
      ORDER BY logged_in_at DESC
      LIMIT 50
    `, [userId]);

    // Get course enrollments with lesson details
    const enrollments = await query<{
      course_id: string;
      course_title: string;
      enrolled_at: string;
      completed_at: string | null;
    }>(`
      SELECT
        c.id as course_id,
        c.title as course_title,
        e.enrolled_at,
        e.completed_at
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.user_id = $1
      ORDER BY e.enrolled_at DESC
    `, [userId]);

    // Build course progress with lesson details
    const coursesProgress: CourseProgress[] = [];

    for (const enrollment of enrollments) {
      // Get all lessons for this course with progress
      const lessonsData = await query<{
        lesson_id: string;
        lesson_title: string;
        content_type: string;
        duration_minutes: number;
        text_content: string | null;
        sort_order: number;
        status: string | null;
        time_spent_seconds: number | null;
        completed_at: string | null;
        last_accessed_at: string | null;
      }>(`
        SELECT
          l.id as lesson_id,
          l.title as lesson_title,
          l.content_type,
          l.duration_minutes,
          l.text_content,
          l.sort_order,
          lp.status,
          lp.time_spent_seconds,
          lp.completed_at,
          lp.last_accessed_at
        FROM lessons l
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
        WHERE l.course_id = $2
        ORDER BY l.sort_order
      `, [userId, enrollment.course_id]);

      const lessons: LessonProgress[] = lessonsData.map(lesson => {
        const minRequired = calculateMinRequiredTime(
          lesson.content_type,
          lesson.duration_minutes,
          lesson.text_content
        );
        const timeSpent = lesson.time_spent_seconds || 0;
        const isValidated = timeSpent >= minRequired;

        return {
          lesson_id: lesson.lesson_id,
          lesson_title: lesson.lesson_title,
          content_type: lesson.content_type,
          duration_minutes: lesson.duration_minutes,
          min_required_seconds: minRequired,
          status: lesson.status || 'not_started',
          time_spent_seconds: timeSpent,
          is_time_validated: isValidated,
          completed_at: lesson.completed_at,
          last_accessed_at: lesson.last_accessed_at
        };
      });

      const totalLessons = lessons.length;
      const completedLessons = lessons.filter(l => l.status === 'completed').length;
      const validatedCompletedLessons = lessons.filter(
        l => l.status === 'completed' && l.is_time_validated
      ).length;
      const totalTimeSpent = lessons.reduce((acc, l) => acc + l.time_spent_seconds, 0);

      coursesProgress.push({
        course_id: enrollment.course_id,
        course_title: enrollment.course_title,
        enrolled_at: enrollment.enrolled_at,
        completed_at: enrollment.completed_at,
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        validated_completed_lessons: validatedCompletedLessons,
        progress_percent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
        validated_progress_percent: totalLessons > 0 ? Math.round((validatedCompletedLessons / totalLessons) * 100) : 0,
        total_time_spent_seconds: totalTimeSpent,
        lessons
      });
    }

    // Get quiz attempts
    const quizAttempts = await query<QuizAttempt>(`
      SELECT
        qa.id as attempt_id,
        q.id as quiz_id,
        q.title as quiz_title,
        c.title as course_title,
        qa.started_at,
        qa.submitted_at,
        qa.status,
        qa.score,
        qa.passed,
        q.passing_score,
        qa.time_spent_seconds,
        (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as total_questions
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN courses c ON c.id = q.course_id
      WHERE qa.user_id = $1
      ORDER BY qa.started_at DESC
    `, [userId]);

    // Calculate summary stats
    const summary = {
      total_logins: loginHistory.length,
      total_session_time_seconds: loginHistory.reduce(
        (acc, l) => acc + (l.session_duration_seconds || 0),
        0
      ),
      courses_enrolled: coursesProgress.length,
      courses_completed: coursesProgress.filter(c => c.completed_at).length,
      courses_in_progress: coursesProgress.filter(c => !c.completed_at && c.completed_lessons > 0).length,
      overall_progress_percent: coursesProgress.length > 0
        ? Math.round(coursesProgress.reduce((acc, c) => acc + c.progress_percent, 0) / coursesProgress.length)
        : 0,
      validated_progress_percent: coursesProgress.length > 0
        ? Math.round(coursesProgress.reduce((acc, c) => acc + c.validated_progress_percent, 0) / coursesProgress.length)
        : 0,
      total_learning_time_seconds: coursesProgress.reduce((acc, c) => acc + c.total_time_spent_seconds, 0),
      quizzes_taken: quizAttempts.filter(q => q.status === 'completed').length,
      quizzes_passed: quizAttempts.filter(q => q.passed).length,
      average_quiz_score: quizAttempts.filter(q => q.score !== null).length > 0
        ? Math.round(
            quizAttempts
              .filter(q => q.score !== null)
              .reduce((acc, q) => acc + (q.score || 0), 0) /
            quizAttempts.filter(q => q.score !== null).length
          )
        : null
    };

    return NextResponse.json({
      user,
      loginHistory,
      coursesProgress,
      quizAttempts,
      summary
    });
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
