import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

// DELETE - Delete a single search history entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Delete only if it belongs to the current user
    const result = await query(`
      DELETE FROM search_history
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [id, user.id]);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting search history item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
