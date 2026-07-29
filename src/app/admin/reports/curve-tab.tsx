'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CurveChart, type CurveSeries } from '@/components/reports/charts';
import { StatTile } from '@/components/reports/stat-tile';
import type { CurvePoint, LearnerRow } from '@/lib/reports/types';

/** Legibility ceiling — more than eight lines and the chart is a hairball. */
const MAX_SERIES = 8;

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The learning curve proper: cumulative lessons completed per learner, by week.
 *
 * A single progress percentage cannot distinguish a learner who worked steadily
 * for eight weeks from one who did everything in a single afternoon and has not
 * returned since. The shape of the line can: steady slope, early burst then
 * flat, or a plateau that started three weeks ago.
 */
export function CurveTab({ points, learners }: { points: CurvePoint[]; learners: LearnerRow[] }) {
  const [showAll, setShowAll] = useState(false);

  const weeks = useMemo(
    () => Array.from(new Set(points.map((p) => p.week_start))).sort(),
    [points]
  );

  const series = useMemo<CurveSeries[]>(() => {
    const byUser = new Map<string, CurvePoint[]>();
    for (const p of points) {
      const list = byUser.get(p.user_id) ?? [];
      list.push(p);
      byUser.set(p.user_id, list);
    }

    const all = [...byUser.entries()]
      .map(([userId, rows]) => {
        const ordered = [...rows].sort((a, b) => a.week_start.localeCompare(b.week_start));
        const head = ordered[0];
        return {
          id: userId,
          label: head?.name || head?.email.split('@')[0] || 'Unknown',
          points: weeks.map((w) => ordered.find((r) => r.week_start === w)?.cumulative ?? 0),
          total: ordered[ordered.length - 1]?.cumulative ?? 0,
        };
      })
      // Most-progressed first, so the default eight lines are the ones with the
      // most shape to them rather than an arbitrary alphabetical slice.
      .sort((a, b) => b.total - a.total);

    return showAll ? all : all.slice(0, MAX_SERIES);
  }, [points, weeks, showAll]);

  const totalLearners = new Set(points.map((p) => p.user_id)).size;

  // Movers: learners whose completions in the last 30 days exceed the 30 before.
  const accelerating = learners.filter((l) => l.momentum === 'up').length;
  const decelerating = learners.filter((l) => l.momentum === 'down').length;
  const plateaued = learners.filter(
    (l) => l.completions_recent === 0 && l.lessons_completed > 0 && l.progress_percent < 100
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Learners with a curve" value={totalLearners} hint="At least one completed lesson" />
        <StatTile label="Accelerating" value={accelerating} tone="good" hint="More completions than the prior 30 days" />
        <StatTile label="Slowing down" value={decelerating} tone="warn" hint="Fewer than the prior 30 days" />
        <StatTile label="Plateaued" value={plateaued} tone={plateaued > 0 ? 'bad' : 'good'}
          hint="Started, unfinished, nothing in 30 days" />
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-white text-base">Cumulative lessons completed</CardTitle>
              <CardDescription className="text-slate-400">
                One line per learner over the last 12 weeks. A rising line is steady progress; a flat
                stretch is a stall. All lines share one scale so learners are directly comparable.
              </CardDescription>
            </div>
            {totalLearners > MAX_SERIES && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
                className="border-slate-600 text-slate-300 shrink-0"
              >
                {showAll ? `Top ${MAX_SERIES} only` : `Show all ${totalLearners}`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <CurveChart series={series} xLabels={weeks.map(weekLabel)} />
          {!showAll && totalLearners > MAX_SERIES && (
            // Never let a chart imply it shows everything when it does not.
            <p className="mt-3 text-xs text-slate-500">
              Showing the {MAX_SERIES} learners with the most completions of {totalLearners}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
