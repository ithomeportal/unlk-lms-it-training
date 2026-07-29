/**
 * Metric DEFINITIONS for the Reports zone.
 *
 * Every number shown on /admin/reports and every column of its CSV export is
 * derived here or in ./queries.ts, and nowhere else. That rule exists because
 * this codebase already demonstrates the failure it prevents:
 * `overall_progress_percent` is computed two different ways in
 * api/admin/analytics/route.ts (lesson rows across the whole account) and
 * api/admin/analytics/[userId]/route.ts (mean of per-course percentages), so
 * the list page and the detail page disagree about the same user.
 *
 * Everything in this file is pure and unit-tested — see metrics.test.ts.
 */

/** Days of inactivity before a learner stops counting as active. */
export const ACTIVE_WINDOW_DAYS = 30;
/** Days of inactivity after which an unfinished learner is "stalled". */
export const STALLED_AFTER_DAYS = 14;
/** Days of inactivity after which they are "at risk". */
export const AT_RISK_AFTER_DAYS = 30;
/** Window used for the momentum comparison (this window vs the one before it). */
export const MOMENTUM_WINDOW_DAYS = 30;

export type LearnerStatus =
  | 'completed_all'
  | 'on_track'
  | 'stalled'
  | 'at_risk'
  | 'never_started';

export const LEARNER_STATUS_LABEL: Record<LearnerStatus, string> = {
  completed_all: 'All complete',
  on_track: 'On track',
  stalled: 'Stalled',
  at_risk: 'At risk',
  never_started: 'Never started',
};

/** Tailwind classes so every screen colours a status identically. */
export const LEARNER_STATUS_CLASS: Record<LearnerStatus, string> = {
  completed_all: 'border-green-500 text-green-400',
  on_track: 'border-blue-500 text-blue-400',
  stalled: 'border-amber-500 text-amber-400',
  at_risk: 'border-red-500 text-red-400',
  never_started: 'border-slate-600 text-slate-400',
};

export interface LearnerSignals {
  coursesEnrolled: number;
  coursesCompleted: number;
  lessonsCompleted: number;
  daysSinceActivity: number | null;
  overdueMandatory: number;
}

/**
 * Classify a learner. Order matters and encodes the editorial judgement:
 *
 * - An overdue mandatory course outranks everything except having finished
 *   everything. Someone active daily who is nonetheless past a compliance
 *   deadline is a problem, and "On track" would hide it.
 * - "Never started" is checked before the inactivity buckets, because calling
 *   a user who never logged in "at risk" implies they slipped — they never
 *   began, which is a different intervention.
 */
export function classifyLearner(s: LearnerSignals): LearnerStatus {
  if (s.coursesEnrolled > 0 && s.coursesCompleted >= s.coursesEnrolled && s.overdueMandatory === 0) {
    return 'completed_all';
  }
  if (s.overdueMandatory > 0) return 'at_risk';
  if (s.lessonsCompleted === 0 && s.coursesEnrolled === 0) return 'never_started';
  if (s.daysSinceActivity === null) return 'never_started';
  if (s.daysSinceActivity > AT_RISK_AFTER_DAYS) return 'at_risk';
  if (s.daysSinceActivity > STALLED_AFTER_DAYS) return 'stalled';
  return 'on_track';
}

export type Momentum = 'up' | 'flat' | 'down';

/**
 * Direction of travel: completions in the recent window vs the one before it.
 * A learner going from 0 to 0 is 'flat', not 'down' — no movement is not decline.
 */
export function momentum(recent: number, previous: number): Momentum {
  if (recent === previous) return 'flat';
  return recent > previous ? 'up' : 'down';
}

/** Median of a numeric list; null for an empty list. Used for days-to-complete. */
export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
}

/** Safe percentage, rounded. A zero denominator is 0%, never NaN or Infinity. */
export function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Observed effort against authored effort: measured seconds / declared seconds.
 *
 * Returns null when there is no measured time rather than 0, because 0 would
 * render as "took no time at all" when the truth is "we have not measured this
 * yet" — the exact conflation that made the pre-existing `is_time_validated`
 * flag mark every lesson in the product as un-validated.
 *
 * > 1 means learners take longer than the author budgeted (content may be dense
 * or unclear); well under 1 means they are clicking through.
 */
export function effortRatio(
  measuredSeconds: number,
  declaredSeconds: number
): number | null {
  if (!measuredSeconds || !declaredSeconds) return null;
  return Number((measuredSeconds / declaredSeconds).toFixed(2));
}

/**
 * Render a median pace.
 *
 * Sub-day values are shown as `<1d`, not `0d`. Learners here routinely enrol
 * and finish inside one sitting, so the honest median really is under a day —
 * but "0d" reads as a missing value or a bug rather than "same day".
 */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  if (days === 0) return '<1d';
  if (days < 1) return '<1d';
  return `${Number(days.toFixed(1))}d`;
}

/** Whole days between two instants; null if either is missing. */
export function daysBetween(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined
): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Whole days from an instant until now; null if missing. */
export function daysSince(when: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!when) return null;
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/**
 * Where a course loses people: the lesson with the largest fall in completions
 * relative to the lesson before it.
 *
 * Expects rows in sort_order. The first lesson can never be the drop-off point
 * (there is nothing before it to fall from) — a course nobody starts shows up
 * as low enrollment, not as a lesson-1 cliff.
 */
export function dropOffLesson(
  lessons: { lesson_id: string; title: string; sort_order: number; completions: number }[]
): { title: string; sort_order: number; lostLearners: number } | null {
  let worst: { title: string; sort_order: number; lostLearners: number } | null = null;
  for (let i = 1; i < lessons.length; i++) {
    const lost = lessons[i - 1].completions - lessons[i].completions;
    if (lost > 0 && (!worst || lost > worst.lostLearners)) {
      worst = { title: lessons[i].title, sort_order: lessons[i].sort_order, lostLearners: lost };
    }
  }
  return worst;
}

/**
 * Quiz improvement across attempts for one learner+quiz: last score minus
 * first. Null unless there are at least two scored attempts — a single attempt
 * says nothing about a learning curve.
 */
export function scoreImprovement(scoresInAttemptOrder: (number | null)[]): number | null {
  const scored = scoresInAttemptOrder.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (scored.length < 2) return null;
  return Math.round(scored[scored.length - 1] - scored[0]);
}
