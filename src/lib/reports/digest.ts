import { formatDuration, formatHours } from '@/lib/learning-time';
import {
  LEARNER_STATUS_LABEL,
  formatDays,
  percent,
  type LearnerStatus,
} from './metrics';
import { COMPLIANCE_LABEL } from './types';
import type {
  ComplianceRow,
  ComplianceSummary,
  CourseRow,
  KpiRow,
  LearnerRow,
  TrendPoint,
} from './types';

/**
 * The weekly executive-summary email.
 *
 * Built here — inside the app — rather than in the n8n workflow that sends it,
 * so every number comes from the same `queries.ts` functions that render
 * /admin/reports. A Code node with its own SQL would fork the metric
 * definitions (credited vs measured time, the LESSON_DONE OR-condition, system
 * account exclusion) and the email would eventually contradict the screen with
 * nothing to explain why.
 *
 * Constraints this HTML is written against, all of them learned from email
 * clients rather than browsers:
 *
 * - **No remote images.** Outlook blocks them by default, so a chart rendered as
 *   a PNG URL is an empty box for most recipients on first open. Every bar here
 *   is a table cell with a background colour, which cannot fail to render.
 * - **No `<style>` block, no classes.** Outlook's rendering engine drops or
 *   mangles them. Every rule is an inline `style` attribute.
 * - **Tables for layout.** Flexbox and grid are not available.
 * - **Light theme.** The app is dark, but a dark email reads as broken in a
 *   client that forces a white background, and inverts badly in Outlook.
 *
 * Everything in this module is pure — see digest.test.ts.
 */

export interface DigestInput {
  kpis: KpiRow;
  trend: TrendPoint[];
  learners: LearnerRow[];
  courses: CourseRow[];
  compliance: { rows: ComplianceRow[]; summary: ComplianceSummary };
  /** Injected so the reporting window is deterministic in tests. */
  now?: Date;
  /** Link back to the live zone, for anyone who wants to drill in. */
  appUrl?: string;
  /**
   * When employment status was last mirrored from the Time-Off app, or null if
   * it never has been.
   *
   * Printed in the footer because this report once named two people who had
   * left the company months earlier and nobody could tell from the email that
   * anything was stale. A roster date the reader can sanity-check is the only
   * thing that distinguishes "quiet week" from "the sync died in March".
   */
  rosterSyncedAt?: Date | null;
}

export interface Digest {
  subject: string;
  html: string;
  /** Machine-readable summary, logged by the route and useful in n8n. */
  meta: {
    weekStart: string | null;
    weekEnd: string | null;
    learners: number;
    activeLastWeek: number;
    lessonsLastWeek: number;
    coursesAvailable: number;
    overdueMandatory: number;
  };
}

// --- palette -----------------------------------------------------------------
// One place, so the email reads as a single designed object rather than a pile
// of ad-hoc hex codes.
const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
const FAINT = '#94a3b8';
const LINE = '#e2e8f0';
const CANVAS = '#f1f5f9';
const BRAND = '#1e3a5f';
const BLUE = '#2563eb';
const GREEN = '#15803d';
const AMBER = '#b45309';
const RED = '#b91c1c';
const SLATE = '#cbd5e1';

/**
 * Short on purpose.
 *
 * Outlook does not reliably inherit `font-family` into a table cell, so the
 * stack has to be repeated on every one of the ~300 cells in this email. A
 * modern `-apple-system, BlinkMacSystemFont, 'Segoe UI', …` stack costs ~60
 * characters each time, which added ~18 KB of pure font-family declarations and
 * pushed the message to 120 KB — past Gmail's 102 KB clipping threshold, at
 * which point it truncates the body and hides the course catalog behind a
 * "[Message clipped]" link. Arial is what Outlook renders anyway, and `Arial,sans-serif` covers every client that lacks it.
 */
const FONT = 'Arial,sans-serif';

/** Used only in the header band and section headings, where the repetition cost is a handful of instances. */
const DISPLAY_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const STATUS_ORDER: LearnerStatus[] = [
  'completed_all',
  'on_track',
  'stalled',
  'at_risk',
  'never_started',
];

const STATUS_COLOR: Record<LearnerStatus, string> = {
  completed_all: GREEN,
  on_track: BLUE,
  stalled: AMBER,
  at_risk: RED,
  never_started: SLATE,
};

// --- primitives --------------------------------------------------------------

/**
 * HTML-escape. Applied to EVERY interpolated value without exception.
 *
 * Learner names and course titles are user-editable, so an apostrophe or an
 * ampersand in a name is enough to corrupt the markup — and a `<` would let
 * content authored in the admin panel inject markup into an email sent to HR.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Integers for display. A non-finite value renders as an em dash rather than
 * `NaN` or `Infinity`: a report that prints NaN to the head of HR destroys
 * confidence in every other number on the page.
 */
function num(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** `21 Jul 2026`. Parsed as a plain date so a bare `YYYY-MM-DD` is not shifted a day by UTC. */
function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `21 Jul` — for axis labels, where the year is redundant. */
function fmtShort(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Monday 00:00 of the week containing `d`, in the caller's clock. */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Sunday belongs to the week that began six days ago.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  return out;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Split the trend into completed weeks and the week in progress.
 *
 * `fetchTrend` includes the CURRENT week, which on a Monday morning is a few
 * hours old and therefore almost always zero. Reporting that as "last week"
 * would tell HR that nothing happened, every single Monday. The completed week
 * is the one before it.
 */
function splitTrend(trend: TrendPoint[], now: Date) {
  const thisWeek = iso(mondayOf(now));
  const complete = trend.filter((t) => t.week_start < thisWeek);
  return {
    complete,
    latest: complete.length ? complete[complete.length - 1] : null,
    // Unused since the narrative sentence was dropped, but the trend table
    // still needs `complete` split the same way and the week-over-week
    // comparison is the obvious next thing anyone will want.
    previous: complete.length > 1 ? complete[complete.length - 2] : null,
  };
}

/**
 * A horizontal bar.
 *
 * Horizontal rather than vertical columns: a column chart needs per-cell heights
 * that Outlook ignores, so a 12-week column chart collapses to a flat row there.
 *
 * Two cells in one fixed-width table — filled, then remainder — with the track
 * colour supplied by the table's own background so a 0% bar still occupies its
 * column and the table cannot reflow row to row. Kept to a single table because
 * this renders ~50 times per email and a nested-table version cost ~450
 * characters each.
 */
function bar(pct: number, color: string, width = 160): string {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const cell = 'height:8px;line-height:8px;font-size:0;';
  const open = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="width:${width}px;border-collapse:collapse;background:${LINE};border-radius:3px;"><tr>`;
  const fill = `${cell}background:${color};border-radius:3px;`;

  // A 0% bar emits NO fill cell, and every non-zero bar states BOTH widths.
  //
  // `width="0%"` is not honoured: the browser treats it as "unconstrained",
  // then finds two content-less cells and splits the track evenly between
  // them — so every quiet week rendered as a half-full bar, which is worse
  // than no chart at all. It passed tsc, lint and every assertion here; only
  // a screenshot showed it.
  if (clamped === 0) {
    return `${open}<td style="${cell}">&nbsp;</td></tr></table>`;
  }
  if (clamped === 100) {
    return `${open}<td style="${fill}">&nbsp;</td></tr></table>`;
  }
  return `${open}<td width="${clamped}%" style="${fill}">&nbsp;</td><td width="${100 - clamped}%" style="${cell}">&nbsp;</td></tr></table>`;
}

/** Section heading — a small caps-ish label with a rule under it. */
function heading(text: string): string {
  return `<tr><td style="padding:26px 32px 10px;">
  <p style="margin:0;font:600 11px/1.4 ${DISPLAY_FONT};letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">${esc(text)}</p>
  <div style="height:1px;background:${LINE};margin-top:8px;"></div>
</td></tr>`;
}

/** One KPI cell. `tone` colours only the value, never the label. */
function kpi(label: string, value: string, hint: string, tone = INK): string {
  return `<td width="25%" valign="top" style="padding:0 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${CANVAS};border-radius:6px;">
    <tr><td style="padding:14px 14px 12px;">
      <p style="margin:0;font:400 10px/1.3 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">${esc(label)}</p>
      <p style="margin:6px 0 0;font:700 26px/1.1 ${FONT};color:${tone};">${value}</p>
      <p style="margin:5px 0 0;font:400 11px/1.4 ${FONT};color:${FAINT};">${esc(hint)}</p>
    </td></tr>
  </table>
</td>`;
}

/** Table header cell. */
function th(text: string, align: 'left' | 'right' | 'center' = 'left'): string {
  return `<th align="${align}" style="padding:7px 8px;font:600 10px/1.3 ${FONT};letter-spacing:.05em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};">${esc(text)}</th>`;
}

/** Body cell. */
function td(
  content: string,
  align: 'left' | 'right' | 'center' = 'left',
  color = BODY,
  weight = 400
): string {
  return `<td align="${align}" style="padding:8px;font:${weight} 12px/1.45 ${FONT};color:${color};border-bottom:1px solid ${LINE};">${content}</td>`;
}

// --- sections ----------------------------------------------------------------

function headerBand(weekStart: string | null, weekEnd: string | null): string {
  const range =
    weekStart && weekEnd ? `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}` : 'All activity to date';
  return `<tr><td style="padding:28px 32px;background:${BRAND};">
  <p style="margin:0;font:700 13px/1.2 ${DISPLAY_FONT};letter-spacing:.18em;color:#ffffff;">UNILINK</p>
  <p style="margin:10px 0 0;font:700 22px/1.25 ${DISPLAY_FONT};color:#ffffff;">IT Training — Weekly Executive Summary</p>
  <p style="margin:6px 0 0;font:400 13px/1.4 ${DISPLAY_FONT};color:#b9cbe0;">Reporting week ${esc(range)}</p>
</td></tr>`;
}

function kpiGrid(kpis: KpiRow, learners: LearnerRow[]): string {
  const completion = percent(kpis.completed_enrollments, kpis.total_enrollments);
  const quizPass = percent(kpis.quizzes_passed, kpis.quizzes_taken);
  // Counted off `learners`, while the "Learners" tile beside it comes from
  // `kpis.total_learners`. Those two MUST describe the same cohort or the tiles
  // contradict each other — they did until 2026-08-03, when fetchKpis filtered
  // to active employees and fetchLearners did not, so "At risk" included people
  // who no longer worked here and could exceed the total it was a subset of.
  // Both now share `learnerScope()` in queries.ts. Asserted in digest.test.ts.
  const atRisk = learners.filter((l) => l.status === 'at_risk').length;

  return `<tr><td style="padding:6px 24px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
    <tr>
      ${kpi('Learners', num(kpis.total_learners), `${num(kpis.never_started)} never started`)}
      ${kpi('Active · 30 days', num(kpis.active_learners_30d), `${num(kpis.active_learners_7d)} in the last 7`, BLUE)}
      ${kpi('At risk', num(atRisk), 'Inactive 30d+ or overdue', atRisk > 0 ? RED : GREEN)}
      ${kpi('Completion rate', `${completion}%`, `${num(kpis.completed_enrollments)} of ${num(kpis.total_enrollments)} enrolments`, completion >= 70 ? GREEN : completion >= 40 ? AMBER : RED)}
    </tr>
    <tr><td colspan="4" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
    <tr>
      ${kpi('Lessons completed', num(kpis.lessons_completed), 'All time')}
      ${kpi('Credited time', formatHours(kpis.credited_seconds), 'Authored duration, completed lessons')}
      ${kpi('Quiz pass rate', `${quizPass}%`, `${num(kpis.quizzes_passed)} of ${num(kpis.quizzes_taken)} attempts`, quizPass >= 70 ? GREEN : quizPass >= 50 ? AMBER : RED)}
      ${kpi('Median pace', formatDays(kpis.median_days_to_complete), 'Enrolment to completion')}
    </tr>
  </table>
</td></tr>`;
}

function trendTable(weeks: TrendPoint[]): string {
  if (!weeks.length) {
    return `<tr><td style="padding:12px 32px 0;"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${MUTED};">No completed weeks of activity yet.</p></td></tr>`;
  }
  const shown = weeks.slice(-12);
  const max = Math.max(1, ...shown.map((w) => w.lessons_completed));

  const rows = shown
    .map((w, i) => {
      const last = i === shown.length - 1;
      const color = last ? BLUE : '#93b4e0';
      return `<tr>
      ${td(esc(fmtShort(w.week_start)), 'left', last ? INK : MUTED, last ? 600 : 400)}
      ${td(bar(percent(w.lessons_completed, max), color, 210), 'left')}
      ${td(num(w.lessons_completed), 'right', last ? INK : BODY, last ? 600 : 400)}
      ${td(num(w.courses_completed), 'right')}
      ${td(num(w.active_learners), 'right')}
    </tr>`;
    })
    .join('');

  return `<tr><td style="padding:12px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>${th('Week of')}${th('Lessons completed')}${th('Lessons', 'right')}${th('Courses', 'right')}${th('Active', 'right')}</tr>
    ${rows}
  </table>
  <p style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${FAINT};">Bars are scaled to the busiest week shown. The final row is the week just reported.</p>
</td></tr>`;
}

function cohortTable(learners: LearnerRow[]): string {
  const total = learners.length;
  const rows = STATUS_ORDER.map((status) => {
    const n = learners.filter((l) => l.status === status).length;
    return `<tr>
      ${td(esc(LEARNER_STATUS_LABEL[status]), 'left', n > 0 ? BODY : FAINT)}
      ${td(bar(percent(n, total || 1), STATUS_COLOR[status], 210))}
      ${td(num(n), 'right', n > 0 ? INK : FAINT, 600)}
      ${td(`${percent(n, total || 1)}%`, 'right', MUTED)}
    </tr>`;
  }).join('');

  return `<tr><td style="padding:12px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>${th('Status')}${th('Share of cohort')}${th('Learners', 'right')}${th('%', 'right')}</tr>
    ${rows}
  </table>
  <p style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${FAINT};">Every learner sits in exactly one bucket. “At risk” means no activity for 30 days, or a required course past its deadline.</p>
</td></tr>`;
}

function complianceSection(
  rows: ComplianceRow[],
  summary: ComplianceSummary
): string {
  if (summary.total === 0) {
    return `<tr><td style="padding:12px 32px 0;"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${MUTED};">No mandatory course assignments are configured.</p></td></tr>`;
  }

  const cells = (
    [
      ['completed', GREEN],
      ['overdue', RED],
      ['due_soon', AMBER],
      ['in_progress', BLUE],
      ['not_started', MUTED],
    ] as const
  )
    .map(
      ([key, color]) => `<td width="20%" align="center" style="padding:12px 6px;background:${CANVAS};border-radius:6px;">
      <p style="margin:0;font:700 22px/1.1 ${FONT};color:${color};">${num(summary[key])}</p>
      <p style="margin:5px 0 0;font:400 10px/1.3 ${FONT};letter-spacing:.05em;text-transform:uppercase;color:${MUTED};">${esc(COMPLIANCE_LABEL[key])}</p>
    </td>`
    )
    .join('<td width="8" style="font-size:0;">&nbsp;</td>');

  // Only the assignments that need action are named. Listing all of them would
  // bury the four that matter under thirty that do not.
  const action = rows
    .filter((r) => r.state === 'overdue' || r.state === 'due_soon')
    .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0))
    .slice(0, 25);

  const actionRows = action.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
    <tr>${th('Learner')}${th('Required course')}${th('Due', 'right')}${th('Progress', 'right')}${th('State', 'right')}</tr>
    ${action
      .map((r) => {
        const overdue = r.state === 'overdue';
        const when =
          r.days_remaining === null
            ? fmtDate(r.due_date)
            : overdue
              ? `${fmtDate(r.due_date)} (${Math.abs(r.days_remaining)}d late)`
              : `${fmtDate(r.due_date)} (${r.days_remaining}d)`;
        return `<tr>
        ${td(esc(r.name || r.email), 'left', INK, 600)}
        ${td(esc(r.course_title))}
        ${td(esc(when), 'right', overdue ? RED : AMBER)}
        ${td(`${r.progress_percent}% <span style="color:${FAINT};">(${num(r.lessons_completed)}/${num(r.lessons_total)})</span>`, 'right')}
        ${td(esc(COMPLIANCE_LABEL[r.state]), 'right', overdue ? RED : AMBER, 600)}
      </tr>`;
      })
      .join('')}
  </table>${
    rows.filter((r) => r.state === 'overdue' || r.state === 'due_soon').length > action.length
      ? `<p style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${FAINT};">Showing the 25 most urgent of ${num(rows.filter((r) => r.state === 'overdue' || r.state === 'due_soon').length)}. The full list is in the Compliance tab.</p>`
      : ''
  }`
    : `<p style="margin:16px 0 0;font:400 13px/1.5 ${FONT};color:${GREEN};">Nothing is overdue or due within seven days.</p>`;

  return `<tr><td style="padding:12px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
    <tr>${cells}</tr>
  </table>
  ${actionRows}
</td></tr>`;
}

/**
 * The people who need a conversation this week.
 *
 * Ordered by consequence — overdue required work first, then how long they have
 * been silent — rather than alphabetically, so the first name in the list is the
 * first name to act on.
 */
function attentionSection(learners: LearnerRow[]): string {
  const need = learners
    .filter((l) => l.status === 'at_risk' || l.status === 'stalled')
    .sort(
      (a, b) =>
        b.overdue_mandatory - a.overdue_mandatory ||
        (b.days_since_activity ?? 9999) - (a.days_since_activity ?? 9999)
    )
    .slice(0, 15);

  if (!need.length) {
    return `<tr><td style="padding:12px 32px 0;"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${GREEN};">Nobody is stalled or at risk this week.</p></td></tr>`;
  }

  const rows = need
    .map((l) => {
      const risk = l.status === 'at_risk';
      const silent =
        l.days_since_activity === null
          ? 'never active'
          : `${num(l.days_since_activity)}d ago`;
      return `<tr>
      ${td(esc(l.name || l.email), 'left', INK, 600)}
      ${td(esc(LEARNER_STATUS_LABEL[l.status]), 'left', risk ? RED : AMBER, 600)}
      ${td(esc(silent), 'right')}
      ${td(`${l.progress_percent}%`, 'right')}
      ${td(l.overdue_mandatory > 0 ? `<span style="color:${RED};font-weight:600;">${num(l.overdue_mandatory)}</span>` : `<span style="color:${FAINT};">—</span>`, 'right')}
    </tr>`;
    })
    .join('');

  return `<tr><td style="padding:12px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>${th('Learner')}${th('Status')}${th('Last active', 'right')}${th('Progress', 'right')}${th('Overdue', 'right')}</tr>
    ${rows}
  </table>
</td></tr>`;
}

/**
 * Rows in the per-learner table before it is truncated.
 *
 * A cap is needed because the whole email must stay under the ~102 KB at which
 * Gmail clips the body — and the section it would clip is the course catalog at
 * the very bottom, the part that was specifically asked for. The cap is stated
 * in the email whenever it bites, never applied silently: a table that quietly
 * stops at 40 of 120 learners reads as "we only have 40 learners".
 */
const LEARNER_ROW_CAP = 25;

function learnerTable(learners: LearnerRow[]): string {
  if (!learners.length) {
    return `<tr><td style="padding:12px 32px 0;"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${MUTED};">No learners yet.</p></td></tr>`;
  }
  const sorted = [...learners].sort(
    (a, b) => b.progress_percent - a.progress_percent || a.email.localeCompare(b.email)
  );
  const shown = sorted.slice(0, LEARNER_ROW_CAP);

  // No bar in this table, unlike the cohort and trend sections. At 30+ rows the
  // nested bar markup cost ~8 KB for a 90px graphic sitting next to the number
  // it duplicates; the coloured percentage carries the same signal.
  const rows = shown
    .map((l) => {
      const tone =
        l.progress_percent >= 100 ? GREEN : l.progress_percent >= 50 ? BLUE : l.progress_percent > 0 ? AMBER : FAINT;
      return `<tr>
      ${td(`${esc(l.name || l.email)}<span style="display:block;color:${FAINT};font-size:11px;">${esc(l.email)}</span>`, 'left', INK, 600)}
      ${td(`${num(l.courses_completed)}<span style="color:${FAINT};"> / ${num(l.courses_enrolled)}</span>`, 'right')}
      ${td(`${l.progress_percent}%`, 'right', tone, 600)}
      ${td(esc(formatDuration(l.credited_seconds)), 'right')}
      ${td(l.quizzes_taken ? `${l.quiz_pass_rate}%` : `<span style="color:${FAINT};">—</span>`, 'right')}
      ${td(l.last_activity_at ? esc(fmtDate(l.last_activity_at)) : `<span style="color:${FAINT};">never</span>`, 'right')}
    </tr>`;
    })
    .join('');

  const capped =
    sorted.length > shown.length
      ? ` Showing the ${num(shown.length)} furthest along of ${num(sorted.length)} learners — the full list is in the Learners tab.`
      : '';

  return `<tr><td style="padding:12px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>${th('Learner')}${th('Courses', 'right')}${th('Progress', 'right')}${th('Credited time', 'right')}${th('Quiz', 'right')}${th('Last active', 'right')}</tr>
    ${rows}
  </table>
  <p style="margin:8px 0 0;font:400 11px/1.5 ${FONT};color:${FAINT};">Progress is completed lessons across the courses each learner is enrolled in.${esc(capped)}</p>
</td></tr>`;
}

/**
 * The catalog, as requested at the foot of the report.
 *
 * Filtered to `is_published`. `courses.is_published` defaults to false, so an
 * unfiltered list would advertise a draft course to HR as available and send
 * people to a page they cannot open.
 */
function catalogSection(courses: CourseRow[]): string {
  const available = courses.filter((c) => c.is_published);
  if (!available.length) {
    return `<tr><td style="padding:12px 32px 0;"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${MUTED};">No published courses.</p></td></tr>`;
  }

  const byCategory = new Map<string, CourseRow[]>();
  for (const c of available) {
    const key = c.category_name || 'Other';
    const list = byCategory.get(key);
    if (list) list.push(c);
    else byCategory.set(key, [c]);
  }

  const groups = [...byCategory.entries()]
    .sort((a, b) => {
      // "Other" last, so an uncategorised course never heads the catalog.
      if (a[0] === 'Other') return 1;
      if (b[0] === 'Other') return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([category, list]) => {
      const rows = list
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(
          (c) => `<tr>
        ${td(
          `${esc(c.title)}${
            c.is_mandatory
              ? ` <span style="display:inline-block;padding:1px 6px;border:1px solid ${AMBER};border-radius:9px;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:${AMBER};">Required</span>`
              : ''
          }`,
          'left',
          INK,
          500
        )}
        ${td(num(c.lesson_count), 'right')}
        ${td(esc(`${num(c.declared_minutes)} min`), 'right')}
        ${td(num(c.enrollments), 'right')}
        ${td(`${c.completion_rate}%`, 'right', c.completion_rate >= 70 ? GREEN : c.completion_rate > 0 ? AMBER : FAINT)}
      </tr>`
        )
        .join('');

      return `<tr><td style="padding:16px 0 0;">
      <p style="margin:0 0 6px;font:600 12px/1.4 ${FONT};color:${BRAND};">${esc(category)} <span style="color:${FAINT};font-weight:400;">· ${list.length} course${list.length === 1 ? '' : 's'}</span></p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>${th('Course')}${th('Lessons', 'right')}${th('Duration', 'right')}${th('Enrolled', 'right')}${th('Completion', 'right')}</tr>
        ${rows}
      </table>
    </td></tr>`;
    })
    .join('');

  const mandatory = available.filter((c) => c.is_mandatory).length;
  const minutes = available.reduce((sum, c) => sum + (Number(c.declared_minutes) || 0), 0);

  return `<tr><td style="padding:12px 32px 0;">
  <p style="margin:0;font:400 13px/1.6 ${FONT};color:${BODY};">
    <strong style="color:${INK};">${num(available.length)} courses</strong> are available to employees
    (${num(mandatory)} required), totalling ${formatHours(minutes * 60)} of authored material.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    ${groups}
  </table>
</td></tr>`;
}

function footer(appUrl: string, generatedAt: Date, rosterSyncedAt: Date | null | undefined): string {
  const stamp = generatedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Say plainly when the roster is unknown or stale rather than omitting the
  // line — a missing sentence reads as "fine", which is the failure this is
  // here to prevent.
  const rosterLine = rosterSyncedAt
    ? `Employee roster synced from Time-Off on ${esc(
        rosterSyncedAt.toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      )} Central.`
    : 'Employee roster has never synced from Time-Off — this report may name people who have left.';

  return `<tr><td style="padding:26px 32px 30px;">
  <div style="height:1px;background:${LINE};"></div>
  <p style="margin:16px 0 0;font:400 12px/1.6 ${FONT};color:${MUTED};">
    Every figure here is generated from the live platform at the moment of sending — the same
    queries that render the Reports zone, so this email and the screen cannot disagree.
    Drill into any number at <a href="${esc(appUrl)}/admin/reports" style="color:${BLUE};text-decoration:none;">${esc(appUrl.replace(/^https?:\/\//, ''))}/admin/reports</a>.
  </p>
  <p style="margin:10px 0 0;font:400 11px/1.6 ${FONT};color:${FAINT};">
    Data as of ${esc(stamp)} Central. Sent automatically every Monday at 07:00 Central.<br>
    Covers current employees only. ${rosterLine}<br>
    Contains individual learning records — internal use only.<br>
    © UNILINK TRANSPORTATION INC.
  </p>
</td></tr>`;
}

// --- composition -------------------------------------------------------------

export function buildWeeklyDigest(input: DigestInput): Digest {
  const now = input.now ?? new Date();
  const appUrl = (input.appUrl || 'https://lms.unilinkportal.com').replace(/\/+$/, '');
  const { kpis, learners, courses, compliance } = input;
  const { complete, latest } = splitTrend(input.trend, now);

  const weekStart = latest?.week_start ?? null;
  const weekEnd = weekStart
    ? iso(new Date(new Date(`${weekStart}T00:00:00`).getTime() + 6 * 86_400_000))
    : null;

  const subject = weekStart
    ? `Unilink IT Training — weekly report, week of ${fmtDate(weekStart)}`
    : `Unilink IT Training — weekly report`;

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${CANVAS};margin:0;padding:0;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width:680px;max-width:680px;border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;">
    ${headerBand(weekStart, weekEnd)}
    ${kpiGrid(kpis, learners)}
    ${heading('Activity by week')}
    ${trendTable(complete)}
    ${heading('Where the cohort stands')}
    ${cohortTable(learners)}
    ${heading('Mandatory course compliance')}
    ${complianceSection(compliance.rows, compliance.summary)}
    ${heading('Needs attention')}
    ${attentionSection(learners)}
    ${heading('Every learner')}
    ${learnerTable(learners)}
    ${heading('Courses available')}
    ${catalogSection(courses)}
    ${footer(appUrl, now, input.rosterSyncedAt)}
  </table>
</td></tr>
</table>`;

  return {
    subject,
    // Collapse whitespace BETWEEN tags only — never inside text. A general
    // `\n\s+` collapse would join words across a wrapped line ("the duration"
    // becomes "theduration"), and replacing it with a space instead introduces
    // phantom whitespace nodes that some clients render as gaps between table
    // cells. Matching `>\s+<` touches neither.
    html: html.replace(/>\s+</g, '><'),
    meta: {
      weekStart,
      weekEnd,
      learners: learners.length,
      activeLastWeek: latest?.active_learners ?? 0,
      lessonsLastWeek: latest?.lessons_completed ?? 0,
      coursesAvailable: courses.filter((c) => c.is_published).length,
      overdueMandatory: compliance.summary.overdue,
    },
  };
}
