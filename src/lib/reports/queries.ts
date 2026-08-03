import { query, queryOne } from '@/lib/db';
import { excludeSystemAccountsSql } from '@/lib/system-accounts';
import type {
  ComplianceRow,
  CourseRow,
  CurvePoint,
  KpiRow,
  LearnerRow,
  TrendPoint,
} from './types';
import {
  ACTIVE_WINDOW_DAYS,
  MOMENTUM_WINDOW_DAYS,
  classifyLearner,
  daysSince,
  dropOffLesson,
  effortRatio,
  momentum,
  percent,
} from './metrics';

export type { ComplianceRow, CourseRow, CurvePoint, KpiRow, LearnerRow, TrendPoint };

/** DB projections: the API row minus the fields derived in TypeScript below. */
type LearnerRawRow = Omit<
  LearnerRow,
  'progress_percent' | 'quiz_pass_rate' | 'effort_ratio' | 'days_since_activity' | 'status' | 'momentum'
>;
type CourseRawRow = Omit<CourseRow, 'completion_rate' | 'quiz_pass_rate' | 'effort_ratio' | 'drop_off'>;

/**
 * Every SQL statement behind the Reports zone.
 *
 * Three conventions hold throughout:
 *
 * 1. `excludeSystemAccountsSql` is applied to EVERY query that touches users.
 *    The pre-existing reports route applied it to exactly one of its six
 *    queries, so the health-check monitor — which logs in every 15 minutes —
 *    inflated per-course enrolment counts and dominated the activity feed.
 *
 * 2. Completion is `status = 'completed' OR completed_at IS NOT NULL`. See
 *    migrations/009: rows exist where those two disagree, and the timestamp is
 *    the trustworthy one.
 *
 * 3. **The learner cohort is defined in exactly one place — `learnerScope()` —
 *    and every query uses it.** This convention is new (2026-08-03) and was
 *    added the hard way: three of these six queries filtered `is_active = true`
 *    and three did not, so the weekly HR e-mail counted active-only learners in
 *    its headline tile while naming ex-employees in the per-learner tables
 *    below it. The two numbers could not be reconciled by the person reading
 *    them. Do not hand-write a users predicate here; extend `learnerScope`.
 */

/** Reused everywhere a lesson counts as finished. */
const LESSON_DONE = `(lp.status = 'completed' OR lp.completed_at IS NOT NULL)`;

/**
 * Options shared by every fetcher in this file.
 *
 * `includeInactive` widens the cohort to people who have left the company.
 * It defaults to FALSE everywhere — reports are about the current workforce,
 * and an ex-employee's frozen progress is not a training gap anyone can act on.
 * The Reports zone exposes it as an explicit toggle so the data stays reachable.
 */
export interface ReportScope {
  includeInactive?: boolean;
}

/**
 * Read the cohort toggle off a request's query string.
 *
 * Anything other than an explicit opt-in means active-only. Parsing this in one
 * place keeps the five report routes from each inventing their own truthiness
 * rule, which is how one tab ends up disagreeing with the next.
 */
export function scopeFromParams(params: URLSearchParams): ReportScope {
  const raw = params.get('includeInactive');
  return { includeInactive: raw === '1' || raw === 'true' };
}

/**
 * The `users` predicate defining "a learner we report on".
 *
 * `users.is_active` is mirrored nightly from the Time-Off app, the company's
 * system of record for employment status — see
 * `src/app/api/cron/timeoff-sync/route.ts`. Before that sync existed the column
 * was never written and every account read as active forever.
 *
 * Returns a literal fragment rather than a bound parameter, for the same reason
 * `excludeSystemAccountsSql` does: the analytics query numbers its placeholders
 * by hand and adding a parameter is how a WHERE clause silently breaks.
 */
function learnerScope(scope: ReportScope | undefined, prefix = ''): string {
  const emailColumn = prefix ? `${prefix}.email` : 'email';
  const activeColumn = prefix ? `${prefix}.is_active` : 'is_active';

  const clauses = [excludeSystemAccountsSql(emailColumn)];
  if (!scope?.includeInactive) clauses.unshift(`${activeColumn} = true`);
  return clauses.join(' AND ');
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export async function fetchKpis(scope?: ReportScope): Promise<KpiRow> {
  const row = await queryOne<KpiRow>(`
    WITH learners AS (
      SELECT id FROM users
      WHERE ${learnerScope(scope)}
    ),
    activity AS (
      SELECT lp.user_id, MAX(lp.last_accessed_at) AS last_seen
      FROM lesson_progress lp
      JOIN learners u ON u.id = lp.user_id
      GROUP BY lp.user_id
    )
    SELECT
      (SELECT COUNT(*) FROM learners)::int AS total_learners,
      (SELECT COUNT(*) FROM activity WHERE last_seen > NOW() - INTERVAL '7 days')::int  AS active_learners_7d,
      (SELECT COUNT(*) FROM activity WHERE last_seen > NOW() - INTERVAL '${ACTIVE_WINDOW_DAYS} days')::int AS active_learners_30d,
      (SELECT COUNT(*) FROM learners l WHERE NOT EXISTS (
         SELECT 1 FROM lesson_progress lp WHERE lp.user_id = l.id))::int AS never_started,
      (SELECT COUNT(*) FROM enrollments e JOIN learners l ON l.id = e.user_id)::int AS total_enrollments,
      (SELECT COUNT(*) FROM enrollments e JOIN learners l ON l.id = e.user_id
        WHERE e.completed_at IS NOT NULL)::int AS completed_enrollments,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN learners l ON l.id = lp.user_id
        WHERE ${LESSON_DONE})::int AS lessons_completed,
      (SELECT COALESCE(SUM(lp.time_spent_seconds), 0) FROM lesson_progress lp
        JOIN learners l ON l.id = lp.user_id)::int AS measured_seconds,
      (SELECT COALESCE(SUM(les.duration_minutes * 60), 0)
         FROM lesson_progress lp
         JOIN learners l ON l.id = lp.user_id
         JOIN lessons les ON les.id = lp.lesson_id
        WHERE ${LESSON_DONE})::int AS credited_seconds,
      (SELECT COALESCE(SUM(qa.time_spent_seconds), 0) FROM quiz_attempts qa
        JOIN learners l ON l.id = qa.user_id WHERE qa.status = 'completed')::int AS quiz_seconds,
      (SELECT COUNT(*) FROM quiz_attempts qa JOIN learners l ON l.id = qa.user_id
        WHERE qa.status = 'completed')::int AS quizzes_taken,
      (SELECT COUNT(*) FROM quiz_attempts qa JOIN learners l ON l.id = qa.user_id
        WHERE qa.status = 'completed' AND qa.passed = true)::int AS quizzes_passed,
      (SELECT ROUND(AVG(qa.score), 1) FROM quiz_attempts qa JOIN learners l ON l.id = qa.user_id
        WHERE qa.status = 'completed')::float AS avg_quiz_score,
      -- percentile_cont gives the median without pulling every row into Node.
      (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (e.completed_at - e.enrolled_at)) / 86400
             )::numeric, 1)
         FROM enrollments e JOIN learners l ON l.id = e.user_id
        WHERE e.completed_at IS NOT NULL)::float AS median_days_to_complete
  `);

  return (
    row ?? {
      total_learners: 0, active_learners_7d: 0, active_learners_30d: 0, never_started: 0,
      total_enrollments: 0, completed_enrollments: 0, lessons_completed: 0,
      measured_seconds: 0, credited_seconds: 0, quiz_seconds: 0,
      quizzes_taken: 0, quizzes_passed: 0, avg_quiz_score: null, median_days_to_complete: null,
    }
  );
}

/**
 * Weekly activity for the last N weeks.
 *
 * generate_series produces the spine so quiet weeks appear as explicit zeros.
 * Grouping only over rows that exist would silently omit them, and a trend line
 * that skips its empty weeks reads as continuous activity.
 */
export async function fetchTrend(weeks = 12, scope?: ReportScope): Promise<TrendPoint[]> {
  return query<TrendPoint>(`
    WITH learners AS (
      SELECT id FROM users WHERE ${learnerScope(scope)}
    ),
    spine AS (
      SELECT generate_series(
        date_trunc('week', NOW()) - INTERVAL '1 week' * ($1::int - 1),
        date_trunc('week', NOW()),
        INTERVAL '1 week'
      ) AS week_start
    )
    SELECT
      to_char(s.week_start, 'YYYY-MM-DD') AS week_start,
      COALESCE((
        SELECT COUNT(*) FROM lesson_progress lp JOIN learners l ON l.id = lp.user_id
        WHERE lp.completed_at >= s.week_start AND lp.completed_at < s.week_start + INTERVAL '1 week'
      ), 0)::int AS lessons_completed,
      COALESCE((
        SELECT COUNT(*) FROM enrollments e JOIN learners l ON l.id = e.user_id
        WHERE e.completed_at >= s.week_start AND e.completed_at < s.week_start + INTERVAL '1 week'
      ), 0)::int AS courses_completed,
      COALESCE((
        SELECT COUNT(DISTINCT lp.user_id) FROM lesson_progress lp JOIN learners l ON l.id = lp.user_id
        WHERE lp.last_accessed_at >= s.week_start AND lp.last_accessed_at < s.week_start + INTERVAL '1 week'
      ), 0)::int AS active_learners
    FROM spine s
    ORDER BY s.week_start
  `, [weeks]);
}

// ---------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------

/**
 * One row per learner — the core of "courses completed by each user and the
 * time they used for".
 *
 * `lessons_total` counts lessons in the courses the user is ENROLLED in, so
 * progress is out of the work actually assigned to them. Dividing completed
 * lessons by their own lesson_progress rows (what api/admin/analytics does)
 * flatters everyone: it only ever counts lessons they already opened, so a
 * learner who opened three lessons and finished them reads as 100%.
 */
export async function fetchLearners(search?: string, scope?: ReportScope): Promise<LearnerRow[]> {
  const params: unknown[] = [MOMENTUM_WINDOW_DAYS];
  let searchClause = '';
  if (search) {
    params.push(`%${search}%`);
    searchClause = `AND (u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
  }

  const rows = await query<LearnerRawRow>(`
    WITH base AS (
      SELECT u.id, u.email, u.name, u.role, u.is_active, u.last_login_at
      FROM users u
      WHERE ${learnerScope(scope, 'u')}
      ${searchClause}
    ),
    enr AS (
      SELECT e.user_id,
             COUNT(*)::int AS enrolled,
             COUNT(*) FILTER (WHERE e.completed_at IS NOT NULL)::int AS completed,
             COUNT(*) FILTER (WHERE e.completed_at IS NULL)::int AS in_progress,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (e.completed_at - e.enrolled_at)) / 86400
             )::numeric, 1)::float AS median_days
      FROM enrollments e GROUP BY e.user_id
    ),
    -- Denominator: every lesson inside the courses this user is enrolled in.
    scope AS (
      SELECT e.user_id, COUNT(l.id)::int AS lessons_total
      FROM enrollments e JOIN lessons l ON l.course_id = e.course_id
      GROUP BY e.user_id
    ),
    prog AS (
      SELECT lp.user_id,
             MAX(lp.last_accessed_at) AS last_activity_at,
             COUNT(*) FILTER (WHERE ${LESSON_DONE})::int AS lessons_completed,
             COALESCE(SUM(lp.time_spent_seconds), 0)::int AS measured_seconds,
             COALESCE(SUM(CASE WHEN ${LESSON_DONE} THEN les.duration_minutes * 60 ELSE 0 END), 0)::int AS credited_seconds,
             COUNT(*) FILTER (WHERE lp.completed_at > NOW() - INTERVAL '1 day' * $1)::int AS completions_recent,
             COUNT(*) FILTER (WHERE lp.completed_at <= NOW() - INTERVAL '1 day' * $1
                                AND lp.completed_at > NOW() - INTERVAL '2 days' * $1)::int AS completions_previous
      FROM lesson_progress lp
      JOIN lessons les ON les.id = lp.lesson_id
      GROUP BY lp.user_id
    ),
    quiz AS (
      SELECT qa.user_id,
             COUNT(*)::int AS taken,
             COUNT(*) FILTER (WHERE qa.passed = true)::int AS passed,
             ROUND(AVG(qa.score), 1)::float AS avg_score,
             COALESCE(SUM(qa.time_spent_seconds), 0)::int AS quiz_seconds
      FROM quiz_attempts qa WHERE qa.status = 'completed' GROUP BY qa.user_id
    ),
    -- Assignments past their due date that this learner has not finished.
    overdue AS (
      SELECT b.id AS user_id, COUNT(*)::int AS overdue_mandatory
      FROM base b
      JOIN mandatory_assignments ma ON TRUE
      JOIN courses c ON c.id = ma.course_id AND c.is_published = true
      WHERE ma.due_date < NOW()
        AND (
          ma.assigned_to = 'all'
          OR (ma.assigned_to = 'domain' AND b.email LIKE '%' || ma.domain_filter)
          OR (ma.assigned_to = 'specific' AND b.id = ANY(ma.user_ids))
        )
        AND NOT EXISTS (
          SELECT 1 FROM enrollments e
          WHERE e.user_id = b.id AND e.course_id = c.id AND e.completed_at IS NOT NULL
        )
      GROUP BY b.id
    )
    SELECT
      b.id, b.email, b.name, b.role, b.is_active, b.last_login_at,
      p.last_activity_at,
      COALESCE(en.enrolled, 0)      AS courses_enrolled,
      COALESCE(en.completed, 0)     AS courses_completed,
      COALESCE(en.in_progress, 0)   AS courses_in_progress,
      COALESCE(sc.lessons_total, 0) AS lessons_total,
      COALESCE(p.lessons_completed, 0) AS lessons_completed,
      COALESCE(p.measured_seconds, 0)  AS measured_seconds,
      COALESCE(p.credited_seconds, 0)  AS credited_seconds,
      COALESCE(q.quiz_seconds, 0)      AS quiz_seconds,
      COALESCE(q.taken, 0)             AS quizzes_taken,
      COALESCE(q.passed, 0)            AS quizzes_passed,
      q.avg_score                      AS avg_quiz_score,
      en.median_days                   AS median_days_to_complete,
      COALESCE(p.completions_recent, 0)   AS completions_recent,
      COALESCE(p.completions_previous, 0) AS completions_previous,
      COALESCE(o.overdue_mandatory, 0)    AS overdue_mandatory
    FROM base b
    LEFT JOIN enr  en ON en.user_id = b.id
    LEFT JOIN scope sc ON sc.user_id = b.id
    LEFT JOIN prog p  ON p.user_id  = b.id
    LEFT JOIN quiz q  ON q.user_id  = b.id
    LEFT JOIN overdue o ON o.user_id = b.id
    ORDER BY COALESCE(p.lessons_completed, 0) DESC, b.email ASC
  `, params);

  // Derived fields live in metrics.ts so the CSV and the UI cannot diverge.
  return rows.map((r) => {
    const daysIdle = daysSince(r.last_activity_at);
    return {
      ...r,
      progress_percent: percent(r.lessons_completed, r.lessons_total),
      quiz_pass_rate: percent(r.quizzes_passed, r.quizzes_taken),
      effort_ratio: effortRatio(r.measured_seconds, r.credited_seconds),
      days_since_activity: daysIdle,
      momentum: momentum(r.completions_recent, r.completions_previous),
      status: classifyLearner({
        coursesEnrolled: r.courses_enrolled,
        coursesCompleted: r.courses_completed,
        lessonsCompleted: r.lessons_completed,
        daysSinceActivity: daysIdle,
        overdueMandatory: r.overdue_mandatory,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function fetchCourses(scope?: ReportScope): Promise<CourseRow[]> {
  const rows = await query<CourseRawRow>(`
    WITH learners AS (
      SELECT id FROM users WHERE ${learnerScope(scope)}
    )
    SELECT
      c.id, c.title, cat.name AS category_name, c.is_mandatory, c.is_published,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id)::int AS lesson_count,
      (SELECT COALESCE(SUM(l.duration_minutes), 0) FROM lessons l WHERE l.course_id = c.id)::int AS declared_minutes,
      (SELECT COUNT(*) FROM enrollments e JOIN learners u ON u.id = e.user_id
        WHERE e.course_id = c.id)::int AS enrollments,
      (SELECT COUNT(*) FROM enrollments e JOIN learners u ON u.id = e.user_id
        WHERE e.course_id = c.id AND e.completed_at IS NOT NULL)::int AS completions,
      (SELECT COUNT(DISTINCT lp.user_id) FROM lesson_progress lp JOIN learners u ON u.id = lp.user_id
        WHERE lp.course_id = c.id)::int AS learners_started,
      (SELECT COALESCE(SUM(lp.time_spent_seconds), 0) FROM lesson_progress lp JOIN learners u ON u.id = lp.user_id
        WHERE lp.course_id = c.id)::int AS measured_seconds,
      (SELECT COALESCE(SUM(l.duration_minutes * 60), 0)
         FROM lesson_progress lp JOIN learners u ON u.id = lp.user_id JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.course_id = c.id AND ${LESSON_DONE})::int AS credited_seconds,
      (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (e.completed_at - e.enrolled_at)) / 86400)::numeric, 1)
         FROM enrollments e JOIN learners u ON u.id = e.user_id
        WHERE e.course_id = c.id AND e.completed_at IS NOT NULL)::float AS median_days_to_complete,
      (SELECT COUNT(*) FROM quiz_attempts qa JOIN quizzes qz ON qz.id = qa.quiz_id
         JOIN learners u ON u.id = qa.user_id
        WHERE qz.course_id = c.id AND qa.status = 'completed')::int AS quizzes_taken,
      (SELECT COUNT(*) FROM quiz_attempts qa JOIN quizzes qz ON qz.id = qa.quiz_id
         JOIN learners u ON u.id = qa.user_id
        WHERE qz.course_id = c.id AND qa.status = 'completed' AND qa.passed = true)::int AS quizzes_passed,
      (SELECT ROUND(AVG(qa.score), 1) FROM quiz_attempts qa JOIN quizzes qz ON qz.id = qa.quiz_id
         JOIN learners u ON u.id = qa.user_id
        WHERE qz.course_id = c.id AND qa.status = 'completed')::float AS avg_quiz_score
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.is_published = true
    ORDER BY c.is_mandatory DESC, c.title ASC
  `);

  // Per-lesson completion curve, one query for all courses rather than N+1.
  const funnel = await query<{
    course_id: string; lesson_id: string; title: string; sort_order: number; completions: number;
  }>(`
    SELECT l.course_id, l.id AS lesson_id, l.title, l.sort_order,
           -- u.id IS NOT NULL is load-bearing: the users join is a LEFT JOIN
           -- with the cohort filter in its ON clause, so an excluded account's
           -- progress row survives with u.id NULL and would otherwise still be
           -- counted. This applies to inactive employees exactly as it does to
           -- system accounts.
           COUNT(*) FILTER (WHERE u.id IS NOT NULL AND ${LESSON_DONE})::int AS completions
    FROM lessons l
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
    LEFT JOIN users u ON u.id = lp.user_id AND ${learnerScope(scope, 'u')}
    GROUP BY l.course_id, l.id, l.title, l.sort_order
    ORDER BY l.course_id, l.sort_order
  `);

  const byCourse = new Map<string, typeof funnel>();
  for (const f of funnel) {
    const list = byCourse.get(f.course_id) ?? [];
    list.push(f);
    byCourse.set(f.course_id, list);
  }

  return rows.map((r) => ({
    ...r,
    completion_rate: percent(r.completions, r.enrollments),
    quiz_pass_rate: percent(r.quizzes_passed, r.quizzes_taken),
    effort_ratio: effortRatio(r.measured_seconds, r.credited_seconds),
    drop_off: dropOffLesson(byCourse.get(r.id) ?? []),
  }));
}

// ---------------------------------------------------------------------------
// Compliance (mandatory assignments)
// ---------------------------------------------------------------------------

/**
 * The report that would have caught the "Required Training won't clear" bug:
 * one row per (assigned learner x mandatory course), stating plainly whether
 * they are done.
 */
export async function fetchCompliance(scope?: ReportScope): Promise<ComplianceRow[]> {
  const rows = await query<Omit<ComplianceRow, 'progress_percent' | 'days_remaining' | 'state'>>(`
    WITH learners AS (
      SELECT id, email, name FROM users
      WHERE ${learnerScope(scope)}
    ),
    assigned AS (
      SELECT l.id AS user_id, l.email, l.name,
             c.id AS course_id, c.title AS course_title, ma.due_date
      FROM learners l
      JOIN mandatory_assignments ma ON TRUE
      JOIN courses c ON c.id = ma.course_id AND c.is_published = true
      WHERE ma.assigned_to = 'all'
         OR (ma.assigned_to = 'domain' AND l.email LIKE '%' || ma.domain_filter)
         OR (ma.assigned_to = 'specific' AND l.id = ANY(ma.user_ids))
    )
    SELECT
      a.user_id, a.email, a.name, a.course_id, a.course_title, a.due_date,
      (SELECT e.completed_at FROM enrollments e
        WHERE e.user_id = a.user_id AND e.course_id = a.course_id) AS completed_at,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = a.course_id)::int AS lessons_total,
      (SELECT COUNT(*) FROM lesson_progress lp
        WHERE lp.user_id = a.user_id AND lp.course_id = a.course_id AND ${LESSON_DONE})::int AS lessons_completed
    FROM assigned a
    ORDER BY a.due_date ASC, a.email ASC
  `);

  const now = new Date();
  return rows.map((r) => {
    const progress = percent(r.lessons_completed, r.lessons_total);
    const daysRemaining = r.due_date
      ? Math.ceil((new Date(r.due_date).getTime() - now.getTime()) / 86_400_000)
      : null;

    // A course with every lesson done counts as complete even when the
    // enrollment stamp is missing — the stamp could be skipped entirely before
    // the progress-route fix, and compliance must not depend on that bug.
    const done = !!r.completed_at || (r.lessons_total > 0 && r.lessons_completed >= r.lessons_total);

    let state: ComplianceRow['state'];
    if (done) state = 'completed';
    else if (daysRemaining !== null && daysRemaining < 0) state = 'overdue';
    else if (r.lessons_completed === 0) state = 'not_started';
    else if (daysRemaining !== null && daysRemaining <= 7) state = 'due_soon';
    else state = 'in_progress';

    return { ...r, progress_percent: progress, days_remaining: daysRemaining, state };
  });
}

// ---------------------------------------------------------------------------
// Learning curve
// ---------------------------------------------------------------------------

/**
 * Per-learner weekly completions, cumulative — the literal "learning curve".
 *
 * A flat run of weeks in the middle of a curve is a stall; a steep early rise
 * followed by nothing is the classic onboarding burst that never became a
 * habit. Neither is visible in any single-number progress percentage.
 */
export async function fetchLearningCurve(weeks = 12, scope?: ReportScope): Promise<CurvePoint[]> {
  return query<CurvePoint>(`
    WITH learners AS (
      SELECT id, email, name FROM users
      WHERE ${learnerScope(scope)}
    ),
    spine AS (
      SELECT generate_series(
        date_trunc('week', NOW()) - INTERVAL '1 week' * ($1::int - 1),
        date_trunc('week', NOW()),
        INTERVAL '1 week'
      ) AS week_start
    ),
    -- Only learners with at least one completion; a grid of all-zero rows for
    -- everyone else would bury the actual curves.
    active AS (
      SELECT DISTINCT lp.user_id FROM lesson_progress lp WHERE lp.completed_at IS NOT NULL
    ),
    grid AS (
      SELECT l.id AS user_id, l.email, l.name, s.week_start
      FROM learners l JOIN active a ON a.user_id = l.id CROSS JOIN spine s
    )
    SELECT
      g.user_id, g.email, g.name,
      to_char(g.week_start, 'YYYY-MM-DD') AS week_start,
      COALESCE((
        SELECT COUNT(*) FROM lesson_progress lp
        WHERE lp.user_id = g.user_id
          AND lp.completed_at >= g.week_start
          AND lp.completed_at < g.week_start + INTERVAL '1 week'
      ), 0)::int AS lessons_completed,
      COALESCE((
        SELECT COUNT(*) FROM lesson_progress lp
        WHERE lp.user_id = g.user_id
          AND lp.completed_at < g.week_start + INTERVAL '1 week'
      ), 0)::int AS cumulative
    FROM grid g
    ORDER BY g.email, g.week_start
  `, [weeks]);
}
