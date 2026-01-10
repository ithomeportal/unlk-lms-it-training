import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    const { count = 20 } = await request.json();

    // Get quiz and course info
    const quiz = await queryOne<{
      id: string;
      course_id: string;
      course_title: string;
      is_active: boolean;
    }>(`
      SELECT q.*, c.id as course_id, c.title as course_title
      FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = $1
    `, [id]);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    if (quiz.is_active) {
      return NextResponse.json({
        error: 'Cannot generate questions for an active quiz. Deactivate first.'
      }, { status: 400 });
    }

    // Get content chunks for this course from RAG knowledge base
    const chunks = await query<{
      content_chunk: string;
      lesson_title: string;
    }>(`
      SELECT ce.content_chunk, l.title as lesson_title
      FROM content_embeddings ce
      JOIN lessons l ON l.id = ce.lesson_id
      WHERE l.course_id = $1
      ORDER BY l.sort_order, ce.chunk_index
    `, [quiz.course_id]);

    if (chunks.length === 0) {
      return NextResponse.json({
        error: 'No content found for this course. Ensure lessons have content.'
      }, { status: 400 });
    }

    // Build context from chunks (limit to prevent token overflow)
    const contentContext = chunks
      .slice(0, 30)
      .map((c, i) => `[${c.lesson_title}]\n${c.content_chunk}`)
      .join('\n\n---\n\n');

    // Generate questions using Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are creating a quiz for an IT training course. Generate ${count} multiple-choice questions based on the course content below.

Course: "${quiz.course_title}"

Course Content:
${contentContext}

Requirements:
1. Create exactly ${count} questions
2. Each question should have 4 options (A, B, C, D)
3. Mix of single-answer and multiple-answer questions (about 70% single, 30% multiple)
4. Questions should test understanding, not just recall
5. Cover different topics from the course content
6. Make wrong answers plausible but clearly incorrect

Respond with a JSON array of questions in this exact format:
[
  {
    "question": "What is the primary purpose of...",
    "question_type": "single",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correct_answer": [0],
    "explanation": "Brief explanation of why this is correct"
  },
  {
    "question": "Which of the following are valid methods for...",
    "question_type": "multiple",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": [0, 2],
    "explanation": "A and C are correct because..."
  }
]

Notes:
- "single" means only one correct answer
- "multiple" means 2 or more correct answers
- correct_answer is an array of indices (0-3) for the correct options
- Ensure questions are clear and unambiguous

Respond ONLY with the JSON array, no other text.`
        }
      ]
    });

    // Parse Claude's response
    let questions: Array<{
      question: string;
      question_type: string;
      options: string[];
      correct_answer: number[];
      explanation?: string;
    }> = [];

    try {
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse questions:', parseError);
      return NextResponse.json({
        error: 'Failed to parse generated questions. Please try again.'
      }, { status: 500 });
    }

    if (questions.length === 0) {
      return NextResponse.json({
        error: 'No questions were generated. Please try again.'
      }, { status: 500 });
    }

    // Clear existing questions for this quiz
    await query('DELETE FROM quiz_questions WHERE quiz_id = $1', [id]);

    // Insert generated questions
    const pointsPerQuestion = Math.round(100 / questions.length * 100) / 100;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await query(`
        INSERT INTO quiz_questions (quiz_id, question, question_type, options, correct_answer, points, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        id,
        q.question,
        q.question_type || 'single',
        JSON.stringify(q.options),
        JSON.stringify(q.correct_answer),
        pointsPerQuestion,
        i + 1
      ]);
    }

    // Update quiz updated_at
    await query('UPDATE quizzes SET updated_at = NOW() WHERE id = $1', [id]);

    return NextResponse.json({
      success: true,
      questionsGenerated: questions.length,
      message: `Successfully generated ${questions.length} questions for "${quiz.course_title}"`
    });
  } catch (error) {
    console.error('Generate questions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
