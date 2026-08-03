'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { canExportData } from '@/lib/permissions';
import type { User } from '@/lib/types';
import type {
  ComplianceRow,
  ComplianceSummary,
  CourseRow,
  CurvePoint,
  KpiRow,
  LearnerRow,
  TrendPoint,
} from '@/lib/reports/types';
import { cn } from '@/lib/utils';
import { SummaryTab } from './summary-tab';
import { LearnersTab } from './learners-tab';
import { CoursesTab } from './courses-tab';
import { CurveTab } from './curve-tab';
import { ComplianceTab } from './compliance-tab';

const TABS = [
  { id: 'summary', label: 'Executive summary' },
  { id: 'learners', label: 'Learners' },
  { id: 'courses', label: 'Courses' },
  { id: 'curve', label: 'Learning curve' },
  { id: 'compliance', label: 'Compliance' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Which tabs a CSV export exists for. Summary and curve are charts, not tables. */
const EXPORTABLE: Partial<Record<TabId, string>> = {
  learners: 'learners',
  courses: 'courses',
  compliance: 'compliance',
};

interface ReportBundle {
  kpis: KpiRow;
  trend: TrendPoint[];
  learners: LearnerRow[];
  courses: CourseRow[];
  compliance: { rows: ComplianceRow[]; summary: ComplianceSummary };
  curve: CurvePoint[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Request failed: ${url}`);
  }
  return body.data as T;
}

export default function AdminReportsPage() {
  const [tab, setTab] = useState<TabId>('summary');
  const [data, setData] = useState<ReportBundle | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  // Reports describe the CURRENT workforce by default. Employment status is
  // mirrored nightly from the Time-Off app; people who have left are hidden
  // unless this is switched on, because their frozen progress is not a training
  // gap anyone can act on. The data stays one click away rather than deleted.
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (searchTerm: string, withInactive: boolean) => {
    setError(null);
    try {
      // The cohort flag goes to EVERY tab, not just the learner list. Sending it
      // to some and not others is how the headline KPI stopped agreeing with the
      // table underneath it in the first place.
      const params = new URLSearchParams();
      if (withInactive) params.set('includeInactive', '1');
      const scopeQs = params.toString() ? `?${params}` : '';

      const learnerParams = new URLSearchParams(params);
      if (searchTerm) learnerParams.set('search', searchTerm);
      const learnerQs = learnerParams.toString() ? `?${learnerParams}` : '';

      // All five requests in flight together. The previous implementation ran
      // six queries in series inside one route.
      const [summary, learners, courses, compliance, curve] = await Promise.all([
        getJson<{ kpis: KpiRow; trend: TrendPoint[] }>(`/api/admin/reports${scopeQs}`),
        getJson<{ learners: LearnerRow[] }>(`/api/admin/reports/learners${learnerQs}`),
        getJson<{ courses: CourseRow[] }>(`/api/admin/reports/courses${scopeQs}`),
        getJson<{ rows: ComplianceRow[]; summary: ComplianceSummary }>(
          `/api/admin/reports/compliance${scopeQs}`
        ),
        getJson<{ points: CurvePoint[] }>(`/api/admin/reports/curve${scopeQs}`),
      ]);

      setData({
        kpis: summary.kpis,
        trend: summary.trend,
        learners: learners.learners,
        courses: courses.courses,
        compliance,
        curve: curve.points,
      });
    } catch (err) {
      // Surfaced in the UI, not just swallowed to a spinner that never stops.
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search, includeInactive), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, includeInactive, load]);

  const exportView = EXPORTABLE[tab];

  const handleExport = async () => {
    if (!exportView) return;
    setExporting(true);
    try {
      // The download must match the screen it was taken from — same cohort,
      // same search term.
      const params = new URLSearchParams({ view: exportView });
      if (includeInactive) params.set('includeInactive', '1');
      if (tab === 'learners' && search) params.set('search', search);
      const res = await fetch(`/api/admin/reports/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lms-${exportView}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed — this requires Super Admin or Auditor access.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Reports</h1>
          <p className="mt-1 text-slate-400">
            Course completion, time invested and progress across every learner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'learners' && (
            <Input
              placeholder="Search learners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 bg-slate-800/50 border-slate-700"
            />
          )}
          <Button
            variant="outline"
            onClick={() => setIncludeInactive((v) => !v)}
            aria-pressed={includeInactive}
            className="border-slate-600 text-slate-300 shrink-0"
          >
            {includeInactive ? 'Active employees only' : 'Include former employees'}
          </Button>
          {exportView && canExportData(user) && (
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="border-slate-600 text-slate-300"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        State the cohort on every tab, always. A filtered report and an
        unfiltered one look identical, and the reader has no way to tell which
        one they are holding — that ambiguity is what put two ex-employees in
        front of HR in the first place.
      */}
      <p className="text-xs text-slate-500">
        {includeInactive
          ? `Including former employees${
              data ? ` — ${data.learners.filter((l) => !l.is_active).length} of ${data.learners.length} shown have left the company` : ''
            }.`
          : 'Showing current employees only. Employment status syncs nightly from Time-Off at 03:00 Central.'}
      </p>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 bg-slate-800" />
            ))}
          </div>
          <Skeleton className="h-64 bg-slate-800" />
        </div>
      ) : (
        <>
          {tab === 'summary' && (
            <SummaryTab kpis={data.kpis} trend={data.trend} learners={data.learners} />
          )}
          {tab === 'learners' && <LearnersTab learners={data.learners} />}
          {tab === 'courses' && <CoursesTab courses={data.courses} />}
          {tab === 'curve' && <CurveTab points={data.curve} learners={data.learners} />}
          {tab === 'compliance' && (
            <ComplianceTab rows={data.compliance.rows} summary={data.compliance.summary} />
          )}
        </>
      )}
    </div>
  );
}
