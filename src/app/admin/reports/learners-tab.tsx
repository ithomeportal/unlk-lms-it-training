'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/reports/data-table';
import { MiniBar } from '@/components/reports/charts';
import { formatDuration } from '@/lib/learning-time';
import { LEARNER_STATUS_CLASS, LEARNER_STATUS_LABEL, formatDays } from '@/lib/reports/metrics';
import type { LearnerRow } from '@/lib/reports/types';
import { cn } from '@/lib/utils';

const MOMENTUM_GLYPH = { up: '▲', flat: '–', down: '▼' } as const;
const MOMENTUM_CLASS = { up: 'text-green-400', flat: 'text-slate-500', down: 'text-amber-400' } as const;

/**
 * "Courses completed by each user, and the time they used for" — the table the
 * request was actually about.
 *
 * Time is shown as TWO columns. Credited is the authored duration of the
 * lessons a learner finished and covers all history; measured is real
 * time-on-task and only exists from 29 Jul 2026. One combined column would
 * have to either discard the history or dress an estimate up as a measurement.
 */
export function LearnersTab({ learners }: { learners: LearnerRow[] }) {
  const router = useRouter();
  const anyMeasured = learners.some((l) => l.measured_seconds > 0);

  const columns: Column<LearnerRow>[] = [
    {
      key: 'name',
      header: 'Learner',
      sortValue: (r) => (r.name || r.email).toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{r.name || r.email.split('@')[0]}</p>
          <p className="truncate text-xs text-slate-500">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge variant="outline" className={cn('text-xs', LEARNER_STATUS_CLASS[r.status])}>
          {LEARNER_STATUS_LABEL[r.status]}
        </Badge>
      ),
    },
    {
      key: 'courses',
      header: 'Courses done',
      align: 'right',
      sortValue: (r) => r.courses_completed,
      cell: (r) => (
        <span>
          <span className="font-medium text-white">{r.courses_completed}</span>
          <span className="text-slate-500"> / {r.courses_enrolled}</span>
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Lesson progress',
      sortValue: (r) => r.progress_percent,
      cell: (r) => (
        <div className="min-w-[7rem]">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">
              {r.lessons_completed}/{r.lessons_total}
            </span>
            <span className="tabular-nums text-slate-300">{r.progress_percent}%</span>
          </div>
          <MiniBar percent={r.progress_percent} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'credited',
      header: 'Credited time',
      align: 'right',
      sortValue: (r) => r.credited_seconds,
      cell: (r) => <span className="text-slate-300">{formatDuration(r.credited_seconds)}</span>,
    },
    {
      key: 'measured',
      header: 'Measured time',
      align: 'right',
      sortValue: (r) => r.measured_seconds,
      cell: (r) =>
        r.measured_seconds > 0 ? (
          <span className="text-white">{formatDuration(r.measured_seconds)}</span>
        ) : (
          <span className="text-slate-600" title="No time-on-task recorded yet for this learner">
            —
          </span>
        ),
    },
    {
      key: 'quiz',
      header: 'Quizzes',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.avg_quiz_score,
      cell: (r) =>
        r.quizzes_taken === 0 ? (
          <span className="text-slate-600">—</span>
        ) : (
          <span>
            <span className="text-white">
              {r.quizzes_passed}/{r.quizzes_taken}
            </span>
            {r.avg_quiz_score !== null && (
              <span className="block text-xs text-slate-500">avg {r.avg_quiz_score}%</span>
            )}
          </span>
        ),
    },
    {
      key: 'pace',
      header: 'Median pace',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.median_days_to_complete,
      cell: (r) => (
        <span className={r.median_days_to_complete === null ? 'text-slate-600' : 'text-slate-300'}>
          {formatDays(r.median_days_to_complete)}
        </span>
      ),
    },
    {
      key: 'momentum',
      header: '30d trend',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.completions_recent - r.completions_previous,
      cell: (r) => (
        <span className={cn('text-xs', MOMENTUM_CLASS[r.momentum])}>
          {MOMENTUM_GLYPH[r.momentum]} {r.completions_recent}
          <span className="text-slate-600"> vs {r.completions_previous}</span>
        </span>
      ),
    },
    {
      key: 'idle',
      header: 'Last active',
      align: 'right',
      sortValue: (r) => (r.days_since_activity === null ? null : -r.days_since_activity),
      cell: (r) =>
        r.days_since_activity === null ? (
          <span className="text-slate-600">Never</span>
        ) : (
          <span className={cn(r.days_since_activity > 30 ? 'text-red-400' : r.days_since_activity > 14 ? 'text-amber-400' : 'text-slate-300')}>
            {r.days_since_activity === 0 ? 'Today' : `${r.days_since_activity}d ago`}
          </span>
        ),
    },
  ];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base">Per-learner progress</CardTitle>
        <CardDescription className="text-slate-400">
          Lesson progress is out of every lesson in the courses the learner is enrolled in — not just
          the ones they have opened. Click a row for their full activity history.
          {!anyMeasured && (
            <>
              {' '}
              <span className="text-amber-400/80">
                Measured time is empty because time-on-task recording started on 29 Jul 2026; credited
                time covers all history.
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={learners}
          rowKey={(r) => r.id}
          initialSort="progress"
          onRowClick={(r) => router.push(`/admin/analytics/${r.id}`)}
          emptyMessage="No learners match this search"
        />
      </CardContent>
    </Card>
  );
}
