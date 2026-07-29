'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/reports/data-table';
import { MiniBar, StackedBar } from '@/components/reports/charts';
import { StatTile } from '@/components/reports/stat-tile';
import { percent } from '@/lib/reports/metrics';
import {
  COMPLIANCE_CLASS,
  COMPLIANCE_LABEL,
  type ComplianceRow,
  type ComplianceSummary,
} from '@/lib/reports/types';
import { cn } from '@/lib/utils';

/**
 * Mandatory-training compliance.
 *
 * This report exists because there was no screen anywhere that answered "who
 * still owes us this required course?" — which is how a stuck "Required
 * Training" banner (shown to a learner who had in fact completed it) survived
 * unnoticed. A course counts as complete here when its enrolment is stamped OR
 * every lesson in it is done, so compliance never depends on the stamp alone.
 */
export function ComplianceTab({
  rows,
  summary,
}: {
  rows: ComplianceRow[];
  summary: ComplianceSummary;
}) {
  const rate = percent(summary.completed, summary.total);

  const columns: Column<ComplianceRow>[] = [
    {
      key: 'learner',
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
      key: 'course',
      header: 'Required course',
      sortValue: (r) => r.course_title.toLowerCase(),
      cell: (r) => <span className="text-slate-300">{r.course_title}</span>,
    },
    {
      key: 'state',
      header: 'State',
      sortValue: (r) => r.state,
      cell: (r) => (
        <Badge variant="outline" className={cn('text-xs', COMPLIANCE_CLASS[r.state])}>
          {COMPLIANCE_LABEL[r.state]}
        </Badge>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
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
      key: 'due',
      header: 'Due',
      align: 'right',
      sortValue: (r) => r.days_remaining,
      cell: (r) => {
        if (r.state === 'completed') return <span className="text-slate-600">—</span>;
        if (r.days_remaining === null) return <span className="text-slate-600">No date</span>;
        if (r.days_remaining < 0) {
          return <span className="text-red-400">{Math.abs(r.days_remaining)}d overdue</span>;
        }
        return (
          <span className={cn(r.days_remaining <= 7 ? 'text-amber-400' : 'text-slate-300')}>
            {r.days_remaining === 0 ? 'Today' : `${r.days_remaining}d left`}
          </span>
        );
      },
    },
    {
      key: 'completed_at',
      header: 'Completed',
      align: 'right',
      secondary: true,
      sortValue: (r) => (r.completed_at ? new Date(r.completed_at).getTime() : null),
      cell: (r) =>
        r.completed_at ? (
          <span className="text-slate-400">
            {new Date(r.completed_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Compliance rate"
          value={`${rate}%`}
          tone={rate >= 90 ? 'good' : rate >= 60 ? 'warn' : 'bad'}
          hint={`${summary.completed} of ${summary.total} assignments`}
        />
        <StatTile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? 'bad' : 'good'} />
        <StatTile label="Due within 7 days" value={summary.due_soon} tone={summary.due_soon > 0 ? 'warn' : 'default'} />
        <StatTile label="Not started" value={summary.not_started} tone={summary.not_started > 0 ? 'warn' : 'good'} />
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Assignment breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <StackedBar
            segments={[
              { label: 'Completed', value: summary.completed, className: 'bg-green-500' },
              { label: 'In progress', value: summary.in_progress, className: 'bg-blue-500' },
              { label: 'Due soon', value: summary.due_soon, className: 'bg-amber-500' },
              { label: 'Overdue', value: summary.overdue, className: 'bg-red-500' },
              { label: 'Not started', value: summary.not_started, className: 'bg-slate-600' },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Who still owes required training</CardTitle>
          <CardDescription className="text-slate-400">
            One row per active learner and required course. Sorted by soonest deadline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.user_id}:${r.course_id}`}
            initialSort="due"
            initialDirection="asc"
            emptyMessage="No mandatory assignments are configured"
          />
        </CardContent>
      </Card>
    </div>
  );
}
