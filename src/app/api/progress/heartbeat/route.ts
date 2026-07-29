import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { clampHeartbeatDelta, lessonTimeCapSeconds } from '@/lib/learning-time';

/**
 * Accumulates real time-on-task into `lesson_progress.time_spent_seconds`.
 *
 * Called by course-viewer.tsx every 30s while a lesson is open AND the tab is
 * visible, plus once via sendBeacon on unload. Before this endpoint existed the
 * column was never written by anything, so every "time spent" figure on the
 * dashboard, the profile page, /admin/analytics and the CSV export was a
 * silent zero presented as a measurement.
 *
 * The browser is the only source of the delta and cannot be trusted with it, so
 * the server clamps twice: per-tick (60s max) and per-lesson lifetime
 * (4x declared length). See src/lib/learning-time.ts for the reasoning.
 *
 * Deliberately returns 204 with no body on success — this fires twice a minute
 * per active learner and nothing consumes the response.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { lessonId?: string; courseId?: string; deltaSeconds?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { lessonId, courseId } = body;
    if (!lessonId || !courseId) {
      return NextResponse.json(
        { success: false, error: 'lessonId and courseId are required' },
        { status: 400 }
      );
    }

    const delta = clampHeartbeatDelta(body.deltaSeconds);
    if (delta === 0) return new NextResponse(null, { status: 204 });

    // The lesson must genuinely belong to the course the caller claims, or a
    // forged pair could credit time against an unrelated course's report.
    const lesson = await queryOne<{ duration_minutes: number }>(
      `SELECT duration_minutes FROM lessons WHERE id = $1 AND course_id = $2`,
      [lessonId, courseId]
    );
    if (!lesson) {
      return NextResponse.json({ success: false, error: 'Lesson not found' }, { status: 404 });
    }

    const cap = lessonTimeCapSeconds(lesson.duration_minutes);

    // LEAST(existing + delta, cap) is applied in SQL rather than read-modify-write
    // so two tabs on the same lesson cannot race past the ceiling.
    //
    // status is NOT touched here. A heartbeat is evidence of attention, never of
    // completion, and writing 'in_progress' would re-introduce the regression
    // fixed in ../route.ts where revisiting a finished lesson un-completed it.
    await execute(
      `
      INSERT INTO lesson_progress (
        user_id, lesson_id, course_id, status, progress_percent,
        time_spent_seconds, started_at, last_accessed_at
      )
      VALUES ($1, $2, $3, 'in_progress', 0, LEAST($4::int, $5::int), NOW(), NOW())
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET
        time_spent_seconds = LEAST(COALESCE(lesson_progress.time_spent_seconds, 0) + $4::int, $5::int),
        started_at = COALESCE(lesson_progress.started_at, NOW()),
        last_accessed_at = NOW()
      `,
      [user.id, lessonId, courseId, delta, cap]
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
