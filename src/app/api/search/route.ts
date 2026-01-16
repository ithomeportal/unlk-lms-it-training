import { NextRequest } from 'next/server';
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { query: searchQuery, stream = true } = await request.json();

    if (!searchQuery || typeof searchQuery !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({
        results: [],
        answer: '<p class="mb-3">No matching content found for your search. Try different keywords.</p>'
      }), {
        headers: { 'Content-Type': 'application/json' }
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

    // Build initial results from top chunks
    const seenLessons = new Set<string>();
    const results: SearchResult[] = [];
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

    // Build context from matched chunks
    const chunksContext = relevantChunks
      .slice(0, 15)
      .map((chunk, i) => `[${i + 1}] ${chunk.content_chunk.substring(0, 1500)}`)
      .join('\n\n---\n\n');

    const systemPrompt = `You are a helpful assistant for an IT Training Learning Management System (LMS). A user is searching for information.

Here are the most relevant content chunks from our training courses:

${chunksContext}

User's search query: "${searchQuery}"

Provide a helpful, well-structured answer based on the matched content. Reference specific courses/lessons when relevant.

IMPORTANT: Format the answer as clean HTML. Use these elements:
- <h3 class="text-purple-300 font-semibold mt-4 mb-2"> for section headings
- <p class="mb-3"> for paragraphs
- <ul class="list-disc list-inside mb-3 space-y-1"> and <li> for bullet lists
- <code class="bg-slate-700 px-1.5 py-0.5 rounded text-purple-300 text-sm"> for technical terms
- <strong> for emphasis

Keep the answer concise but well-organized. Output ONLY the HTML content, no JSON wrapper.`;

    // If streaming is enabled, use streaming response
    if (stream) {
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          // Send results immediately
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'results', results })}\n\n`));

          try {
            // Stream the AI answer
            const streamResponse = anthropic.messages.stream({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1024,
              messages: [{ role: 'user', content: systemPrompt }]
            });

            let fullAnswer = '';

            for await (const event of streamResponse) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                const text = event.delta.text;
                fullAnswer += text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'answer_chunk', text })}\n\n`));
              }
            }

            // Send completion signal
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));

            // Save to history (don't await, do in background)
            saveSearchHistory(user.id, searchQuery, fullAnswer, results.length).catch(console.error);

          } catch (error) {
            console.error('Streaming error:', error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate answer' })}\n\n`));
          }

          controller.close();
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // Non-streaming fallback
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: systemPrompt }]
    });

    const answer = message.content[0].type === 'text' ? message.content[0].text : '';

    await saveSearchHistory(user.id, searchQuery, answer, results.length);

    return new Response(JSON.stringify({ results, answer }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function saveSearchHistory(userId: string, searchQuery: string, answer: string, resultCount: number) {
  try {
    const historyResult = await query<{ id: string }>(`
      INSERT INTO search_history (user_id, query, ai_answer, result_count)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [userId, searchQuery, answer, resultCount]);

    if (historyResult.length > 0 && answer && answer.length > 50) {
      await query(`
        INSERT INTO rag_qa_candidates (search_history_id, question, answer)
        VALUES ($1, $2, $3)
      `, [historyResult[0].id, searchQuery, answer]);
    }
  } catch (saveError) {
    console.error('Failed to save search history:', saveError);
  }
}
