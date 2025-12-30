import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      course_id,
      title,
      description,
      content_type,
      video_url,
      text_content,
      duration_minutes,
      sort_order
    } = await request.json();

    if (!course_id || !title) {
      return NextResponse.json({ error: 'Course ID and title are required' }, { status: 400 });
    }

    // Verify course exists
    const course = await queryOne('SELECT id FROM courses WHERE id = $1', [course_id]);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Get max sort order if not provided
    let order = sort_order;
    if (order === undefined) {
      const maxOrder = await queryOne<{ max: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) as max FROM lessons WHERE course_id = $1',
        [course_id]
      );
      order = (maxOrder?.max || 0) + 1;
    }

    const result = await query(`
      INSERT INTO lessons (course_id, title, description, content_type, video_url, text_content, duration_minutes, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [course_id, title, description || null, content_type || 'video', video_url || null, text_content || null, duration_minutes || 0, order]);

    // Update course duration
    await execute(`
      UPDATE courses SET
        duration_minutes = (SELECT COALESCE(SUM(duration_minutes), 0) FROM lessons WHERE course_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [course_id]);

    return NextResponse.json({ lesson: result[0] });
  } catch (error) {
    console.error('Create lesson error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      id,
      title,
      description,
      content_type,
      video_url,
      text_content,
      duration_minutes,
      sort_order
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lesson = await queryOne<{ course_id: string }>('SELECT course_id FROM lessons WHERE id = $1', [id]);
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const result = await query(`
      UPDATE lessons SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        content_type = COALESCE($4, content_type),
        video_url = COALESCE($5, video_url),
        text_content = COALESCE($6, text_content),
        duration_minutes = COALESCE($7, duration_minutes),
        sort_order = COALESCE($8, sort_order),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, title, description, content_type, video_url, text_content, duration_minutes, sort_order]);

    // Update course duration
    await execute(`
      UPDATE courses SET
        duration_minutes = (SELECT COALESCE(SUM(duration_minutes), 0) FROM lessons WHERE course_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [lesson.course_id]);

    return NextResponse.json({ lesson: result[0] });
  } catch (error) {
    console.error('Update lesson error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lesson = await queryOne<{ course_id: string }>('SELECT course_id FROM lessons WHERE id = $1', [id]);
    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    await execute('DELETE FROM lessons WHERE id = $1', [id]);

    // Update course duration
    await execute(`
      UPDATE courses SET
        duration_minutes = (SELECT COALESCE(SUM(duration_minutes), 0) FROM lessons WHERE course_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [lesson.course_id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete lesson error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
