import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { Course, Lesson, LessonAttachment, LessonProgress } from '@/lib/types';
import { CourseViewer } from './course-viewer';
import { LockedCourseView } from './locked-view';
import { checkPrerequisitesMet } from '@/lib/prerequisites';

interface CourseWithDetails extends Course {
  category_name: string | null;
}

interface LessonWithDetails extends Omit<Lesson, 'progress' | 'attachments'> {
  attachments: LessonAttachment[];
  progress: LessonProgress | null;
}

interface QuizInfo {
  id: string;
  title: string;
  question_count: number;
  time_limit_minutes: number;
  passing_score: number;
  best_score: number | null;
  passed: boolean;
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

async function getQuizInfo(courseId: string, userId: string): Promise<QuizInfo | null> {
  const quiz = await queryOne<{
    id: string;
    title: string;
    time_limit_minutes: number;
    passing_score: number;
  }>(`
    SELECT id, title, time_limit_minutes, passing_score
    FROM quizzes
    WHERE course_id = $1 AND is_active = true
  `, [courseId]);

  if (!quiz) return null;

  const questionCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM quiz_questions WHERE quiz_id = $1',
    [quiz.id]
  );

  const bestAttempt = await queryOne<{ score: string; passed: boolean }>(`
    SELECT score, passed
    FROM quiz_attempts
    WHERE quiz_id = $1 AND user_id = $2 AND status = 'completed'
    ORDER BY score DESC
    LIMIT 1
  `, [quiz.id, userId]);

  return {
    id: quiz.id,
    title: quiz.title,
    question_count: Number(questionCount?.count || 0),
    time_limit_minutes: quiz.time_limit_minutes,
    passing_score: quiz.passing_score,
    best_score: bestAttempt ? parseFloat(bestAttempt.score) : null,
    passed: bestAttempt?.passed || false,
  };
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
  if (!user.name) redirect('/complete-profile');

  const { slug } = await params;
  const { lesson: lessonParam } = await searchParams;

  const course = await getCourse(slug);
  if (!course) notFound();

  // Check if prerequisites are met
  const { allMet, prerequisites } = await checkPrerequisitesMet(user.id, course.id);

  if (!allMet) {
    return (
      <LockedCourseView
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          thumbnail_url: course.thumbnail_url,
          category_name: course.category_name,
        }}
        prerequisites={prerequisites}
      />
    );
  }

  await ensureEnrollment(user.id, course.id);

  const lessons = await getLessons(course.id, user.id);
  const quizInfo = await getQuizInfo(course.id, user.id);

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
      quizInfo={quizInfo}
    />
  );
}
