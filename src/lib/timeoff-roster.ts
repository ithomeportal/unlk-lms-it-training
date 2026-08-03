import { systemAccountEmails } from '@/lib/system-accounts';
import type { TimeoffEmployee } from '@/lib/timeoff-db';

/**
 * Decide what the nightly roster sync should change — as a pure function, so
 * every safety rule below is unit-testable without a database.
 *
 * The rules exist because this sync can lock a real person out of the LMS:
 * `users.is_active` is not only a reporting flag, it is the login gate
 * (`auth.ts` refuses both sign-in and session resumption when it is false). So
 * the bias is always toward doing nothing.
 *
 * 1. **Match on lowercased e-mail, never on name.** Two different people here
 *    share the first name Daniela; the LMS has already had a near-miss granting
 *    a role by name.
 * 2. **A user with no Time-Off row is left alone.** The health monitor
 *    (`monitor@unilinkportal.com`) has no employee record at all, and neither
 *    would any future service or contractor account. "Absent from HR's list" is
 *    not evidence of termination.
 * 3. **System accounts are never touched in either direction**, even if they do
 *    appear in Time-Off.
 * 4. **Symmetric.** A rehire (inactive here, active there) is reactivated, so
 *    the two systems converge instead of drifting one way.
 * 5. **An empty roster produces no changes at all** — see `planRosterSync`'s
 *    `rosterEmpty` guard. A read that returns zero rows is what a broken
 *    credential looks like, and acting on it would deactivate the whole company.
 */

export interface LmsUserRow {
  id: string;
  email: string;
  is_active: boolean;
}

export interface RosterChange {
  id: string;
  email: string;
  /** What we are setting `is_active` to. */
  isActive: boolean;
}

export interface RosterPlan {
  deactivate: RosterChange[];
  reactivate: RosterChange[];
  /** LMS users with no Time-Off row — deliberately untouched. */
  unmatched: string[];
  /** LMS users considered at all (system accounts already removed). */
  checked: number;
  /**
   * Set when the roster looked unusable. The caller must write nothing and
   * report failure — never treat this as "no changes needed".
   */
  refusedReason: string | null;
}

/**
 * Build the change set. `roster` is the full Time-Off employee list (active and
 * inactive); `lmsUsers` is every row in the LMS `users` table.
 */
export function planRosterSync(roster: TimeoffEmployee[], lmsUsers: LmsUserRow[]): RosterPlan {
  const empty: RosterPlan = {
    deactivate: [],
    reactivate: [],
    unmatched: [],
    checked: 0,
    refusedReason: null,
  };

  if (roster.length === 0) {
    return {
      ...empty,
      refusedReason:
        'Time-Off roster came back empty — refusing to change any account. An empty read is what a revoked grant looks like, not a company with no employees.',
    };
  }

  const byEmail = new Map<string, TimeoffEmployee>();
  for (const e of roster) {
    const key = e.email.trim().toLowerCase();
    if (key) byEmail.set(key, e);
  }

  const protectedEmails = new Set(systemAccountEmails());

  const plan: RosterPlan = { ...empty, deactivate: [], reactivate: [], unmatched: [] };

  for (const user of lmsUsers) {
    const key = (user.email ?? '').trim().toLowerCase();
    if (!key || protectedEmails.has(key)) continue;

    plan.checked += 1;

    const employee = byEmail.get(key);
    if (!employee) {
      plan.unmatched.push(key);
      continue;
    }

    if (user.is_active && !employee.isActive) {
      plan.deactivate.push({ id: user.id, email: key, isActive: false });
    } else if (!user.is_active && employee.isActive) {
      plan.reactivate.push({ id: user.id, email: key, isActive: true });
    }
  }

  return plan;
}
