import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lessons = await query(`
      SELECT * FROM lessons
      WHERE course_id = $1
      ORDER BY sort_order, created_at
    `, [id]);

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Get lessons error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
