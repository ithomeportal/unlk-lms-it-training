import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

interface SearchHistoryItem {
  id: string;
  query: string;
  ai_answer: string;
  result_count: number;
  searched_at: string;
}

// GET - Fetch user's search history
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const history = await query<SearchHistoryItem>(`
      SELECT id, query, ai_answer, result_count, searched_at
      FROM search_history
      WHERE user_id = $1
      ORDER BY searched_at DESC
      LIMIT $2 OFFSET $3
    `, [user.id, limit, offset]);

    // Get total count for pagination
    const countResult = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM search_history
      WHERE user_id = $1
    `, [user.id]);

    const total = parseInt(countResult[0]?.count || '0', 10);

    return NextResponse.json({
      history,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + history.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching search history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Clear all user's search history
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(`
      DELETE FROM search_history
      WHERE user_id = $1
    `, [user.id]);

    return NextResponse.json({ success: true, message: 'Search history cleared' });
  } catch (error) {
    console.error('Error clearing search history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
