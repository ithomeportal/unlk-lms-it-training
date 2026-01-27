import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import {
  getPrerequisitesForCourse,
  getDependentCourses,
  wouldCreateCircularDependency,
} from '@/lib/prerequisites';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify course exists
    const course = await queryOne<{ id: string }>(
      'SELECT id FROM courses WHERE id = $1',
      [id]
    );

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const prerequisites = await getPrerequisitesForCourse(id);
    const dependents = await getDependentCourses(id);

    return NextResponse.json({ prerequisites, dependents });
  } catch (error) {
    console.error('Get prerequisites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { prerequisite_course_id } = await request.json();

    if (!prerequisite_course_id) {
      return NextResponse.json(
        { error: 'prerequisite_course_id is required' },
        { status: 400 }
      );
    }

    // Verify both courses exist
    const course = await queryOne<{ id: string }>(
      'SELECT id FROM courses WHERE id = $1',
      [id]
    );
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const prereqCourse = await queryOne<{ id: string }>(
      'SELECT id FROM courses WHERE id = $1',
      [prerequisite_course_id]
    );
    if (!prereqCourse) {
      return NextResponse.json(
        { error: 'Prerequisite course not found' },
        { status: 404 }
      );
    }

    // Check for self-reference
    if (id === prerequisite_course_id) {
      return NextResponse.json(
        { error: 'A course cannot be a prerequisite of itself' },
        { status: 400 }
      );
    }

    // Check for circular dependency
    const wouldCreateCycle = await wouldCreateCircularDependency(id, prerequisite_course_id);
    if (wouldCreateCycle) {
      return NextResponse.json(
        { error: 'Adding this prerequisite would create a circular dependency' },
        { status: 400 }
      );
    }

    // Check if prerequisite already exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM course_prerequisites WHERE course_id = $1 AND prerequisite_course_id = $2',
      [id, prerequisite_course_id]
    );
    if (existing) {
      return NextResponse.json(
        { error: 'This prerequisite already exists' },
        { status: 400 }
      );
    }

    // Add the prerequisite
    const result = await query<{ id: string }>(
      `INSERT INTO course_prerequisites (course_id, prerequisite_course_id)
       VALUES ($1, $2)
       RETURNING id`,
      [id, prerequisite_course_id]
    );

    return NextResponse.json({
      success: true,
      prerequisite: { id: result[0].id, course_id: id, prerequisite_course_id },
    });
  } catch (error) {
    console.error('Add prerequisite error:', error);
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
    const { searchParams } = new URL(request.url);
    const prerequisiteId = searchParams.get('prerequisite_id');

    if (!prerequisiteId) {
      return NextResponse.json(
        { error: 'prerequisite_id query parameter is required' },
        { status: 400 }
      );
    }

    const deleted = await execute(
      'DELETE FROM course_prerequisites WHERE course_id = $1 AND prerequisite_course_id = $2',
      [id, prerequisiteId]
    );

    if (deleted === 0) {
      return NextResponse.json({ error: 'Prerequisite not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete prerequisite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
