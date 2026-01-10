import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const quiz = await queryOne(`
      SELECT
        q.*,
        c.title as course_title,
        c.slug as course_slug
      FROM quizzes q
      LEFT JOIN courses c ON c.id = q.course_id
      WHERE q.id = $1
    `, [id]);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    // Get questions
    const questions = await query(`
      SELECT * FROM quiz_questions
      WHERE quiz_id = $1
      ORDER BY sort_order
    `, [id]);

    // Get attempt stats
    const stats = await queryOne<{
      total_attempts: string;
      passed_count: string;
      average_score: string | null;
    }>(`
      SELECT
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN passed = true THEN 1 END) as passed_count,
        AVG(score) as average_score
      FROM quiz_attempts
      WHERE quiz_id = $1 AND status = 'completed'
    `, [id]);

    return NextResponse.json({
      quiz,
      questions,
      stats: {
        totalAttempts: Number(stats?.total_attempts || 0),
        passedCount: Number(stats?.passed_count || 0),
        averageScore: stats?.average_score ? parseFloat(stats.average_score).toFixed(1) : null
      }
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { title, description, time_limit_minutes, passing_score, is_active } = await request.json();

    const existing = await queryOne<{ id: string; is_active: boolean }>(
      'SELECT * FROM quizzes WHERE id = $1', [id]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    // If publishing, check that quiz has at least 1 question
    if (is_active && !existing.is_active) {
      const questionCount = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = $1',
        [id]
      );
      if (Number(questionCount?.count || 0) === 0) {
        return NextResponse.json({
          error: 'Cannot publish quiz without questions. Add questions first.'
        }, { status: 400 });
      }
    }

    const result = await query(`
      UPDATE quizzes
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          time_limit_minutes = COALESCE($3, time_limit_minutes),
          passing_score = COALESCE($4, passing_score),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [title, description, time_limit_minutes, passing_score, is_active, id]);

    return NextResponse.json({ quiz: result[0] });
  } catch (error) {
    console.error('Update quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await queryOne<{ id: string }>(
      'SELECT * FROM quizzes WHERE id = $1', [id]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    // Check for attempts
    const attemptCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM quiz_attempts WHERE quiz_id = $1',
      [id]
    );

    if (Number(attemptCount?.count || 0) > 0) {
      return NextResponse.json({
        error: `Cannot delete quiz with ${attemptCount?.count} attempt(s). Deactivate instead.`
      }, { status: 400 });
    }

    await query('DELETE FROM quizzes WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
