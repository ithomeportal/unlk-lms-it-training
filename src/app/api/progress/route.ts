import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';

/**
 * Records lesson status.
 *
 * Completion is MONOTONIC here: once a lesson is finished, nothing this
 * endpoint receives can un-finish it. It used to be possible — the UPDATE set
 * `status = $4` unconditionally while course-viewer.tsx sent 'in_progress' on
 * every navigation, so simply revisiting a finished lesson downgraded it. That
 * left real rows with `completed_at` populated, `progress_percent = 100` and
 * `status = 'in_progress'`, which under-reported completions everywhere and
 * kept the dashboard's "Required Training" banner up for users who had in fact
 * finished the course.
 *
 * Time spent is NOT written here — that is POST /api/progress/heartbeat.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId, courseId, status, progressPercent } = await request.json();

    if (!lessonId || !courseId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const nextStatus = status === 'completed' ? 'completed' : 'in_progress';

    // Upsert lesson progress.
    //
    // The CASE on status is the fix: an incoming 'in_progress' is ignored for a
    // row that is already complete — by status OR by having a completed_at, so
    // rows corrupted before this fix heal on their next touch.
    await execute(`
      INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, progress_percent, started_at, last_accessed_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        status = CASE
          WHEN $4 = 'completed' THEN 'completed'
          WHEN lesson_progress.status = 'completed' OR lesson_progress.completed_at IS NOT NULL THEN 'completed'
          ELSE $4
        END,
        progress_percent = GREATEST(lesson_progress.progress_percent, $5),
        started_at = COALESCE(lesson_progress.started_at, NOW()),
        last_accessed_at = NOW(),
        completed_at = CASE
          WHEN $4 = 'completed' THEN COALESCE(lesson_progress.completed_at, NOW())
          ELSE lesson_progress.completed_at
        END
    `, [
      user.id,
      lessonId,
      courseId,
      nextStatus,
      progressPercent || 0,
      nextStatus === 'completed' ? new Date().toISOString() : null
    ]);

    // Check if all lessons in the course are completed. Treats a populated
    // completed_at as complete for the same self-healing reason as above.
    const allCompleted = await queryOne<{ all_done: boolean }>(`
      SELECT NOT EXISTS (
        SELECT 1 FROM lessons l
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
        WHERE l.course_id = $2
          AND (lp.status IS NULL OR (lp.status != 'completed' AND lp.completed_at IS NULL))
      ) as all_done
    `, [user.id, courseId]);

    // Update enrollment if course is completed
    if (allCompleted?.all_done) {
      await execute(`
        UPDATE enrollments
        SET completed_at = NOW()
        WHERE user_id = $1 AND course_id = $2 AND completed_at IS NULL
      `, [user.id, courseId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Progress update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
