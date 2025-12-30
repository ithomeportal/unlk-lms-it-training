import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';

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

    // Upsert lesson progress
    await execute(`
      INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, progress_percent, last_accessed_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        status = $4,
        progress_percent = GREATEST(lesson_progress.progress_percent, $5),
        last_accessed_at = NOW(),
        completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE lesson_progress.completed_at END
    `, [
      user.id,
      lessonId,
      courseId,
      status || 'in_progress',
      progressPercent || 0,
      status === 'completed' ? new Date().toISOString() : null
    ]);

    // Check if all lessons in course are completed
    const allCompleted = await queryOne<{ all_done: boolean }>(`
      SELECT NOT EXISTS (
        SELECT 1 FROM lessons l
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
        WHERE l.course_id = $2 AND (lp.status IS NULL OR lp.status != 'completed')
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
