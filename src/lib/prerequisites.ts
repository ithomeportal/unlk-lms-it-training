import { query, queryOne } from './db';
import { PrerequisiteStatus } from './types';

interface CourseCompletionResult {
  lessons_completed: number;
  total_lessons: number;
  all_lessons_done: boolean;
  quiz_exists: boolean;
  quiz_passed: boolean;
  is_completed: boolean;
}

/**
 * Check if a user has completed a course (all lessons done + quiz passed if exists)
 */
export async function checkCourseCompletion(
  userId: string,
  courseId: string
): Promise<CourseCompletionResult> {
  // Get total lessons for the course
  const lessonCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM lessons WHERE course_id = $1',
    [courseId]
  );
  const totalLessons = parseInt(lessonCount?.count || '0');

  // Get completed lessons for the user
  const completedCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM lesson_progress
     WHERE user_id = $1 AND course_id = $2 AND status = 'completed'`,
    [userId, courseId]
  );
  const lessonsCompleted = parseInt(completedCount?.count || '0');

  const allLessonsDone = totalLessons > 0 && lessonsCompleted >= totalLessons;

  // Check if course has an active quiz
  const quiz = await queryOne<{ id: string; passing_score: number }>(
    'SELECT id, passing_score FROM quizzes WHERE course_id = $1 AND is_active = true',
    [courseId]
  );

  let quizPassed = false;
  const quizExists = !!quiz;

  if (quiz) {
    // Check if user has passed the quiz
    const passedAttempt = await queryOne<{ id: string }>(
      `SELECT id FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = $2 AND status = 'completed' AND passed = true
       LIMIT 1`,
      [quiz.id, userId]
    );
    quizPassed = !!passedAttempt;
  }

  // Course is completed if all lessons are done AND (no quiz exists OR quiz is passed)
  const isCompleted = allLessonsDone && (!quizExists || quizPassed);

  return {
    lessons_completed: lessonsCompleted,
    total_lessons: totalLessons,
    all_lessons_done: allLessonsDone,
    quiz_exists: quizExists,
    quiz_passed: quizPassed,
    is_completed: isCompleted,
  };
}

/**
 * Get all prerequisites for a course with their completion status for a user
 */
export async function checkPrerequisitesMet(
  userId: string,
  courseId: string
): Promise<{ allMet: boolean; prerequisites: PrerequisiteStatus[] }> {
  // Get all prerequisites for the course
  const prerequisites = await query<{
    prerequisite_course_id: string;
    title: string;
    slug: string;
  }>(
    `SELECT cp.prerequisite_course_id, c.title, c.slug
     FROM course_prerequisites cp
     JOIN courses c ON c.id = cp.prerequisite_course_id
     WHERE cp.course_id = $1
     ORDER BY c.title`,
    [courseId]
  );

  if (prerequisites.length === 0) {
    return { allMet: true, prerequisites: [] };
  }

  const statuses: PrerequisiteStatus[] = [];
  let allMet = true;

  for (const prereq of prerequisites) {
    const completion = await checkCourseCompletion(userId, prereq.prerequisite_course_id);

    const status: PrerequisiteStatus = {
      course_id: prereq.prerequisite_course_id,
      title: prereq.title,
      slug: prereq.slug,
      is_completed: completion.is_completed,
      lessons_completed: completion.lessons_completed,
      total_lessons: completion.total_lessons,
      quiz_passed: completion.quiz_passed,
      quiz_exists: completion.quiz_exists,
    };

    statuses.push(status);

    if (!completion.is_completed) {
      allMet = false;
    }
  }

  return { allMet, prerequisites: statuses };
}

/**
 * Get list of prerequisites for a course (without user-specific completion status)
 */
export async function getPrerequisitesForCourse(
  courseId: string
): Promise<{ id: string; course_id: string; title: string; slug: string }[]> {
  return query(
    `SELECT cp.id, cp.prerequisite_course_id as course_id, c.title, c.slug
     FROM course_prerequisites cp
     JOIN courses c ON c.id = cp.prerequisite_course_id
     WHERE cp.course_id = $1
     ORDER BY c.title`,
    [courseId]
  );
}

/**
 * Get courses that depend on this course as a prerequisite
 */
export async function getDependentCourses(
  courseId: string
): Promise<{ id: string; title: string; slug: string }[]> {
  return query(
    `SELECT c.id, c.title, c.slug
     FROM course_prerequisites cp
     JOIN courses c ON c.id = cp.course_id
     WHERE cp.prerequisite_course_id = $1
     ORDER BY c.title`,
    [courseId]
  );
}

/**
 * Check for circular dependencies when adding a prerequisite
 * Returns true if adding the prerequisite would create a cycle
 */
export async function wouldCreateCircularDependency(
  courseId: string,
  prerequisiteId: string,
  visited: Set<string> = new Set()
): Promise<boolean> {
  // If we're trying to make a course a prerequisite of itself
  if (courseId === prerequisiteId) {
    return true;
  }

  // If we've already visited this course in this path, there's a cycle
  if (visited.has(prerequisiteId)) {
    return true;
  }

  visited.add(prerequisiteId);

  // Get all courses that the prerequisite depends on
  const prereqsOfPrereq = await query<{ prerequisite_course_id: string }>(
    'SELECT prerequisite_course_id FROM course_prerequisites WHERE course_id = $1',
    [prerequisiteId]
  );

  for (const p of prereqsOfPrereq) {
    if (p.prerequisite_course_id === courseId) {
      return true; // Direct circular dependency
    }
    // Check recursively
    if (await wouldCreateCircularDependency(courseId, p.prerequisite_course_id, new Set(visited))) {
      return true;
    }
  }

  // Also check: if courseId already has prerequisites that include prerequisiteId's dependents
  const dependentsOfCourse = await query<{ course_id: string }>(
    'SELECT course_id FROM course_prerequisites WHERE prerequisite_course_id = $1',
    [courseId]
  );

  for (const d of dependentsOfCourse) {
    if (d.course_id === prerequisiteId) {
      return true;
    }
  }

  return false;
}
