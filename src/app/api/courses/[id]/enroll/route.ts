import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { checkPrerequisitesMet } from '@/lib/prerequisites';

/**
 * Enrol the current user in a course.
 *
 * This exists so that enrolment is a POST rather than a side effect of
 * rendering the course page. A write inside a GET render can fire on a
 * Next.js route prefetch — enrolling someone who only hovered a course card —
 * and violates the expectation that reads are safe to repeat.
 *
 * Idempotent: `enrollments` has UNIQUE(user_id, course_id), so re-posting is a
 * no-op. Any authenticated role may enrol; oversight roles (admin, auditor)
 * are NOT excluded, because they take training too.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const course = await queryOne<{ id: string; is_published: boolean }>(
      `SELECT id, is_published FROM courses WHERE id = $1`,
      [id]
    );

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    if (!course.is_published) {
      return NextResponse.json({ error: 'Course is not available' }, { status: 403 });
    }

    // Prerequisite gating used to be enforced only by the page render. Because
    // this endpoint is directly callable, it has to check for itself — quiz
    // access keys off enrolment, so enrolling past a locked prerequisite would
    // hand out the quiz too.
    const { allMet } = await checkPrerequisitesMet(user.id, course.id);
    if (!allMet) {
      return NextResponse.json(
        { error: 'Course prerequisites are not met' },
        { status: 403 }
      );
    }

    await execute(
      `INSERT INTO enrollments (user_id, course_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [user.id, course.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Enroll error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
