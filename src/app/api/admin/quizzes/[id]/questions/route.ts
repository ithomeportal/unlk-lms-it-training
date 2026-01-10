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

    const questions = await query(`
      SELECT * FROM quiz_questions
      WHERE quiz_id = $1
      ORDER BY sort_order
    `, [id]);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Get questions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { question, question_type, options, correct_answer, points } = await request.json();

    // Verify quiz exists
    const quiz = await queryOne<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM quizzes WHERE id = $1', [id]
    );
    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    if (quiz.is_active) {
      return NextResponse.json({
        error: 'Cannot add questions to an active quiz. Deactivate first.'
      }, { status: 400 });
    }

    if (!question || !options || !correct_answer) {
      return NextResponse.json({
        error: 'Question, options, and correct_answer are required'
      }, { status: 400 });
    }

    // Get next sort_order
    const lastQuestion = await queryOne<{ max: number }>(
      'SELECT MAX(sort_order) as max FROM quiz_questions WHERE quiz_id = $1',
      [id]
    );
    const nextOrder = (lastQuestion?.max || 0) + 1;

    const result = await query(`
      INSERT INTO quiz_questions (quiz_id, question, question_type, options, correct_answer, points, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id,
      question,
      question_type || 'single',
      JSON.stringify(options),
      JSON.stringify(correct_answer),
      points || 5,
      nextOrder
    ]);

    return NextResponse.json({ question: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Create question error:', error);
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
    const { question_id, question, question_type, options, correct_answer, points, sort_order } = await request.json();

    if (!question_id) {
      return NextResponse.json({ error: 'question_id is required' }, { status: 400 });
    }

    // Verify question belongs to this quiz
    const existing = await queryOne(
      'SELECT * FROM quiz_questions WHERE id = $1 AND quiz_id = $2',
      [question_id, id]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const result = await query(`
      UPDATE quiz_questions
      SET question = COALESCE($1, question),
          question_type = COALESCE($2, question_type),
          options = COALESCE($3, options),
          correct_answer = COALESCE($4, correct_answer),
          points = COALESCE($5, points),
          sort_order = COALESCE($6, sort_order)
      WHERE id = $7
      RETURNING *
    `, [
      question,
      question_type,
      options ? JSON.stringify(options) : null,
      correct_answer ? JSON.stringify(correct_answer) : null,
      points,
      sort_order,
      question_id
    ]);

    return NextResponse.json({ question: result[0] });
  } catch (error) {
    console.error('Update question error:', error);
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
    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get('question_id');

    if (!questionId) {
      return NextResponse.json({ error: 'question_id is required' }, { status: 400 });
    }

    // Verify question belongs to this quiz
    const existing = await queryOne(
      'SELECT * FROM quiz_questions WHERE id = $1 AND quiz_id = $2',
      [questionId, id]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Check if quiz is active
    const quiz = await queryOne<{ is_active: boolean }>(
      'SELECT is_active FROM quizzes WHERE id = $1', [id]
    );
    if (quiz?.is_active) {
      return NextResponse.json({
        error: 'Cannot delete questions from an active quiz. Deactivate first.'
      }, { status: 400 });
    }

    await query('DELETE FROM quiz_questions WHERE id = $1', [questionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
