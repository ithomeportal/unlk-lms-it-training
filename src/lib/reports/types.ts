import type { LearnerStatus, Momentum } from './metrics';

/**
 * Row shapes returned by the Reports API.
 *
 * These live apart from queries.ts on purpose: queries.ts imports `pg` through
 * @/lib/db, and the tab components are client components. Keeping the types in
 * a module with no runtime imports means a client file can name them without
 * any chance of dragging the database driver toward the browser bundle — the
 * failure mode scripts/check-server-bundle.mjs exists to catch, inverted.
 */

export interface KpiRow {
  total_learners: number;
  active_learners_7d: number;
  active_learners_30d: number;
  never_started: number;
  total_enrollments: number;
  completed_enrollments: number;
  lessons_completed: number;
  /** Real time-on-task from the heartbeat. Zero for anything before 2026-07-29. */
  measured_seconds: number;
  /** Authored duration of completed lessons. Covers all history. */
  credited_seconds: number;
  quiz_seconds: number;
  quizzes_taken: number;
  quizzes_passed: number;
  avg_quiz_score: number | null;
  median_days_to_complete: number | null;
}

export interface TrendPoint {
  week_start: string;
  lessons_completed: number;
  courses_completed: number;
  active_learners: number;
}

export interface LearnerRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  last_activity_at: string | null;
  courses_enrolled: number;
  courses_completed: number;
  courses_in_progress: number;
  lessons_total: number;
  lessons_completed: number;
  measured_seconds: number;
  credited_seconds: number;
  quiz_seconds: number;
  quizzes_taken: number;
  quizzes_passed: number;
  avg_quiz_score: number | null;
  median_days_to_complete: number | null;
  completions_recent: number;
  completions_previous: number;
  overdue_mandatory: number;
  progress_percent: number;
  quiz_pass_rate: number;
  effort_ratio: number | null;
  days_since_activity: number | null;
  status: LearnerStatus;
  momentum: Momentum;
}

export interface DropOff {
  title: string;
  sort_order: number;
  lostLearners: number;
}

export interface CourseRow {
  id: string;
  title: string;
  category_name: string | null;
  is_mandatory: boolean;
  lesson_count: number;
  declared_minutes: number;
  enrollments: number;
  completions: number;
  learners_started: number;
  measured_seconds: number;
  credited_seconds: number;
  median_days_to_complete: number | null;
  quizzes_taken: number;
  quizzes_passed: number;
  avg_quiz_score: number | null;
  completion_rate: number;
  quiz_pass_rate: number;
  effort_ratio: number | null;
  drop_off: DropOff | null;
}

export type ComplianceState =
  | 'completed'
  | 'overdue'
  | 'due_soon'
  | 'in_progress'
  | 'not_started';

export interface ComplianceRow {
  user_id: string;
  email: string;
  name: string | null;
  course_id: string;
  course_title: string;
  due_date: string;
  completed_at: string | null;
  lessons_total: number;
  lessons_completed: number;
  progress_percent: number;
  days_remaining: number | null;
  state: ComplianceState;
}

export interface ComplianceSummary {
  total: number;
  completed: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  not_started: number;
}

export interface CurvePoint {
  user_id: string;
  email: string;
  name: string | null;
  week_start: string;
  lessons_completed: number;
  cumulative: number;
}

export const COMPLIANCE_LABEL: Record<ComplianceState, string> = {
  completed: 'Completed',
  overdue: 'Overdue',
  due_soon: 'Due soon',
  in_progress: 'In progress',
  not_started: 'Not started',
};

export const COMPLIANCE_CLASS: Record<ComplianceState, string> = {
  completed: 'border-green-500 text-green-400',
  overdue: 'border-red-500 text-red-400',
  due_soon: 'border-amber-500 text-amber-400',
  in_progress: 'border-blue-500 text-blue-400',
  not_started: 'border-slate-600 text-slate-400',
};
