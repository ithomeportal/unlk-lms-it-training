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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (searchTerm: string) => {
    setError(null);
    try {
      // All five requests in flight together. The previous implementation ran
      // six queries in series inside one route.
      const qs = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const [summary, learners, courses, compliance, curve] = await Promise.all([
        getJson<{ kpis: KpiRow; trend: TrendPoint[] }>('/api/admin/reports'),
        getJson<{ learners: LearnerRow[] }>(`/api/admin/reports/learners${qs}`),
        getJson<{ courses: CourseRow[] }>('/api/admin/reports/courses'),
        getJson<{ rows: ComplianceRow[]; summary: ComplianceSummary }>('/api/admin/reports/compliance'),
        getJson<{ points: CurvePoint[] }>('/api/admin/reports/curve'),
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
    const t = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const exportView = EXPORTABLE[tab];

  const handleExport = async () => {
    if (!exportView) return;
    setExporting(true);
    try {
      const qs = tab === 'learners' && search ? `&search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/reports/export?view=${exportView}${qs}`);
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
