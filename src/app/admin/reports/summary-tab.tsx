'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/reports/stat-tile';
import { StackedBar, TrendBars } from '@/components/reports/charts';
import { formatHours } from '@/lib/learning-time';
import { LEARNER_STATUS_LABEL, formatDays, percent, type LearnerStatus } from '@/lib/reports/metrics';
import type { KpiRow, LearnerRow, TrendPoint } from '@/lib/reports/types';

/** `2026-07-27` -> `Jul 27`, for a compact axis label. */
function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_ORDER: LearnerStatus[] = ['completed_all', 'on_track', 'stalled', 'at_risk', 'never_started'];
const STATUS_FILL: Record<LearnerStatus, string> = {
  completed_all: 'bg-green-500',
  on_track: 'bg-blue-500',
  stalled: 'bg-amber-500',
  at_risk: 'bg-red-500',
  never_started: 'bg-slate-600',
};

export function SummaryTab({
  kpis,
  trend,
  learners,
}: {
  kpis: KpiRow;
  trend: TrendPoint[];
  learners: LearnerRow[];
}) {
  const completionRate = percent(kpis.completed_enrollments, kpis.total_enrollments);
  const quizPassRate = percent(kpis.quizzes_passed, kpis.quizzes_taken);
  const atRisk = learners.filter((l) => l.status === 'at_risk').length;

  const statusCounts = STATUS_ORDER.map((status) => ({
    label: LEARNER_STATUS_LABEL[status],
    value: learners.filter((l) => l.status === status).length,
    className: STATUS_FILL[status],
  }));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Engagement</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Learners" value={kpis.total_learners} hint={`${kpis.never_started} never started`} />
          <StatTile label="Active (7 days)" value={kpis.active_learners_7d} tone="info"
            hint={`${kpis.active_learners_30d} in the last 30 days`} />
          <StatTile label="At risk" value={atRisk} tone={atRisk > 0 ? 'bad' : 'good'}
            hint="Inactive 30d+ or past a required deadline" />
          <StatTile label="Completion rate" value={`${completionRate}%`}
            tone={completionRate >= 70 ? 'good' : completionRate >= 40 ? 'warn' : 'bad'}
            hint={`${kpis.completed_enrollments} of ${kpis.total_enrollments} enrolments`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Learning volume</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Lessons completed" value={kpis.lessons_completed} />
          {/* The two time tiles are separate BY DESIGN. Credited is authored
              duration for completed lessons; measured is real heartbeat data
              that only exists from 2026-07-29. Averaging them together would
              present an estimate as a measurement. */}
          <StatTile label="Credited learning time" value={formatHours(kpis.credited_seconds)}
            hint="Authored duration of completed lessons" />
          <StatTile label="Measured learning time" value={formatHours(kpis.measured_seconds)}
            tone={kpis.measured_seconds > 0 ? 'default' : 'warn'}
            hint={kpis.measured_seconds > 0 ? 'Observed time on task' : 'Collecting since 29 Jul 2026'} />
          <StatTile label="Median days to finish a course"
            value={formatDays(kpis.median_days_to_complete)}
            hint="From enrolment to completion" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Assessment</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Quiz pass rate" value={`${quizPassRate}%`}
            tone={quizPassRate >= 70 ? 'good' : quizPassRate >= 50 ? 'warn' : 'bad'}
            hint={`${kpis.quizzes_passed} of ${kpis.quizzes_taken} attempts`} />
          <StatTile label="Average quiz score"
            value={kpis.avg_quiz_score === null ? '—' : `${kpis.avg_quiz_score}%`} />
          <StatTile label="Time in quizzes" value={formatHours(kpis.quiz_seconds)}
            hint="Measured — quizzes have always been timed" />
          <StatTile label="Attempts" value={kpis.quizzes_taken} />
        </div>
      </section>

      {/* Three separate charts rather than one with overlaid series. Lessons
          completed peaks around 100 a week while active learners peaks at 5;
          on a shared axis the smaller series is a flat line one pixel tall,
          present in the legend and invisible in the chart. Each series gets
          its own scale so each is actually readable. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Lessons completed</CardTitle>
            <CardDescription className="text-slate-400">Per week, last 12 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendBars
              data={trend.map((t) => ({ label: weekLabel(t.week_start), value: t.lessons_completed }))}
              valueLabel="lessons"
            />
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Courses completed</CardTitle>
            <CardDescription className="text-slate-400">
              A whole course finished, not individual lessons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendBars
              data={trend.map((t) => ({ label: weekLabel(t.week_start), value: t.courses_completed }))}
              valueLabel="courses"
            />
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Active learners</CardTitle>
            <CardDescription className="text-slate-400">
              Distinct learners who opened a lesson that week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendBars
              data={trend.map((t) => ({ label: weekLabel(t.week_start), value: t.active_learners }))}
              valueLabel="learners"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">Where the cohort stands</CardTitle>
          <CardDescription className="text-slate-400">
            Every learner in exactly one bucket. &ldquo;At risk&rdquo; means no activity for 30 days or a
            required course past its deadline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StackedBar segments={statusCounts} />
        </CardContent>
      </Card>
    </div>
  );
}
