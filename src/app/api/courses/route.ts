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

export async function GET() {
  try {
    const courses = await query(`
      SELECT c.*, cat.name as category_name
      FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      ORDER BY c.created_at DESC
    `);
    return NextResponse.json({ courses });
  } catch (error) {
    console.error('Get courses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, description, category_id, is_mandatory, thumbnail_url } = await request.json();

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;

    // Ensure unique slug
    while (await queryOne('SELECT id FROM courses WHERE slug = $1', [slug])) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const result = await query(`
      INSERT INTO courses (title, slug, description, category_id, is_mandatory, thumbnail_url, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [title, slug, description || null, category_id || null, is_mandatory || false, thumbnail_url || null, user.id]);

    return NextResponse.json({ course: result[0] });
  } catch (error) {
    console.error('Create course error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
