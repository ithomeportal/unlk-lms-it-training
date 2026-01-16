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

    // Search content_embeddings using full-text search
    const searchTerms = searchQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .join(' | ');

    // Get relevant content chunks from RAG knowledge base
    const chunks = await query<{
      lesson_id: string;
      content_chunk: string;
      chunk_type: string;
      rank: number;
    }>(`
      SELECT
        ce.lesson_id,
        ce.content_chunk,
        ce.chunk_type,
        ts_rank(ce.search_vector, to_tsquery('english', $1)) as rank
      FROM content_embeddings ce
      WHERE ce.search_vector @@ to_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT 20
    `, [searchTerms || searchQuery.split(/\s+/)[0]]);

    // If no full-text matches, fall back to ILIKE search
    let relevantChunks = chunks;
    if (chunks.length === 0) {
      relevantChunks = await query<{
        lesson_id: string;
        content_chunk: string;
        chunk_type: string;
        rank: number;
      }>(`
        SELECT
          ce.lesson_id,
          ce.content_chunk,
          ce.chunk_type,
          1.0 as rank
        FROM content_embeddings ce
        WHERE ce.content_chunk ILIKE $1
        LIMIT 20
      `, [`%${searchQuery}%`]);
    }

    if (relevantChunks.length === 0) {
      return NextResponse.json({
        results: [],
        answer: 'No matching content found for your search. Try different keywords.'
      });
    }

    // Get lesson and course info for matched chunks
    const lessonIds = [...new Set(relevantChunks.map(c => c.lesson_id))];
    const lessons = await query<{
      id: string;
      title: string;
      course_id: string;
      course_title: string;
      course_slug: string;
    }>(`
      SELECT l.id, l.title, c.id as course_id, c.title as course_title, c.slug as course_slug
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE l.id = ANY($1)
    `, [lessonIds]);

    const lessonMap = new Map(lessons.map(l => [l.id, l]));

    // Build context from matched chunks (more focused than all lessons)
    const chunksContext = relevantChunks
      .slice(0, 15) // Top 15 most relevant chunks
      .map((chunk, i) => {
        const lesson = lessonMap.get(chunk.lesson_id);
        return `[${i + 1}] ${chunk.content_chunk.substring(0, 1500)}`;
      })
      .join('\n\n---\n\n');

    // Use Claude to analyze matched content and generate answer
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a helpful assistant for a Qlik training Learning Management System (LMS). A user is searching for information.

Here are the most relevant content chunks from our training courses:

${chunksContext}

User's search query: "${searchQuery}"

Please:
1. Identify which content chunks (by their numbers in brackets) best answer the user's query
2. Provide a helpful, well-structured answer based on the matched content
3. Reference specific courses/lessons when relevant

IMPORTANT: Format the answer as clean HTML for a magazine-style presentation. Use these elements:
- <h3> for section headings (styled with class="text-purple-300 font-semibold mt-4 mb-2")
- <p> for paragraphs (with class="mb-3")
- <ul> and <li> for bullet lists (with class="list-disc list-inside mb-3 space-y-1")
- <code> for inline code or technical terms (with class="bg-slate-700 px-1.5 py-0.5 rounded text-purple-300 text-sm")
- <strong> for emphasis

Example format:
<h3 class="text-purple-300 font-semibold mt-4 mb-2">Section Title</h3>
<p class="mb-3">Explanation paragraph here.</p>
<ul class="list-disc list-inside mb-3 space-y-1">
  <li>Key point one</li>
  <li>Key point two</li>
</ul>

Respond in JSON format:
{
  "relevant_chunks": [1, 3, 5],
  "answer": "<h3 class=\\"...\\">Section</h3><p class=\\"...\\">Content...</p>"
}

Only include chunk numbers that are actually relevant. Keep the answer concise but well-organized.`
        }
      ]
    });

    // Parse Claude's response
    let relevantChunkNums: number[] = [];
    let answer = 'I found some related content but could not generate a specific answer.';

    try {
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        relevantChunkNums = parsed.relevant_chunks || [];
        answer = parsed.answer || answer;
      }
    } catch {
      console.error('Failed to parse Claude response');
    }

    // Build results from relevant chunks, deduped by lesson
    const seenLessons = new Set<string>();
    const results: SearchResult[] = [];

    for (const chunkNum of relevantChunkNums) {
      if (chunkNum > 0 && chunkNum <= relevantChunks.length) {
        const chunk = relevantChunks[chunkNum - 1];
        const lesson = lessonMap.get(chunk.lesson_id);

        if (lesson && !seenLessons.has(lesson.id)) {
          seenLessons.add(lesson.id);
          results.push({
            lesson_id: lesson.id,
            lesson_title: lesson.title,
            course_id: lesson.course_id,
            course_title: lesson.course_title,
            course_slug: lesson.course_slug,
            content_snippet: chunk.content_chunk.substring(0, 200) + '...',
            relevance_score: 1 - (results.length * 0.1),
          });
        }
      }
    }

    // If no specific chunks selected, use top chunks by lesson
    if (results.length === 0) {
      for (const chunk of relevantChunks.slice(0, 5)) {
        const lesson = lessonMap.get(chunk.lesson_id);
        if (lesson && !seenLessons.has(lesson.id)) {
          seenLessons.add(lesson.id);
          results.push({
            lesson_id: lesson.id,
            lesson_title: lesson.title,
            course_id: lesson.course_id,
            course_title: lesson.course_title,
            course_slug: lesson.course_slug,
            content_snippet: chunk.content_chunk.substring(0, 200) + '...',
            relevance_score: chunk.rank,
          });
        }
      }
    }

    // Auto-save search to history
    try {
      const historyResult = await query<{ id: string }>(`
        INSERT INTO search_history (user_id, query, ai_answer, result_count)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [user.id, searchQuery, answer, results.length]);

      // Also save to RAG Q&A candidates for potential knowledge base enhancement
      if (historyResult.length > 0 && answer && answer.length > 50) {
        await query(`
          INSERT INTO rag_qa_candidates (search_history_id, question, answer)
          VALUES ($1, $2, $3)
        `, [historyResult[0].id, searchQuery, answer]);
      }
    } catch (saveError) {
      // Don't fail the search if saving history fails
      console.error('Failed to save search history:', saveError);
    }

    return NextResponse.json({ results, answer });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
