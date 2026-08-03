import { describe, expect, it } from 'vitest';
import { planRosterSync, type LmsUserRow } from './timeoff-roster';
import type { TimeoffEmployee } from './timeoff-db';

/**
 * The nightly roster sync can lock a real person out of the LMS: `is_active` is
 * the login gate, not merely a reporting flag. So these tests are mostly about
 * what the sync must REFUSE to do.
 *
 * Each case names the failure it prevents. If a change here requires editing an
 * expectation, that is a policy decision — make it deliberately.
 */

function employee(over: Partial<TimeoffEmployee> = {}): TimeoffEmployee {
  return { email: 'someone@unilinktransportation.com', name: 'Some One', isActive: true, ...over };
}

function lmsUser(over: Partial<LmsUserRow> = {}): LmsUserRow {
  return { id: 'u1', email: 'someone@unilinktransportation.com', is_active: true, ...over };
}

describe('planRosterSync — the changes it makes', () => {
  it('deactivates an LMS account whose employee has left', () => {
    // The literal case that triggered this work: Eder Gamboa and Luis Brenes
    // were still active in the LMS months after leaving, and the weekly HR
    // email named them.
    const plan = planRosterSync(
      [employee({ email: 'egamboa@unilinktransportation.com', isActive: false })],
      [lmsUser({ id: 'a', email: 'egamboa@unilinktransportation.com', is_active: true })]
    );

    expect(plan.deactivate).toEqual([
      { id: 'a', email: 'egamboa@unilinktransportation.com', isActive: false },
    ]);
    expect(plan.reactivate).toHaveLength(0);
    expect(plan.refusedReason).toBeNull();
  });

  it('reactivates a rehire, so the two systems converge instead of drifting', () => {
    const plan = planRosterSync(
      [employee({ email: 'back@unilinktransportation.com', isActive: true })],
      [lmsUser({ id: 'b', email: 'back@unilinktransportation.com', is_active: false })]
    );

    expect(plan.reactivate).toEqual([
      { id: 'b', email: 'back@unilinktransportation.com', isActive: true },
    ]);
    expect(plan.deactivate).toHaveLength(0);
  });

  it('does nothing when both sides already agree', () => {
    const plan = planRosterSync(
      [employee({ isActive: true }), employee({ email: 'gone@unilinktransportation.com', isActive: false })],
      [lmsUser({ is_active: true }), lmsUser({ id: 'u2', email: 'gone@unilinktransportation.com', is_active: false })]
    );

    expect(plan.deactivate).toHaveLength(0);
    expect(plan.reactivate).toHaveLength(0);
    expect(plan.checked).toBe(2);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    // Time-Off lowercases on write and the LMS query lowercases on read, but a
    // mismatch here would silently mean "not found" — i.e. never deactivated.
    const plan = planRosterSync(
      [employee({ email: 'MiXeD@unilinktransportation.com', isActive: false })],
      [lmsUser({ id: 'c', email: '  mixed@unilinktransportation.com ', is_active: true })]
    );

    expect(plan.deactivate.map((c) => c.id)).toEqual(['c']);
  });
});

describe('planRosterSync — the changes it refuses to make', () => {
  it('refuses everything when the roster comes back empty', () => {
    // An empty read is what a revoked grant or a bad credential looks like.
    // Acting on it would deactivate the entire company in one run.
    const plan = planRosterSync([], [lmsUser({ is_active: true })]);

    expect(plan.refusedReason).toMatch(/empty/i);
    expect(plan.deactivate).toHaveLength(0);
    expect(plan.reactivate).toHaveLength(0);
  });

  it('leaves an LMS user with no Time-Off record alone', () => {
    // monitor@unilinkportal.com has no employee record at all, and neither
    // would a future contractor or service account. "Absent from HR's list" is
    // not evidence of termination.
    const plan = planRosterSync(
      [employee({ email: 'real@unilinktransportation.com', isActive: true })],
      [lmsUser({ id: 'x', email: 'stranger@unilinkportal.com', is_active: true })]
    );

    expect(plan.deactivate).toHaveLength(0);
    expect(plan.unmatched).toEqual(['stranger@unilinkportal.com']);
  });

  it('never touches a system account, even when Time-Off says it is inactive', () => {
    // Deactivating the health monitor would take the 15-minute health check
    // down; deactivating ithome@ would lock out the super_admin service account.
    const plan = planRosterSync(
      [
        employee({ email: 'monitor@unilinkportal.com', isActive: false }),
        employee({ email: 'ithome@unilinkportal.com', isActive: false }),
      ],
      [
        lmsUser({ id: 'm', email: 'monitor@unilinkportal.com', is_active: true }),
        lmsUser({ id: 'i', email: 'ithome@unilinkportal.com', is_active: true }),
      ]
    );

    expect(plan.deactivate).toHaveLength(0);
    expect(plan.checked).toBe(0);
  });

  it('skips rows with a blank e-mail rather than matching them to each other', () => {
    const plan = planRosterSync([employee({ email: '', isActive: false })], [lmsUser({ email: '' })]);

    expect(plan.deactivate).toHaveLength(0);
    expect(plan.checked).toBe(0);
  });
});

describe('planRosterSync — counts reported to the sync log', () => {
  it('counts only accounts it actually considered', () => {
    const plan = planRosterSync(
      [
        employee({ email: 'a@unilinktransportation.com', isActive: false }),
        employee({ email: 'b@unilinktransportation.com', isActive: true }),
      ],
      [
        lmsUser({ id: '1', email: 'a@unilinktransportation.com', is_active: true }),
        lmsUser({ id: '2', email: 'b@unilinktransportation.com', is_active: true }),
        lmsUser({ id: '3', email: 'nobody@unilinkportal.com', is_active: true }),
        lmsUser({ id: '4', email: 'monitor@unilinkportal.com', is_active: true }),
      ]
    );

    // 3 considered (the monitor is excluded before counting), 1 of them unmatched.
    expect(plan.checked).toBe(3);
    expect(plan.unmatched).toEqual(['nobody@unilinkportal.com']);
    expect(plan.deactivate).toHaveLength(1);
  });
});
