import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

interface RAGCandidate {
  id: string;
  question: string;
  answer: string;
  is_approved: boolean | null;
  created_at: string;
  user_email: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'pending';

    let whereClause = '';
    if (filter === 'pending') {
      whereClause = 'WHERE rqc.is_approved IS NULL';
    } else if (filter === 'approved') {
      whereClause = 'WHERE rqc.is_approved = true';
    } else if (filter === 'rejected') {
      whereClause = 'WHERE rqc.is_approved = false';
    }

    const candidates = await query<RAGCandidate>(`
      SELECT
        rqc.id,
        rqc.question,
        rqc.answer,
        rqc.is_approved,
        rqc.created_at,
        u.email as user_email
      FROM rag_qa_candidates rqc
      JOIN search_history sh ON sh.id = rqc.search_history_id
      JOIN users u ON u.id = sh.user_id
      ${whereClause}
      ORDER BY rqc.created_at DESC
      LIMIT 100
    `);

    return Response.json({ candidates });
  } catch (error) {
    console.error('Error fetching RAG candidates:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
