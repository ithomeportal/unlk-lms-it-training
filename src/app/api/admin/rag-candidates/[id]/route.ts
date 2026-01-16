import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await request.json();

    if (action !== 'approve' && action !== 'reject') {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    const isApproved = action === 'approve';

    // Update the candidate status
    const updated = await query<{ id: string; question: string; answer: string }>(`
      UPDATE rag_qa_candidates
      SET is_approved = $1
      WHERE id = $2
      RETURNING id, question, answer
    `, [isApproved, id]);

    if (updated.length === 0) {
      return Response.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // If approved, add to content_embeddings for RAG
    if (isApproved) {
      const candidate = updated[0];

      // Strip HTML from answer for cleaner embedding
      const cleanAnswer = candidate.answer
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Create a combined Q&A chunk for the knowledge base
      const qaContent = `Q: ${candidate.question}\n\nA: ${cleanAnswer}`;

      // Insert into content_embeddings as a FAQ type chunk
      await query(`
        INSERT INTO content_embeddings (lesson_id, content_chunk, chunk_type, search_vector)
        SELECT
          (SELECT id FROM lessons LIMIT 1),
          $1,
          'faq',
          to_tsvector('english', $1)
        WHERE NOT EXISTS (
          SELECT 1 FROM content_embeddings
          WHERE content_chunk = $1 AND chunk_type = 'faq'
        )
      `, [qaContent]);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating RAG candidate:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deleted = await query(`
      DELETE FROM rag_qa_candidates
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (deleted.length === 0) {
      return Response.json({ error: 'Candidate not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting RAG candidate:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
