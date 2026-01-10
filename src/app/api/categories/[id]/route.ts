import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const category = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Get category error:', error);
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
    const { name, description, icon, sort_order } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check if category exists
    const existing = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const slug = slugify(name);

    // Check for slug collision with other categories
    const slugExists = await queryOne(
      'SELECT id FROM categories WHERE slug = $1 AND id != $2',
      [slug, id]
    );
    if (slugExists) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
    }

    const result = await query(`
      UPDATE categories
      SET name = $1, slug = $2, description = $3, icon = $4, sort_order = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [name, slug, description || null, icon || null, sort_order || 0, id]);

    return NextResponse.json({ category: result[0] });
  } catch (error) {
    console.error('Update category error:', error);
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

    // Check if category exists
    const existing = await queryOne('SELECT * FROM categories WHERE id = $1', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check if category has courses
    const courseCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM courses WHERE category_id = $1',
      [id]
    );

    if (courseCount && Number(courseCount.count) > 0) {
      return NextResponse.json({
        error: `Cannot delete category with ${courseCount.count} course(s). Move or delete courses first.`
      }, { status: 400 });
    }

    await query('DELETE FROM categories WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
