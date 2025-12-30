import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const course = await queryOne(`
      SELECT c.*, cat.name as category_name
      FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE c.id = $1
    `, [id]);

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ course });
  } catch (error) {
    console.error('Get course error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { title, description, category_id, is_mandatory, is_published, thumbnail_url } = body;

    const result = await query(`
      UPDATE courses SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        category_id = COALESCE($4, category_id),
        is_mandatory = COALESCE($5, is_mandatory),
        is_published = COALESCE($6, is_published),
        thumbnail_url = COALESCE($7, thumbnail_url),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, title, description, category_id, is_mandatory, is_published, thumbnail_url]);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ course: result[0] });
  } catch (error) {
    console.error('Update course error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await execute('DELETE FROM courses WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete course error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
