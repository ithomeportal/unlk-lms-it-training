/**
 * Accounts that exist for the system's own use and must not appear in
 * reporting. Today that is the health-check monitor (see SPEC-MONITORING.md),
 * which logs in every 15 minutes and would otherwise sit in the analytics list
 * and skew user counts.
 *
 * Single source of truth: add an address here, not a literal in a query.
 *
 * Scope note: these are filtered out of ANALYTICS and REPORTS only. They are
 * deliberately still listed in /admin/users, so a system account stays
 * discoverable and its deletion is noticeable.
 */
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function systemAccountEmails(): string[] {
  return [(process.env.HEALTH_MONITOR_EMAIL || 'monitor@unilinkportal.com').toLowerCase()]
    .map((e) => e.trim())
    .filter(Boolean);
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
