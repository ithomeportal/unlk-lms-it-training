import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { execute, queryOne } from '@/lib/db';

/**
 * Deep health check — renders the pages that carry the product and asserts on
 * their CONTENT, not just their status code.
 *
 * Why: on 2026-07-28 /courses/[slug] had been returning 500 for every user for
 * at least six days while every other page was fine. Any uptime check pointed
 * at / or /dashboard stayed green the whole time. A status-only check is also
 * not enough on its own — a 200 that renders an error boundary would pass — so
 * each check asserts a marker that only appears when the page really rendered.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env
 * var is set on the project.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_URL = process.env.HEALTH_BASE_URL || 'https://lms.unilinkportal.com';
const MONITOR_EMAIL = (process.env.HEALTH_MONITOR_EMAIL || 'monitor@unilinkportal.com').toLowerCase();
const ALERT_EMAIL = process.env.HEALTH_ALERT_EMAIL || 'ithome@unilinkportal.com';
const ALERT_COOLDOWN_HOURS = 6;

interface CheckResult {
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  detail: string;
}

/** Compare ignoring case, whitespace and HTML entity escaping. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runCheck(
  name: string,
  path: string,
  cookie: string | null,
  marker: string | null
): Promise<CheckResult> {
  // Each check is fully isolated: one failing route must never prevent the
  // others from running, which is exactly how a single bad statement once hid
  // a multi-day outage.
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: 'manual',
      cache: 'no-store',
    });
    const body = await res.text();

    if (res.status !== 200) {
      return { name, path, ok: false, status: res.status, detail: `expected 200, got ${res.status}` };
    }
    if (marker && !normalize(body).includes(normalize(marker))) {
      return {
        name,
        path,
        ok: false,
        status: res.status,
        detail: `200 but expected content missing (marker: "${marker.slice(0, 40)}")`,
      };
    }
    return { name, path, ok: true, status: res.status, detail: 'ok' };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return {
      name,
      path,
      ok: false,
      status: null,
      detail: `request failed: ${e.code || ''} ${e.message || String(error)}`.trim(),
    };
  }
}

async function shouldAlert(): Promise<boolean> {
  // Alert on transition into failure, or once per cooldown while still broken,
  // so a sustained outage does not send an email every single run.
  const last = await queryOne<{ ok: boolean; alerted_at: string | null }>(`
    SELECT ok, alerted_at FROM health_check_runs
    WHERE alerted_at IS NOT NULL
    ORDER BY ran_at DESC LIMIT 1
  `);
  if (!last?.alerted_at) return true;
  const hours = (Date.now() - new Date(last.alerted_at).getTime()) / 3_600_000;
  return hours >= ALERT_COOLDOWN_HOURS;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = randomUUID();
  let monitorId: string | null = null;
  let checks: CheckResult[] = [];

  try {
    // A published course with at least one lesson — the shape that broke.
    const course = await queryOne<{ slug: string; title: string }>(`
      SELECT c.slug, c.title
      FROM courses c
      WHERE c.is_published = true
        AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id = c.id)
      ORDER BY c.created_at
      LIMIT 1
    `);

    // Dedicated monitoring learner. The session is minted here and deleted at
    // the end of the run, so no long-lived token is stored anywhere.
    const monitor = await queryOne<{ id: string }>(
      `INSERT INTO users (email, name, role)
       VALUES ($1, 'Health Monitor (automated)', 'learner')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [MONITOR_EMAIL]
    );
    monitorId = monitor?.id ?? null;

    if (monitorId) {
      await execute(
        `INSERT INTO sessions (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
        [monitorId, token]
      );
    }

    const cookie = monitorId ? `lms_session=${token}` : null;

    checks = [
      await runCheck('login', '/login', null, 'Unilink'),
      // AppSidebar renders the signed-in user's email, so its presence proves
      // the page rendered AND that the session resolved — a marker of null
      // would let a 200-with-an-error-boundary pass, which is the whole point
      // of this check.
      await runCheck('dashboard', '/dashboard', cookie, MONITOR_EMAIL),
      await runCheck('catalog', '/courses', cookie, course?.title ?? null),
      // The page that was silently broken. Assert the title actually renders.
      await runCheck(
        'course-viewer',
        course ? `/courses/${course.slug}` : '/courses',
        cookie,
        course?.title ?? null
      ),
      await runCheck('profile-api', '/api/profile', cookie, MONITOR_EMAIL),
    ];
  } catch (error) {
    console.error('Health check setup failed:', error);
    checks.push({
      name: 'setup',
      path: '-',
      ok: false,
      status: null,
      detail: `setup failed: ${(error as Error).message}`,
    });
  } finally {
    await execute(`DELETE FROM sessions WHERE token = $1`, [token]).catch(() => {});
  }

  const failures = checks.filter((c) => !c.ok);
  const ok = failures.length === 0;

  let alerted = false;
  if (!ok) {
    try {
      if (await shouldAlert()) {
        const rows = failures
          .map((f) => `<li><strong>${f.name}</strong> <code>${f.path}</code> — ${f.detail}</li>`)
          .join('');
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'Unilink IT Training <noreply@unilinkportal.com>',
          to: ALERT_EMAIL,
          subject: `[LMS] health check FAILED — ${failures.length} check(s)`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px;">
              <h2 style="color:#9b2c2c;">LMS health check failed</h2>
              <p>${failures.length} of ${checks.length} checks failed against
                 <a href="${BASE_URL}">${BASE_URL}</a>.</p>
              <ul>${rows}</ul>
              <p style="color:#718096;font-size:12px;">
                Further emails are suppressed for ${ALERT_COOLDOWN_HOURS}h while this stays broken.
              </p>
            </div>`,
        });
        alerted = true;
      }
    } catch (error) {
      console.error('Health alert email failed:', error);
    }
  }

  try {
    await execute(
      `INSERT INTO health_check_runs (ok, failures, alerted_at)
       VALUES ($1, $2, $3)`,
      [ok, JSON.stringify(failures), alerted ? new Date().toISOString() : null]
    );
  } catch (error) {
    console.error('Failed to record health run:', error);
  }

  // Non-200 on failure so the cron itself shows as failed in Vercel, rather
  // than a green run hiding a red result in its body.
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), baseUrl: BASE_URL, checks },
    { status: ok ? 200 : 500 }
  );
}
