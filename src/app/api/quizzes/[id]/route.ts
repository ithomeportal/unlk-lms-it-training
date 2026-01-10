import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

// Get quiz info for taking (without correct answers)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const quiz = await queryOne<{
      id: string;
      title: string;
      description: string | null;
      time_limit_minutes: number;
      passing_score: number;
      is_active: boolean;
      course_id: string;
      course_title: string;
      course_slug: string;
    }>(`
      SELECT
        q.id, q.title, q.description, q.time_limit_minutes, q.passing_score, q.is_active,
        c.id as course_id, c.title as course_title, c.slug as course_slug
      FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = $1
    `, [id]);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    if (!quiz.is_active) {
      return NextResponse.json({ error: 'Quiz is not available' }, { status: 403 });
    }

    // Check if user is enrolled in the course
    const enrollment = await queryOne<{ id: string }>(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [user.id, quiz.course_id]
    );

    if (!enrollment) {
      return NextResponse.json({ error: 'You must be enrolled in this course' }, { status: 403 });
    }

    // Get question count (not the questions themselves yet)
    const questionCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = $1',
      [id]
    );

    // Check for existing in-progress attempt
    const existingAttempt = await queryOne<{
      id: string;
      started_at: string;
      integrity_warnings: number;
    }>(`
      SELECT id, started_at, integrity_warnings
      FROM quiz_attempts
      WHERE quiz_id = $1 AND user_id = $2 AND status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1
    `, [id, user.id]);

    // Get user's best score
    const bestAttempt = await queryOne<{
      score: string;
      passed: boolean;
      submitted_at: string;
    }>(`
      SELECT score, passed, submitted_at
      FROM quiz_attempts
      WHERE quiz_id = $1 AND user_id = $2 AND status = 'completed'
      ORDER BY score DESC
      LIMIT 1
    `, [id, user.id]);

    return NextResponse.json({
      quiz: {
        ...quiz,
        questionCount: Number(questionCount?.count || 0)
      },
      existingAttempt: existingAttempt ? {
        id: existingAttempt.id,
        startedAt: existingAttempt.started_at,
        integrityWarnings: existingAttempt.integrity_warnings
      } : null,
      bestAttempt: bestAttempt ? {
        score: parseFloat(bestAttempt.score),
        passed: bestAttempt.passed,
        submittedAt: bestAttempt.submitted_at
      } : null
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Start a new quiz attempt
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
    const { action } = await request.json();

    if (action === 'start') {
      // Get quiz
      const quiz = await queryOne<{
        id: string;
        course_id: string;
        time_limit_minutes: number;
      }>(`
        SELECT q.*, c.id as course_id
        FROM quizzes q
        JOIN courses c ON c.id = q.course_id
        WHERE q.id = $1 AND q.is_active = true
      `, [id]);

      if (!quiz) {
        return NextResponse.json({ error: 'Quiz not available' }, { status: 404 });
      }

      // Check enrollment
      const enrollment = await queryOne<{ id: string }>(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [user.id, quiz.course_id]
      );

      if (!enrollment) {
        return NextResponse.json({ error: 'Not enrolled in course' }, { status: 403 });
      }

      // Check for existing in-progress attempt
      const existingAttempt = await queryOne<{ id: string }>(`
        SELECT id FROM quiz_attempts
        WHERE quiz_id = $1 AND user_id = $2 AND status = 'in_progress'
      `, [id, user.id]);

      if (existingAttempt) {
        return NextResponse.json({
          error: 'You already have an in-progress attempt',
          attemptId: existingAttempt.id
        }, { status: 400 });
      }

      // Create new attempt
      const attempt = await query(`
        INSERT INTO quiz_attempts (quiz_id, user_id, status)
        VALUES ($1, $2, 'in_progress')
        RETURNING *
      `, [id, user.id]);

      // Get questions (without correct answers)
      const questions = await query<{
        id: string;
        question: string;
        question_type: string;
        options: string | string[];
        points: number;
        sort_order: number;
      }>(`
        SELECT id, question, question_type, options, points, sort_order
        FROM quiz_questions
        WHERE quiz_id = $1
        ORDER BY sort_order
      `, [id]);

      return NextResponse.json({
        attempt: attempt[0],
        questions: questions.map(q => ({
          ...q,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        })),
        timeLimit: quiz.time_limit_minutes
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Start quiz error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Submit quiz or record integrity warning
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { action, attemptId, answers, integrityFlag } = await request.json();

    // Verify attempt belongs to user
    const attempt = await queryOne<{
      quiz_id: string;
      started_at: string;
      passing_score: number;
      time_limit_minutes: number;
      status: string;
      integrity_warnings: number;
      integrity_flags: Array<{ type: string; timestamp: string }> | null;
    }>(`
      SELECT qa.*, q.passing_score, q.time_limit_minutes
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.id = $1 AND qa.user_id = $2 AND qa.quiz_id = $3
    `, [attemptId, user.id, id]);

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    if (attempt.status === 'completed') {
      return NextResponse.json({ error: 'Quiz already submitted' }, { status: 400 });
    }

    // Handle integrity warning
    if (action === 'integrity_warning') {
      const flags = attempt.integrity_flags || [];
      flags.push({
        type: integrityFlag,
        timestamp: new Date().toISOString()
      });

      const newWarnings = attempt.integrity_warnings + 1;

      await query(`
        UPDATE quiz_attempts
        SET integrity_warnings = $1, integrity_flags = $2
        WHERE id = $3
      `, [newWarnings, JSON.stringify(flags), attemptId]);

      // Auto-submit on 2nd warning
      if (newWarnings >= 2) {
        return submitQuiz(attemptId, attempt, answers || {}, true);
      }

      return NextResponse.json({
        warnings: newWarnings,
        message: newWarnings === 1
          ? 'Warning: Leaving the quiz page is not allowed. One more violation will auto-submit your quiz.'
          : 'Quiz will be submitted due to integrity violation.'
      });
    }

    // Handle submit
    if (action === 'submit') {
      return submitQuiz(attemptId, attempt, answers, false);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Quiz action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function submitQuiz(
  attemptId: string,
  attempt: { quiz_id: string; started_at: string; passing_score: number },
  answers: Record<string, number[]>,
  autoSubmitted: boolean
) {
  // Get all questions with correct answers
  const questions = await query<{
    id: string;
    correct_answer: string | number[];
    points: number;
  }>(`
    SELECT id, correct_answer, points
    FROM quiz_questions
    WHERE quiz_id = $1
  `, [attempt.quiz_id]);

  let totalScore = 0;
  let totalPoints = 0;

  // Grade each answer
  for (const q of questions) {
    totalPoints += q.points;
    const userAnswer = answers[q.id] || [];
    const correctAnswer = typeof q.correct_answer === 'string'
      ? JSON.parse(q.correct_answer)
      : q.correct_answer;

    // Check if answer is correct (all correct options selected, no wrong ones)
    const isCorrect =
      userAnswer.length === correctAnswer.length &&
      userAnswer.every((a: number) => correctAnswer.includes(a)) &&
      correctAnswer.every((a: number) => userAnswer.includes(a));

    const pointsEarned = isCorrect ? q.points : 0;
    totalScore += pointsEarned;

    // Save answer
    await query(`
      INSERT INTO quiz_answers (attempt_id, question_id, selected_options, is_correct, points_earned)
      VALUES ($1, $2, $3, $4, $5)
    `, [attemptId, q.id, JSON.stringify(userAnswer), isCorrect, pointsEarned]);
  }

  // Calculate percentage score
  const percentageScore = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
  const passed = percentageScore >= attempt.passing_score;

  // Calculate time spent
  const startedAt = new Date(attempt.started_at);
  const timeSpentSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);

  // Update attempt
  await query(`
    UPDATE quiz_attempts
    SET status = 'completed',
        submitted_at = NOW(),
        score = $1,
        passed = $2,
        time_spent_seconds = $3
    WHERE id = $4
  `, [percentageScore, passed, timeSpentSeconds, attemptId]);

  return NextResponse.json({
    submitted: true,
    autoSubmitted,
    score: Math.round(percentageScore * 100) / 100,
    passed,
    passingScore: attempt.passing_score,
    timeSpentSeconds,
    totalQuestions: questions.length,
    correctAnswers: questions.filter(q => {
      const userAnswer = answers[q.id] || [];
      const correctAnswer = typeof q.correct_answer === 'string'
        ? JSON.parse(q.correct_answer)
        : q.correct_answer;
      return userAnswer.length === correctAnswer.length &&
        userAnswer.every((a: number) => correctAnswer.includes(a));
    }).length
  });
}
