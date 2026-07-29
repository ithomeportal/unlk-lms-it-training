import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One KPI. Every admin page in this codebase re-implements its own stat card
 * inline; the Reports zone uses this instead so a tile means the same thing
 * wherever it appears.
 *
 * `hint` exists specifically so a number can carry its own caveat — "measured
 * since 29 Jul" next to a learning-time figure that has no history before that
 * date. A KPI with a footnote is honest; a KPI that quietly means something
 * narrower than its label is not.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info';
  className?: string;
}) {
  const toneClass = {
    default: 'text-white',
    good: 'text-green-400',
    warn: 'text-amber-400',
    bad: 'text-red-400',
    info: 'text-blue-400',
  }[tone];

  return (
    <Card className={cn('bg-slate-800/50 border-slate-700', className)}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', toneClass)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}
