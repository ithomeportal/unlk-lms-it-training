'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/reports/data-table';
import { MiniBar } from '@/components/reports/charts';
import { formatDuration } from '@/lib/learning-time';
import { formatDays } from '@/lib/reports/metrics';
import type { CourseRow } from '@/lib/reports/types';
import { cn } from '@/lib/utils';

/**
 * Course-level view: which content works and which quietly loses people.
 *
 * The two columns worth explaining:
 *
 * - Effort ratio — measured time / credited time. Above 1 means learners take
 *   longer than the author budgeted (dense or unclear material); well below 1
 *   means they are clicking straight through. Null until enough measured time
 *   exists, shown as an em dash rather than 0 so "unknown" never reads as "instant".
 *
 * - Drop-off — the lesson with the largest fall in completions from the lesson
 *   before it. This is the single most actionable number here and no existing
 *   screen showed it.
 */
export function CoursesTab({ courses }: { courses: CourseRow[] }) {
  const columns: Column<CourseRow>[] = [
    {
      key: 'title',
      header: 'Course',
      sortValue: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0 max-w-[22rem]">
          <p className="flex items-center gap-2 font-medium text-white">
            <span className="truncate">{r.title}</span>
            {/* is_published defaults to FALSE, so a course can import cleanly,
                count correctly here, and be invisible to every learner. Without
                this badge that state is indistinguishable from a live course
                nobody has enrolled in. */}
            {!r.is_published && (
              <Badge variant="outline" className="shrink-0 border-slate-600 text-slate-400 text-xs">
                Draft
              </Badge>
            )}
          </p>
          <p className="truncate text-xs text-slate-500">
            {r.category_name || 'Uncategorised'} · {r.lesson_count} lessons · {r.declared_minutes} min
          </p>
        </div>
      ),
    },
    {
      key: 'mandatory',
      header: 'Required',
      align: 'center',
      sortValue: (r) => (r.is_mandatory ? 1 : 0),
      cell: (r) =>
        r.is_mandatory ? (
          <Badge variant="outline" className="border-amber-500 text-amber-400 text-xs">
            Required
          </Badge>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: 'enrollments',
      header: 'Enrolled',
      align: 'right',
      sortValue: (r) => r.enrollments,
      cell: (r) => (
        <span>
          <span className="text-white">{r.enrollments}</span>
          <span className="block text-xs text-slate-500">{r.learners_started} started</span>
        </span>
      ),
    },
    {
      key: 'completion',
      header: 'Completion',
      sortValue: (r) => r.completion_rate,
      cell: (r) => (
        <div className="min-w-[7rem]">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">{r.completions} done</span>
            <span className="tabular-nums text-slate-300">{r.completion_rate}%</span>
          </div>
          <MiniBar percent={r.completion_rate} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'pace',
      header: 'Median pace',
      align: 'right',
      sortValue: (r) => r.median_days_to_complete,
      cell: (r) => (
        <span className={r.median_days_to_complete === null ? 'text-slate-600' : 'text-slate-300'}>
          {formatDays(r.median_days_to_complete)}
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Time invested',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.credited_seconds,
      cell: (r) => (
        <span>
          <span className="text-slate-300">{formatDuration(r.credited_seconds)}</span>
          {/* Kept to one short line: "not yet measured" wrapped to three lines
              in this narrow column and doubled every row's height. */}
          <span className="block whitespace-nowrap text-xs text-slate-500">
            {r.measured_seconds > 0 ? `${formatDuration(r.measured_seconds)} real` : 'credited'}
          </span>
        </span>
      ),
    },
    {
      key: 'effort',
      header: 'Effort ratio',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.effort_ratio,
      cell: (r) =>
        r.effort_ratio === null ? (
          <span className="text-slate-600" title="Not enough measured time yet">
            —
          </span>
        ) : (
          <span
            className={cn(
              r.effort_ratio > 1.5 ? 'text-amber-400' : r.effort_ratio < 0.5 ? 'text-red-400' : 'text-green-400'
            )}
            title="Measured time divided by authored duration"
          >
            {r.effort_ratio}×
          </span>
        ),
    },
    {
      key: 'quiz',
      header: 'Quiz',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.quiz_pass_rate,
      cell: (r) =>
        r.quizzes_taken === 0 ? (
          <span className="text-slate-600">—</span>
        ) : (
          <span>
            <span className={cn(r.quiz_pass_rate >= 70 ? 'text-green-400' : 'text-amber-400')}>
              {r.quiz_pass_rate}%
            </span>
            <span className="block text-xs text-slate-500">
              {r.avg_quiz_score !== null ? `avg ${r.avg_quiz_score}%` : `${r.quizzes_taken} attempts`}
            </span>
          </span>
        ),
    },
    {
      key: 'dropoff',
      header: 'Biggest drop-off',
      sortValue: (r) => r.drop_off?.lostLearners ?? null,
      cell: (r) =>
        r.drop_off === null ? (
          <span className="text-slate-600">None</span>
        ) : (
          <div className="max-w-[16rem]">
            <p className="truncate text-xs text-amber-400">
              L{r.drop_off.sort_order}: {r.drop_off.title}
            </p>
            <p className="text-xs text-slate-500">
              −{r.drop_off.lostLearners} learner{r.drop_off.lostLearners === 1 ? '' : 's'}
            </p>
          </div>
        ),
    },
  ];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base">Course performance</CardTitle>
        <CardDescription className="text-slate-400">
          Effort ratio is measured time divided by the duration the author declared — above 1× means
          learners take longer than budgeted. Drop-off names the lesson where the most people stop.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={courses}
          rowKey={(r) => r.id}
          initialSort="enrollments"
          emptyMessage="No published courses yet"
        />
      </CardContent>
    </Card>
  );
}
