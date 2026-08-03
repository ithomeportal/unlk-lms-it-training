import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canExportData } from '@/lib/permissions';
import { csvDate, csvHeaders, toCsv, type CsvColumn } from '@/lib/reports/csv';
import {
  fetchCompliance,
  fetchCourses,
  fetchLearners,
  scopeFromParams,
  type ComplianceRow,
  type CourseRow,
  type LearnerRow,
} from '@/lib/reports/queries';
import { LEARNER_STATUS_LABEL } from '@/lib/reports/metrics';

/**
 * CSV export of any Reports tab.
 *
 * Gated on `canExportData` (super_admin + auditor) — deliberately NARROWER than
 * the screens themselves, which are `canViewAdmin`. A plain admin can read the
 * reports but not walk out with a file of every employee's activity.
 *
 * Rows come from the same functions that feed the UI, so the download can never
 * disagree with the screen it was taken from.
 */

const minutes = (seconds: number) => Math.round(seconds / 60);

const LEARNER_COLUMNS: CsvColumn<LearnerRow>[] = [
  { header: 'Email', value: (r) => r.email },
  { header: 'Name', value: (r) => r.name },
  { header: 'Role', value: (r) => r.role },
  { header: 'Active', value: (r) => (r.is_active ? 'Yes' : 'No') },
  { header: 'Status', value: (r) => LEARNER_STATUS_LABEL[r.status] },
  { header: 'Courses Enrolled', value: (r) => r.courses_enrolled },
  { header: 'Courses Completed', value: (r) => r.courses_completed },
  { header: 'Courses In Progress', value: (r) => r.courses_in_progress },
  { header: 'Lessons Completed', value: (r) => r.lessons_completed },
  { header: 'Lessons Assigned', value: (r) => r.lessons_total },
  { header: 'Progress %', value: (r) => r.progress_percent },
  // Two time columns, never one. Credited is authored duration for completed
  // lessons and covers all history; measured is real heartbeat data and only
  // exists from 2026-07-29 onward. Collapsing them would present an estimate
  // as a measurement.
  { header: 'Credited Learning Time (min)', value: (r) => minutes(r.credited_seconds) },
  { header: 'Measured Learning Time (min)', value: (r) => minutes(r.measured_seconds) },
  { header: 'Effort Ratio (measured/credited)', value: (r) => r.effort_ratio },
  { header: 'Quiz Time (min)', value: (r) => minutes(r.quiz_seconds) },
  { header: 'Quizzes Taken', value: (r) => r.quizzes_taken },
  { header: 'Quizzes Passed', value: (r) => r.quizzes_passed },
  { header: 'Quiz Pass Rate %', value: (r) => r.quiz_pass_rate },
  { header: 'Average Quiz Score', value: (r) => r.avg_quiz_score },
  { header: 'Median Days To Complete', value: (r) => r.median_days_to_complete },
  { header: 'Completions Last 30d', value: (r) => r.completions_recent },
  { header: 'Completions Prior 30d', value: (r) => r.completions_previous },
  { header: 'Momentum', value: (r) => r.momentum },
  { header: 'Overdue Mandatory', value: (r) => r.overdue_mandatory },
  { header: 'Days Since Activity', value: (r) => r.days_since_activity },
  { header: 'Last Activity', value: (r) => csvDate(r.last_activity_at) },
  { header: 'Last Login', value: (r) => csvDate(r.last_login_at) },
];

const COURSE_COLUMNS: CsvColumn<CourseRow>[] = [
  { header: 'Course', value: (r) => r.title },
  { header: 'Category', value: (r) => r.category_name },
  { header: 'Mandatory', value: (r) => (r.is_mandatory ? 'Yes' : 'No') },
  { header: 'Lessons', value: (r) => r.lesson_count },
  { header: 'Declared Duration (min)', value: (r) => r.declared_minutes },
  { header: 'Enrollments', value: (r) => r.enrollments },
  { header: 'Learners Started', value: (r) => r.learners_started },
  { header: 'Completions', value: (r) => r.completions },
  { header: 'Completion Rate %', value: (r) => r.completion_rate },
  { header: 'Median Days To Complete', value: (r) => r.median_days_to_complete },
  { header: 'Credited Time (min)', value: (r) => minutes(r.credited_seconds) },
  { header: 'Measured Time (min)', value: (r) => minutes(r.measured_seconds) },
  { header: 'Effort Ratio', value: (r) => r.effort_ratio },
  { header: 'Quizzes Taken', value: (r) => r.quizzes_taken },
  { header: 'Quiz Pass Rate %', value: (r) => r.quiz_pass_rate },
  { header: 'Average Quiz Score', value: (r) => r.avg_quiz_score },
  { header: 'Biggest Drop-off Lesson', value: (r) => r.drop_off?.title ?? '' },
  { header: 'Learners Lost There', value: (r) => r.drop_off?.lostLearners ?? '' },
];

const COMPLIANCE_COLUMNS: CsvColumn<ComplianceRow>[] = [
  { header: 'Email', value: (r) => r.email },
  { header: 'Name', value: (r) => r.name },
  { header: 'Required Course', value: (r) => r.course_title },
  { header: 'State', value: (r) => r.state },
  { header: 'Due Date', value: (r) => csvDate(r.due_date) },
  { header: 'Days Remaining', value: (r) => r.days_remaining },
  { header: 'Completed At', value: (r) => csvDate(r.completed_at) },
  { header: 'Lessons Completed', value: (r) => r.lessons_completed },
  { header: 'Lessons Total', value: (r) => r.lessons_total },
  { header: 'Progress %', value: (r) => r.progress_percent },
];

const VIEWS = ['learners', 'courses', 'compliance'] as const;
type View = (typeof VIEWS)[number];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canExportData(user)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized — export requires Super Admin or Auditor' },
        { status: 401 }
      );
    }

    const requested = request.nextUrl.searchParams.get('view') || 'learners';
    if (!VIEWS.includes(requested as View)) {
      return NextResponse.json(
        { success: false, error: `Unknown view. Expected one of: ${VIEWS.join(', ')}` },
        { status: 400 }
      );
    }
    const view = requested as View;

    // The export must carry the SAME cohort as the tab it was taken from —
    // otherwise the download quietly contains rows the screen did not show.
    const scope = scopeFromParams(request.nextUrl.searchParams);

    let csv: string;
    if (view === 'courses') {
      csv = toCsv(COURSE_COLUMNS, await fetchCourses(scope));
    } else if (view === 'compliance') {
      csv = toCsv(COMPLIANCE_COLUMNS, await fetchCompliance(scope));
    } else {
      const search = request.nextUrl.searchParams.get('search')?.trim() || undefined;
      csv = toCsv(LEARNER_COLUMNS, await fetchLearners(search, scope));
    }

    // BOM so Excel detects UTF-8 and does not mangle accented names.
    return new NextResponse('﻿' + csv, { headers: csvHeaders(`lms-${view}`) });
  } catch (error) {
    console.error('Reports export error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
