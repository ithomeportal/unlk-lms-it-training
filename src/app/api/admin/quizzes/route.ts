import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quizzes = await query(`
      SELECT
        q.*,
        c.title as course_title,
        c.slug as course_slug,
        (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count
      FROM quizzes q
      LEFT JOIN courses c ON c.id = q.course_id
      ORDER BY c.title, q.created_at DESC
    `);

    return NextResponse.json({ quizzes });
  } catch (error) {
    console.error('Get quizzes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { course_id, title, description, time_limit_minutes, passing_score } = await request.json();

    if (!course_id || !title) {
      return NextResponse.json({ error: 'Course and title are required' }, { status: 400 });
    }

    // Check if course exists
    const course = await queryOne('SELECT id, title FROM courses WHERE id = $1', [course_id]);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Check if quiz already exists for this course
    const existingQuiz = await queryOne('SELECT id FROM quizzes WHERE course_id = $1', [course_id]);
    if (existingQuiz) {
      return NextResponse.json({ error: 'A quiz already exists for this course' }, { status: 400 });
    }

    const result = await query(`
      INSERT INTO quizzes (course_id, title, description, time_limit_minutes, passing_score, is_active)
      VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *
    `, [course_id, title, description || null, time_limit_minutes || 45, passing_score || 70]);

    return NextResponse.json({ quiz: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Create quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
