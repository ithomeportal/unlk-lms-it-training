/**
 * Accounts that are not learners and must not appear in reporting.
 *
 * Two kinds live here:
 *
 * 1. **Automated** — the health-check monitor (see SPEC-MONITORING.md), which
 *    logs in every 15 minutes and would otherwise sit at the top of the
 *    analytics list and dominate the activity feed.
 * 2. **Operator** — the people who administer and build the platform. They have
 *    real sessions and real enrolments from testing content, but they are not
 *    being trained, so counting them makes the cohort look worse than it is:
 *    they inflate `total_learners` and `never_started`, drag the completion rate
 *    down, and show up in the weekly HR email's "needs attention" list as
 *    at-risk learners. Added 2026-07-29 at the platform owner's direction.
 *
 * Single source of truth: add an address HERE, not a literal in a query.
 *
 * Deliberately literals rather than a new env var. An env-driven list of "which
 * humans are not students" drifts silently between environments — unset in one
 * place and every reported number quietly changes — and on Vercel it would also
 * need a rebuild to take effect, because env is snapshotted at build time. A
 * literal in this file is versioned, reviewable and identical everywhere.
 * `HEALTH_MONITOR_EMAIL` keeps its override because the monitor's address is
 * genuinely environment-specific.
 *
 * Scope note: these are filtered out of ANALYTICS and REPORTS aggregates only.
 * They are deliberately still listed in /admin/users, and their individual
 * detail page (`/api/admin/analytics/[userId]`) does NOT filter — so an excluded
 * account stays discoverable and inspectable, and its deletion is noticeable.
 */
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Operator accounts: administer or build the platform, are not being trained.
 *
 * Only the super_admin SERVICE account. The platform owner
 * (`dfrodriguez@unilinktransportation.com`) was briefly excluded here on
 * 2026-07-29 and deliberately put back the same day: unlike `ithome@`, they take
 * the courses for real, so their progress is genuine training activity and
 * belongs in the numbers. The distinction is "does this account learn", not "does
 * this person also administer the platform".
 */
const OPERATOR_EMAILS = [
  'ithome@unilinkportal.com', // IT Home Admin — the super_admin service account
] as const;

export function systemAccountEmails(): string[] {
  const monitor = process.env.HEALTH_MONITOR_EMAIL || 'monitor@unilinkportal.com';
  // Deduplicated: if HEALTH_MONITOR_EMAIL is ever pointed at an operator
  // account, the same address twice would produce `NOT IN ('x', 'x')`.
  return [...new Set([monitor, ...OPERATOR_EMAILS].map((e) => e.trim().toLowerCase()))].filter(
    Boolean
  );
}

/**
 * SQL predicate excluding system accounts, e.g.
 *   `lower(u.email) NOT IN ('monitor@unilinkportal.com')`
 *
 * Returns a literal rather than a bound parameter on purpose: the analytics
 * query numbers its placeholders by hand ($1..$4, with the indexes shifting
 * depending on whether a search term is present), and adding a parameter there
 * is exactly the kind of renumbering that silently breaks a WHERE clause.
 *
 * Safe because the values never come from a request: they are config, and each
 * one is validated against a strict e-mail pattern before interpolation — an
 * unexpected value throws rather than reaching the database. `emailColumn` is
 * always a developer-supplied identifier.
 */
export function excludeSystemAccountsSql(emailColumn: string): string {
  const emails = systemAccountEmails();
  if (emails.length === 0) return 'TRUE';

  const list = emails
    .map((email) => {
      if (!EMAIL_RE.test(email)) {
        throw new Error(`Refusing to build SQL for malformed system account address: ${email}`);
      }
      return `'${email}'`;
    })
    .join(', ');

  return `lower(${emailColumn}) NOT IN (${list})`;
}
