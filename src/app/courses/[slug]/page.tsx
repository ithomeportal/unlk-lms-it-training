import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { Course, Lesson, LessonAttachment, LessonProgress } from '@/lib/types';
import { CourseViewer } from './course-viewer';

interface CourseWithDetails extends Course {
  category_name: string | null;
}

interface LessonWithDetails extends Lesson {
  attachments: LessonAttachment[];
  progress: LessonProgress | null;
}

async function getCourse(slug: string): Promise<CourseWithDetails | null> {
  return queryOne<CourseWithDetails>(`
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.slug = $1 AND c.is_published = true
  `, [slug]);
}

async function getLessons(courseId: string, userId: string): Promise<LessonWithDetails[]> {
  const lessons = await query<Lesson>(`
    SELECT * FROM lessons
    WHERE course_id = $1
    ORDER BY sort_order, created_at
  `, [courseId]);

  const lessonsWithDetails: LessonWithDetails[] = [];

  for (const lesson of lessons) {
    const attachments = await query<LessonAttachment>(`
      SELECT * FROM lesson_attachments
      WHERE lesson_id = $1
      ORDER BY sort_order
    `, [lesson.id]);

    const progress = await queryOne<LessonProgress>(`
      SELECT * FROM lesson_progress
      WHERE lesson_id = $1 AND user_id = $2
    `, [lesson.id, userId]);

    lessonsWithDetails.push({
      ...lesson,
      attachments,
      progress,
    });
  }

  return lessonsWithDetails;
}

async function ensureEnrollment(userId: string, courseId: string) {
  const enrollment = await queryOne<{ id: string }>(`
    SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2
  `, [userId, courseId]);

  if (!enrollment) {
    await execute(`
      INSERT INTO enrollments (user_id, course_id)
      VALUES ($1, $2)
    `, [userId, courseId]);
  }
}

export default async function CourseViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { slug } = await params;
  const { lesson: lessonParam } = await searchParams;

  const course = await getCourse(slug);
  if (!course) notFound();

  await ensureEnrollment(user.id, course.id);

  const lessons = await getLessons(course.id, user.id);

  // Determine current lesson
  let currentLessonIndex = 0;
  if (lessonParam) {
    const index = parseInt(lessonParam) - 1;
    if (index >= 0 && index < lessons.length) {
      currentLessonIndex = index;
    }
  } else {
    // Find first incomplete lesson or last accessed
    const firstIncomplete = lessons.findIndex(l => !l.progress || l.progress.status !== 'completed');
    if (firstIncomplete !== -1) {
      currentLessonIndex = firstIncomplete;
    }
  }

  return (
    <CourseViewer
      course={course}
      lessons={lessons}
      currentLessonIndex={currentLessonIndex}
      userId={user.id}
    />
  );
}
