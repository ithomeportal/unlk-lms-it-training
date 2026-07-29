/**
 * Chart primitives for the Reports zone.
 *
 * Deliberately hand-written SVG rather than a charting library. recharts (the
 * dependency shadcn's chart component pulls in) is ~500KB, ships its own React
 * reconciler surface, and would be the largest thing in the bundle by some
 * margin — for four chart shapes. It would also have to clear
 * scripts/check-server-bundle.mjs, the postbuild guard that already blocks
 * browser-only packages from reaching the server bundle.
 *
 * Everything here is pure markup: no effects, no refs, no measurement. That
 * means these render identically on the server and in the browser, and they
 * degrade to a static picture with JavaScript disabled.
 */

import { cn } from '@/lib/utils';

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  // Round up to 1/2/5 x 10^n so the axis label is a number a human would pick.
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export interface BarDatum {
  label: string;
  value: number;
  /** Optional second series drawn behind, e.g. active learners behind lessons. */
  secondary?: number;
}

/**
 * Weekly activity bars. Bars are drawn in a 0..100 viewBox and stretched by
 * CSS, so the chart is fluid without measuring the container.
 */
export function TrendBars({
  data,
  height = 160,
  className,
  valueLabel = 'value',
  secondaryLabel,
}: {
  data: BarDatum[];
  height?: number;
  className?: string;
  valueLabel?: string;
  secondaryLabel?: string;
}) {
  if (data.length === 0) {
    return <EmptyChart height={height} message="No activity in this period" />;
  }

  const max = niceMax(data.flatMap((d) => [d.value, d.secondary ?? 0]));
  const slot = 100 / data.length;
  const barWidth = slot * 0.56;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${valueLabel} by week`}
      >
        {/* Gridlines at 0/50/100% of the axis. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2="100"
            y1={height - f * (height - 18)}
            y2={height - f * (height - 18)}
            stroke="currentColor"
            className="text-slate-700"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {data.map((d, i) => {
          const x = i * slot + (slot - barWidth) / 2;
          const h = (d.value / max) * (height - 18);
          const hSecondary = ((d.secondary ?? 0) / max) * (height - 18);
          return (
            <g key={d.label}>
              {d.secondary !== undefined && (
                <rect
                  x={x - barWidth * 0.18}
                  y={height - 18 - hSecondary}
                  width={barWidth}
                  height={Math.max(hSecondary, 0)}
                  className="fill-slate-600/50"
                  rx="0.6"
                />
              )}
              <rect
                x={x}
                y={height - 18 - h}
                width={barWidth}
                height={Math.max(h, d.value > 0 ? 1.5 : 0)}
                className="fill-blue-500"
                rx="0.6"
              />
            </g>
          );
        })}
      </svg>

      {/* Labels sit outside the SVG so `preserveAspectRatio="none"` cannot
          stretch the text horizontally. */}
      <div className="flex text-[10px] text-slate-500">
        {data.map((d, i) => (
          <span key={d.label} className="flex-1 text-center truncate">
            {i % 2 === 0 ? d.label : ''}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
        <Legend className="bg-blue-500" label={valueLabel} />
        {secondaryLabel && <Legend className="bg-slate-600" label={secondaryLabel} />}
        <span className="ml-auto text-slate-500">peak {max}</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2 w-2 rounded-sm', className)} />
      {label}
    </span>
  );
}

function EmptyChart({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-slate-700 text-sm text-slate-500"
      style={{ height }}
    >
      {message}
    </div>
  );
}

export interface CurveSeries {
  id: string;
  label: string;
  points: number[];
}

const SERIES_COLOURS = [
  'stroke-blue-400',
  'stroke-emerald-400',
  'stroke-amber-400',
  'stroke-purple-400',
  'stroke-pink-400',
  'stroke-cyan-400',
  'stroke-orange-400',
  'stroke-lime-400',
];

/**
 * Cumulative learning curves, one line per learner.
 *
 * All series share one Y scale on purpose: the comparison between learners is
 * the entire point, and per-series normalisation would make someone who
 * finished three lessons look identical to someone who finished eighty.
 */
export function CurveChart({
  series,
  xLabels,
  height = 220,
  className,
}: {
  series: CurveSeries[];
  xLabels: string[];
  height?: number;
  className?: string;
}) {
  if (series.length === 0 || xLabels.length < 2) {
    return <EmptyChart height={height} message="Not enough history to plot a curve yet" />;
  }

  const max = niceMax(series.flatMap((s) => s.points));
  const plotHeight = height - 16;
  const stepX = 100 / (xLabels.length - 1);

  const path = (points: number[]) =>
    points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(2)} ${(plotHeight - (v / max) * plotHeight).toFixed(2)}`)
      .join(' ');

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Cumulative lessons completed per learner, by week"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2="100"
            y1={plotHeight - f * plotHeight}
            y2={plotHeight - f * plotHeight}
            stroke="currentColor"
            className="text-slate-800"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s, i) => (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            className={SERIES_COLOURS[i % SERIES_COLOURS.length]}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="flex text-[10px] text-slate-500">
        {xLabels.map((l, i) => (
          <span key={l} className="flex-1 text-center truncate">
            {i % 2 === 0 ? l : ''}
          </span>
        ))}
      </div>

      {/* Separated from the axis labels above: without the rule, the learner
          names sit flush under the week labels in the same size and colour and
          the two rows read as one confusing strip. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
        {series.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            {/* A 0.5px rule was invisible against the dark card, leaving the
                names unmappable to their lines. */}
            <span
              className={cn(
                'inline-block h-1.5 w-5 shrink-0 rounded-full',
                SERIES_COLOURS[i % SERIES_COLOURS.length].replace('stroke-', 'bg-')
              )}
            />
            <span className="truncate max-w-[14rem]">{s.label}</span>
          </span>
        ))}
        <span className="ml-auto text-slate-500">peak {max} lessons</span>
      </div>
    </div>
  );
}

export interface StackSegment {
  label: string;
  value: number;
  className: string;
}

/** Single stacked bar — used for the compliance and learner-status breakdowns. */
export function StackedBar({ segments, className }: { segments: StackSegment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className={cn('text-sm text-slate-500', className)}>Nothing to report yet</p>;
  }

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              className={s.className}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={cn('inline-block h-2 w-2 rounded-sm', s.className)} />
              {s.label} <span className="text-slate-500">{s.value}</span>
            </span>
          ))}
      </div>
    </div>
  );
}

/** Inline proportion bar for a table cell. */
export function MiniBar({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-700', className)}>
      <div
        className={cn(
          'h-full rounded-full',
          clamped >= 100 ? 'bg-green-500' : clamped >= 50 ? 'bg-blue-500' : 'bg-amber-500'
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
