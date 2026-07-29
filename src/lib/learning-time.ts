/**
 * Time-on-task rules.
 *
 * Two different quantities get called "time" in this codebase and they must
 * never be conflated:
 *
 *   MEASURED time  — `lesson_progress.time_spent_seconds`, accumulated by
 *                    POST /api/progress/heartbeat while the lesson is open and
 *                    the tab is visible. Real, but only exists from the day the
 *                    heartbeat shipped.
 *   CREDITED time  — `lessons.duration_minutes` summed over completed lessons.
 *                    Available for all history, but it is what the *author*
 *                    declared, not what the learner did.
 *
 * Reports show both, labelled. See docs/SPEC-REPORTS.md.
 *
 * Everything here is pure so the clamping rules can be tested without a
 * database or a request.
 */

/** Longest delta a single heartbeat may contribute. */
export const MAX_HEARTBEAT_DELTA_SECONDS = 60;

/** Interval the client ticks at. The cap above is deliberately 2x this, so a
 *  tick delayed by a busy main thread still lands intact. */
export const HEARTBEAT_INTERVAL_SECONDS = 30;

/** Floor for the per-lesson lifetime cap, for lessons with no declared length. */
export const MIN_LESSON_TIME_CAP_SECONDS = 60 * 60;

/** How many times its declared length a lesson may accrue before we stop counting. */
const LESSON_TIME_CAP_MULTIPLIER = 4;

/**
 * Clamp a client-supplied delta.
 *
 * The heartbeat is an unauthenticated-by-nature measurement: the browser says
 * how much time passed and the server cannot verify it. Clamping is what keeps
 * a forged or replayed request from inflating someone's learning hours — the
 * worst a caller can do is claim the maximum on every tick, which is
 * indistinguishable from actually sitting on the page.
 *
 * Non-finite, negative and non-numeric input all collapse to 0 rather than
 * throwing: a bad heartbeat must never break lesson playback.
 */
export function clampHeartbeatDelta(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_HEARTBEAT_DELTA_SECONDS);
}

/**
 * Lifetime ceiling for one lesson's accumulated time.
 *
 * Without a ceiling a tab left open overnight reports eight hours of "study"
 * and poisons every average on the Reports zone. 4x the declared length is
 * generous enough for a genuinely slow reader and tight enough that an idle
 * tab cannot dominate a cohort. Lessons with no declared duration (text
 * lessons often have `duration_minutes = 0`) fall back to one hour.
 */
export function lessonTimeCapSeconds(durationMinutes: number | null | undefined): number {
  const declared = Number(durationMinutes);
  if (!Number.isFinite(declared) || declared <= 0) return MIN_LESSON_TIME_CAP_SECONDS;
  return Math.max(MIN_LESSON_TIME_CAP_SECONDS, Math.floor(declared * 60 * LESSON_TIME_CAP_MULTIPLIER));
}

/**
 * Expected engagement time for a lesson, used to flag suspiciously fast
 * completions. Mirrors the heuristic that already lived inline in
 * api/admin/analytics/[userId]/route.ts — moved here so the analytics detail
 * page and the new Reports zone cannot drift apart.
 *
 * Video: 80% of runtime (skipping the outro is normal, skipping the lesson is not).
 * Text: 150 words/minute, floored at 3 minutes so a two-line lesson is not
 * trivially "validated" by a page load.
 */
export function minRequiredSeconds(
  contentType: string | null | undefined,
  durationMinutes: number | null | undefined,
  textContent: string | null | undefined
): number {
  let seconds = 0;

  if (contentType === 'video' || contentType === 'mixed') {
    const declared = Number(durationMinutes);
    if (Number.isFinite(declared) && declared > 0) {
      seconds += Math.floor(declared * 60 * 0.8);
    }
  }

  if ((contentType === 'text' || contentType === 'mixed') && textContent) {
    const words = textContent.trim().split(/\s+/).filter(Boolean).length;
    seconds += Math.max(Math.ceil((words / 150) * 60), 180);
  }

  return seconds || 180;
}

/** `1h 05m` / `12m` / `45s`. Shared by every screen that prints a duration. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${hours}h`;
}

/** Hours to one decimal, for KPI tiles where `1h 05m` is too granular. */
export function formatHours(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${(s / 3600).toFixed(1)}h`;
}
