import { describe, expect, it } from 'vitest';
import { buildWeeklyDigest, esc } from './digest';
import type {
  ComplianceRow,
  ComplianceSummary,
  CourseRow,
  KpiRow,
  LearnerRow,
  TrendPoint,
} from './types';

/**
 * The weekly digest is mailed to the head of HR, unreviewed, every Monday. Once
 * the n8n schedule is active nobody looks at it before it lands — so the things
 * a human would have caught by glancing at it have to be caught here.
 *
 * Specifically: no `NaN`/`undefined` reaching a recipient, no unescaped learner
 * name, and no draft course advertised as available.
 */

const KPIS: KpiRow = {
  total_learners: 20,
  active_learners_7d: 4,
  active_learners_30d: 11,
  never_started: 3,
  total_enrollments: 46,
  completed_enrollments: 18,
  lessons_completed: 212,
  measured_seconds: 0,
  credited_seconds: 39_600,
  quiz_seconds: 5_400,
  quizzes_taken: 24,
  quizzes_passed: 19,
  avg_quiz_score: 81.5,
  median_days_to_complete: 2.5,
};

/** Monday-anchored weeks. `2026-07-27` is the week in progress when now = 27 Jul. */
const TREND: TrendPoint[] = [
  { week_start: '2026-07-06', lessons_completed: 30, courses_completed: 2, active_learners: 5 },
  { week_start: '2026-07-13', lessons_completed: 44, courses_completed: 3, active_learners: 6 },
  { week_start: '2026-07-20', lessons_completed: 21, courses_completed: 1, active_learners: 4 },
  { week_start: '2026-07-27', lessons_completed: 0, courses_completed: 0, active_learners: 0 },
];

function learner(over: Partial<LearnerRow> = {}): LearnerRow {
  return {
    id: 'u1',
    email: 'someone@unilinktransportation.com',
    name: 'Some One',
    role: 'learner',
    is_active: true,
    last_login_at: '2026-07-24T10:00:00Z',
    last_activity_at: '2026-07-24T10:00:00Z',
    courses_enrolled: 3,
    courses_completed: 1,
    courses_in_progress: 1,
    lessons_total: 40,
    lessons_completed: 20,
    measured_seconds: 0,
    credited_seconds: 3_600,
    quiz_seconds: 600,
    quizzes_taken: 2,
    quizzes_passed: 2,
    avg_quiz_score: 90,
    median_days_to_complete: 2,
    completions_recent: 2,
    completions_previous: 1,
    overdue_mandatory: 0,
    progress_percent: 50,
    quiz_pass_rate: 100,
    effort_ratio: null,
    days_since_activity: 3,
    status: 'on_track',
    momentum: 'up',
    ...over,
  };
}

function course(over: Partial<CourseRow> = {}): CourseRow {
  return {
    id: 'c1',
    title: 'Corporate IT Security Awareness',
    category_name: 'IT Security',
    is_mandatory: true,
    is_published: true,
    lesson_count: 9,
    declared_minutes: 60,
    enrollments: 14,
    completions: 9,
    learners_started: 12,
    measured_seconds: 0,
    credited_seconds: 32_400,
    median_days_to_complete: 1,
    quizzes_taken: 10,
    quizzes_passed: 8,
    avg_quiz_score: 84,
    completion_rate: 64,
    quiz_pass_rate: 80,
    effort_ratio: null,
    drop_off: null,
    ...over,
  };
}

function compliance(rows: ComplianceRow[]): { rows: ComplianceRow[]; summary: ComplianceSummary } {
  const summary: ComplianceSummary = {
    total: 0,
    completed: 0,
    overdue: 0,
    due_soon: 0,
    in_progress: 0,
    not_started: 0,
  };
  for (const r of rows) {
    summary.total += 1;
    summary[r.state] += 1;
  }
  return { rows, summary };
}

function complianceRow(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return {
    user_id: 'u1',
    email: 'someone@unilinktransportation.com',
    name: 'Some One',
    course_id: 'c1',
    course_title: 'Corporate IT Security Awareness',
    due_date: '2026-07-15',
    completed_at: null,
    lessons_total: 9,
    lessons_completed: 3,
    progress_percent: 33,
    days_remaining: -12,
    state: 'overdue',
    ...over,
  };
}

const NOW = new Date('2026-07-27T12:00:00Z');

function build(over: Partial<Parameters<typeof buildWeeklyDigest>[0]> = {}) {
  return buildWeeklyDigest({
    kpis: KPIS,
    trend: TREND,
    learners: [learner()],
    courses: [course()],
    compliance: compliance([complianceRow()]),
    now: NOW,
    appUrl: 'https://lms.unilinkportal.com',
    ...over,
  });
}

describe('esc', () => {
  it('escapes every character that can break out of markup', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(esc("O'Brien & Sons")).toBe('O&#39;Brien &amp; Sons');
  });

  it('renders a missing value as empty, not "null"', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('buildWeeklyDigest', () => {
  it('never emits undefined, NaN or Infinity', () => {
    // The failure that would actually reach HR: a null median or a zero
    // denominator rendering as "NaN%" in a report to the head of HR.
    const html = build().html;
    expect(html).not.toMatch(/undefined/);
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/Infinity/);
    expect(html).not.toMatch(/\[object Object\]/);
  });

  it('reports the last COMPLETE week, not the week in progress', () => {
    // Sent Monday morning, so date_trunc('week', NOW()) is a few hours old and
    // reads as zero activity. Reporting that would tell HR nothing happened,
    // every single Monday.
    const digest = build();
    expect(digest.meta.weekStart).toBe('2026-07-20');
    expect(digest.meta.weekEnd).toBe('2026-07-26');
    expect(digest.meta.lessonsLastWeek).toBe(21);
    expect(digest.meta.activeLastWeek).toBe(4);
    expect(digest.subject).toContain('20 Jul 2026');
  });

  it('escapes learner names and course titles', () => {
    const html = build({
      learners: [learner({ name: '<b>Ana</b> & Co', status: 'at_risk', days_since_activity: 40 })],
      courses: [course({ title: 'Safety <script> & "Health"' })],
    }).html;
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt; &amp; Co');
    expect(html).not.toContain('<script>');
  });

  it('lists every published course, grouped, and counts them', () => {
    const digest = build({
      courses: [
        course({ id: 'a', title: 'Alpha', category_name: 'IT Security' }),
        course({ id: 'b', title: 'Beta', category_name: 'Onboarding', is_mandatory: false }),
        course({ id: 'c', title: 'Gamma', category_name: null, is_mandatory: false }),
      ],
    });
    expect(digest.html).toContain('Alpha');
    expect(digest.html).toContain('Beta');
    expect(digest.html).toContain('Gamma');
    expect(digest.html).toContain('Onboarding');
    // An uncategorised course is grouped, never dropped.
    expect(digest.html).toContain('Other');
    expect(digest.meta.coursesAvailable).toBe(3);
  });

  it('never advertises a draft course as available', () => {
    // courses.is_published defaults to FALSE, so an unfiltered catalog would
    // send HR to a page nobody can open.
    const digest = build({
      courses: [
        course({ id: 'a', title: 'LiveCourse' }),
        course({ id: 'b', title: 'DraftCourse', is_published: false }),
      ],
    });
    expect(digest.html).toContain('LiveCourse');
    expect(digest.html).not.toContain('DraftCourse');
    expect(digest.meta.coursesAvailable).toBe(1);
  });

  it('names overdue mandatory assignments and counts them in meta', () => {
    const digest = build({
      compliance: compliance([
        complianceRow({ name: 'Late Learner', state: 'overdue', days_remaining: -9 }),
        complianceRow({ name: 'Soon Learner', state: 'due_soon', days_remaining: 3 }),
        complianceRow({ name: 'Done Learner', state: 'completed', days_remaining: 10 }),
      ]),
    });
    expect(digest.meta.overdueMandatory).toBe(1);
    expect(digest.html).toContain('Late Learner');
    expect(digest.html).toContain('Soon Learner');
    expect(digest.html).toContain('9d late');
    // A completed assignment is counted in the tiles but not named in the
    // action list, which only carries what needs following up.
    expect(digest.html).not.toContain('Done Learner');
    expect(digest.html).toContain('Overdue');
  });

  it('says so plainly when nothing is overdue', () => {
    const html = build({
      compliance: compliance([complianceRow({ state: 'completed', days_remaining: 5 })]),
    }).html;
    expect(html).toContain('Nothing is overdue or due within seven days');
  });

  it('survives an empty platform without emitting a placeholder', () => {
    const digest = buildWeeklyDigest({
      kpis: {
        total_learners: 0, active_learners_7d: 0, active_learners_30d: 0, never_started: 0,
        total_enrollments: 0, completed_enrollments: 0, lessons_completed: 0,
        measured_seconds: 0, credited_seconds: 0, quiz_seconds: 0,
        quizzes_taken: 0, quizzes_passed: 0, avg_quiz_score: null, median_days_to_complete: null,
      },
      trend: [],
      learners: [],
      courses: [],
      compliance: compliance([]),
      now: NOW,
    });
    expect(digest.html).not.toMatch(/undefined|NaN|Infinity/);
    // A zero denominator must be 0%, never NaN%.
    expect(digest.html).toContain('0%');
    expect(digest.meta.weekStart).toBeNull();
    expect(digest.subject).toBe('Unilink IT Training — weekly report');
    expect(digest.html).toContain('No learners yet');
    expect(digest.html).toContain('No published courses');
  });

  it('reports credited time only, labelled as authored duration', () => {
    // Credited (authored duration of completed lessons) and measured (heartbeat)
    // are different kinds of number and must never be summed — measured was not
    // written at all before 2026-07-29. The email therefore reports ONE of them,
    // credited, and says what it is. Showing both invites a recipient to add
    // them, which is why the explanatory paragraph was dropped.
    const html = build().html;
    expect(html).toContain('Credited time');
    expect(html).toContain('Authored duration, completed lessons');
    expect(html).toContain('11.0h');

    // Measured time must not appear at all, in either state — not as a figure
    // and not as a caveat.
    const withMeasured = build({ kpis: { ...KPIS, measured_seconds: 7_200 } }).html;
    expect(withMeasured).not.toMatch(/measured|observed|time on task/i);
    expect(withMeasured).not.toContain('2.0h');
    // Changing measured_seconds must not change the email at all.
    expect(withMeasured).toBe(html);
  });

  it('carries no remote image or external stylesheet', () => {
    // Outlook blocks remote images by default, so a chart served as a PNG URL
    // is an empty box on first open for most recipients.
    const html = build().html;
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/background-image/i);
    // The only external URL is the link back to the app.
    const urls = html.match(/https?:\/\/[^"'\s]+/g) ?? [];
    for (const url of urls) expect(url).toContain('lms.unilinkportal.com');
  });

  it('orders the attention list by consequence, not alphabetically', () => {
    const html = build({
      learners: [
        learner({ id: 'a', name: 'Aaron Quiet', status: 'stalled', days_since_activity: 20, overdue_mandatory: 0 }),
        learner({ id: 'b', name: 'Zoe Overdue', status: 'at_risk', days_since_activity: 5, overdue_mandatory: 2 }),
      ],
    }).html;
    expect(html.indexOf('Zoe Overdue')).toBeLessThan(html.indexOf('Aaron Quiet'));
  });

  it('clamps a bar to its track even when a percentage is out of range', () => {
    const html = build({ learners: [learner({ progress_percent: 250 })] }).html;
    expect(html).not.toContain('width:250%');
    expect(html).not.toContain('width="250%"');
  });

  it('draws a zero bar as empty, not half-full', () => {
    // `width="0%"` is ignored by the renderer, which then splits the track
    // evenly between the two content-less cells — so every quiet week showed a
    // half-full bar. Nothing but a screenshot caught it, so it gets an
    // assertion: a 0% bar must emit no fill cell at all.
    const quiet: TrendPoint[] = [
      { week_start: '2026-07-13', lessons_completed: 40, courses_completed: 1, active_learners: 3 },
      { week_start: '2026-07-20', lessons_completed: 0, courses_completed: 0, active_learners: 0 },
      { week_start: '2026-07-27', lessons_completed: 0, courses_completed: 0, active_learners: 0 },
    ];
    const html = build({ trend: quiet }).html;
    expect(html).not.toContain('width="0%"');
    // The busiest week is 100%, the quiet week has no fill. Exactly one bar in
    // the trend table carries the current-week colour, and it is the full one.
    expect(html).toContain('background:#2563eb;border-radius:3px;');
  });

  it('states both cell widths on a partial bar so the track cannot auto-split', () => {
    // Every partial bar must be fill% + remainder% = 100. Leaving the second
    // cell unconstrained is what let the renderer redistribute the track.
    const html = build().html;
    // Anchored on the exact cell pair. A lazy `[^]*?` between them silently
    // pairs one bar's remainder with the NEXT bar's fill and asserts nothing.
    const pairs = [
      ...html.matchAll(/<td width="(\d+)%" style="[^"]*">&nbsp;<\/td><td width="(\d+)%"/g),
    ];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, fill, rest] of pairs) {
      expect(Number(fill) + Number(rest)).toBe(100);
    }
  });

  it('stays under the size at which mail clients clip the body', () => {
    // Gmail truncates above ~102 KB and replaces the tail with a "[Message
    // clipped]" link — which would hide the course catalog, the part that was
    // specifically asked for, at the very bottom of the email. The first draft
    // came in at 120 KB purely from a long font stack repeated on every cell,
    // and nothing would have surfaced that but a recipient scrolling to the end.
    const digest = buildWeeklyDigest({
      kpis: KPIS,
      trend: TREND,
      learners: Array.from({ length: 30 }, (_, i) =>
        learner({ id: `u${i}`, email: `learner${i}@unilinktransportation.com`, name: `Learner Number ${i}` })
      ),
      courses: Array.from({ length: 30 }, (_, i) =>
        course({ id: `c${i}`, title: `A Reasonably Long Course Title Number ${i}`, category_name: `Category ${i % 6}` })
      ),
      compliance: compliance(
        Array.from({ length: 30 }, (_, i) =>
          complianceRow({ user_id: `u${i}`, name: `Learner Number ${i}`, state: i % 3 === 0 ? 'overdue' : 'completed' })
        )
      ),
      now: NOW,
    });
    expect(digest.html.length).toBeLessThan(95_000);
  });

  it('collapses whitespace between tags without joining words', () => {
    const html = build().html;
    expect(html).not.toMatch(/>\s+</);
    // The regression this guards: a naive `\n\s+` collapse turns a wrapped
    // sentence into run-together words.
    expect(html).toContain('Every learner sits in exactly one bucket');
    expect(html).not.toMatch(/[a-z]{25,}/);
  });

  it('produces a single self-contained HTML fragment', () => {
    const html = build().html;
    // No document scaffolding: the Outlook node sets bodyContentType=html and
    // supplies the envelope itself.
    expect(html).not.toMatch(/<!doctype|<html|<body/i);
    expect(html.startsWith('<table')).toBe(true);
    expect(html.length).toBeGreaterThan(4_000);
  });
});
