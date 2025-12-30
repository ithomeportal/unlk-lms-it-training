import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SearchResult {
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  content_snippet: string;
  relevance_score: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query: searchQuery } = await request.json();

    if (!searchQuery || typeof searchQuery !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Get all lesson content for context
    const lessons = await query<{
      id: string;
      title: string;
      description: string | null;
      text_content: string | null;
      course_id: string;
      course_title: string;
      course_slug: string;
    }>(`
      SELECT
        l.id, l.title, l.description, l.text_content,
        c.id as course_id, c.title as course_title, c.slug as course_slug
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE c.is_published = true
    `);

    if (lessons.length === 0) {
      return NextResponse.json({ results: [], answer: 'No courses available to search.' });
    }

    // Build context from lessons
    const lessonsContext = lessons.map((l, i) => {
      const content = [l.description, l.text_content].filter(Boolean).join('\n');
      return `[${i + 1}] Course: "${l.course_title}" | Lesson: "${l.title}"\nContent: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
    }).join('\n\n---\n\n');

    // Use Claude to find relevant content and generate answer
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a helpful assistant for an IT training Learning Management System (LMS). Users search for information across training courses.

Here are the available training lessons:

${lessonsContext}

User's search query: "${searchQuery}"

Please:
1. Identify the most relevant lessons (by their numbers in brackets) that match the user's query
2. Provide a helpful, concise answer based on the available content
3. If the query cannot be answered from the available content, say so politely

Respond in JSON format:
{
  "relevant_lessons": [1, 3, 5],
  "answer": "Your helpful answer here..."
}

Only include lesson numbers that are actually relevant. If nothing is relevant, use an empty array.`
        }
      ]
    });

    // Parse Claude's response
    let relevantLessons: number[] = [];
    let answer = 'I could not find relevant information for your search.';

    try {
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        relevantLessons = parsed.relevant_lessons || [];
        answer = parsed.answer || answer;
      }
    } catch {
      // If parsing fails, still try to provide a response
      console.error('Failed to parse Claude response');
    }

    // Build results from relevant lessons
    const results: SearchResult[] = relevantLessons
      .filter(idx => idx > 0 && idx <= lessons.length)
      .map((idx, i) => {
        const lesson = lessons[idx - 1];
        const content = [lesson.description, lesson.text_content].filter(Boolean).join(' ');
        return {
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course_id,
          course_title: lesson.course_title,
          course_slug: lesson.course_slug,
          content_snippet: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          relevance_score: 1 - (i * 0.1), // Decreasing relevance
        };
      });

    return NextResponse.json({ results, answer });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
