import { describe, expect, it } from 'vitest';
import { User } from './types';
import {
  ASSIGNABLE_ROLES,
  ROLES,
  Role,
  canExportData,
  canManage,
  canManageRoles,
  canViewAdmin,
  hasFullUserVisibility,
  isAuditor,
  isSuperAdmin,
  isValidRole,
  roleBadgeClass,
  roleLabel,
} from './permissions';
import { excludeSystemAccountsSql, systemAccountEmails } from './system-accounts';

function asUser(role: Role): User {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    email: `${role}@unilinktransportation.com`,
    name: role,
    avatar_url: null,
    role,
    is_active: true,
    last_login_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/**
 * The authoritative permission matrix. If a change to permissions.ts requires
 * editing this table, that change is a policy decision — make it deliberately.
 */
const MATRIX: Record<Role, {
  canManage: boolean;
  canViewAdmin: boolean;
  canExportData: boolean;
  hasFullUserVisibility: boolean;
}> = {
  super_admin: { canManage: true,  canViewAdmin: true,  canExportData: true,  hasFullUserVisibility: true  },
  admin:       { canManage: true,  canViewAdmin: true,  canExportData: false, hasFullUserVisibility: false },
  auditor:     { canManage: false, canViewAdmin: true,  canExportData: true,  hasFullUserVisibility: true  },
  instructor:  { canManage: false, canViewAdmin: false, canExportData: false, hasFullUserVisibility: false },
  learner:     { canManage: false, canViewAdmin: false, canExportData: false, hasFullUserVisibility: false },
};

describe('permission matrix', () => {
  for (const role of ROLES) {
    const expected = MATRIX[role];
    const user = asUser(role);

    it(`${role}: canManage=${expected.canManage}`, () => {
      expect(canManage(user)).toBe(expected.canManage);
    });

    it(`${role}: canViewAdmin=${expected.canViewAdmin}`, () => {
      expect(canViewAdmin(user)).toBe(expected.canViewAdmin);
    });

    it(`${role}: canExportData=${expected.canExportData}`, () => {
      expect(canExportData(user)).toBe(expected.canExportData);
    });

    it(`${role}: hasFullUserVisibility=${expected.hasFullUserVisibility}`, () => {
      expect(hasFullUserVisibility(user)).toBe(expected.hasFullUserVisibility);
    });
  }
});

describe('auditor is strictly read-only', () => {
  const auditor = asUser('auditor');

  it('can never manage — this is the whole point of the role', () => {
    expect(canManage(auditor)).toBe(false);
  });

  it('is not a super admin', () => {
    expect(isSuperAdmin(auditor)).toBe(false);
  });

  it('is identified as an auditor', () => {
    expect(isAuditor(auditor)).toBe(true);
  });

  it('sees the admin panel and every user, and can export', () => {
    expect(canViewAdmin(auditor)).toBe(true);
    expect(hasFullUserVisibility(auditor)).toBe(true);
    expect(canExportData(auditor)).toBe(true);
  });

  it('the read gate is a strict superset of the write gate', () => {
    for (const role of ROLES) {
      const user = asUser(role);
      if (canManage(user)) expect(canViewAdmin(user)).toBe(true);
    }
  });
});

describe('gates return plain booleans, not type predicates', () => {
  // A `user is User` predicate narrows the NEGATIVE branch to `null`/`never`,
  // which is false for a wrong-role user and pushes callers toward `as User`.
  it('a denied non-null user is still a usable object', () => {
    const auditor = asUser('auditor');
    expect(canManage(auditor)).toBe(false);
    // If canManage were a predicate this branch would type `auditor` as null.
    expect(canViewAdmin(auditor) && !canManage(auditor)).toBe(true);
    expect(auditor.email).toContain('@');
  });
});

describe('null / unknown input is denied', () => {
  for (const gate of [canManage, canViewAdmin, canExportData, hasFullUserVisibility, isSuperAdmin, isAuditor]) {
    it(`${gate.name} denies null and undefined`, () => {
      expect(gate(null)).toBe(false);
      expect(gate(undefined)).toBe(false);
    });
  }

  it('an unrecognised role gets no privileges', () => {
    const rogue = { ...asUser('learner'), role: 'root' } as unknown as User;
    expect(canManage(rogue)).toBe(false);
    expect(canViewAdmin(rogue)).toBe(false);
    expect(canExportData(rogue)).toBe(false);
  });
});

describe('role presentation', () => {
  it('labels every role distinctly', () => {
    const labels = ROLES.map(roleLabel);
    expect(new Set(labels).size).toBe(ROLES.length);
    expect(roleLabel('auditor')).toBe('Auditor');
    expect(roleLabel('super_admin')).toBe('Super Administrator');
  });

  it('shows an unknown role verbatim rather than disguising it as Learner', () => {
    // In an oversight UI, mapping an unrecognised role to the least
    // privileged name would hide it. Show what is actually in the column.
    expect(roleLabel('root')).toBe('root');
    expect(roleLabel(null)).toBe('Learner');
    expect(roleLabel(undefined)).toBe('Learner');
  });

  it('gives every role a badge class', () => {
    for (const role of ROLES) expect(roleBadgeClass(role)).toMatch(/border-/);
    expect(roleBadgeClass('root')).toBe(roleBadgeClass('learner'));
  });
});

// --- role assignment (PATCH /api/admin/users/[id]/role) ---

describe('canManageRoles', () => {
  it('admits super_admin only', () => {
    expect(canManageRoles(asUser('super_admin'))).toBe(true);
    for (const role of ['admin', 'auditor', 'instructor', 'learner'] as Role[]) {
      expect(canManageRoles(asUser(role))).toBe(false);
    }
  });

  it('is STRICTLY narrower than canManage', () => {
    // The whole point of the gate. An `admin` passes canManage and must still
    // be refused here: otherwise they could grant themselves super_admin, or
    // hand out `auditor` — unrestricted visibility of every learner's activity
    // — as though it were a content permission.
    const admin = asUser('admin');
    expect(canManage(admin)).toBe(true);
    expect(canManageRoles(admin)).toBe(false);
  });

  it('rejects a missing user', () => {
    expect(canManageRoles(null)).toBe(false);
    expect(canManageRoles(undefined)).toBe(false);
  });
});

describe('isValidRole', () => {
  it('accepts every role the DB CHECK constraint accepts', () => {
    for (const role of ROLES) expect(isValidRole(role)).toBe(true);
  });

  it("rejects 'user', which does not exist in this platform", () => {
    // The DB constraint rejects it too, but failing here turns a 500 into a
    // 400 that says what the allowed values are.
    expect(isValidRole('user')).toBe(false);
  });

  it('rejects non-strings and near-misses', () => {
    for (const bad of ['', 'SUPER_ADMIN', 'superadmin', 'root', null, undefined, 1, {}, []]) {
      expect(isValidRole(bad)).toBe(false);
    }
  });
});

describe('ASSIGNABLE_ROLES', () => {
  it('never offers a role the database would reject', () => {
    for (const role of ASSIGNABLE_ROLES) expect(isValidRole(role)).toBe(true);
  });
});

// --- system account exclusion (see system-accounts.ts) ---

describe('system account exclusion', () => {
  it('excludes the health monitor by default', () => {
    expect(systemAccountEmails()).toContain('monitor@unilinkportal.com');
  });

  it('builds a predicate against the given column', () => {
    expect(excludeSystemAccountsSql('u.email'))
      .toBe("lower(u.email) NOT IN ('monitor@unilinkportal.com')");
  });

  it('refuses to interpolate a malformed address', () => {
    const prev = process.env.HEALTH_MONITOR_EMAIL;
    process.env.HEALTH_MONITOR_EMAIL = "x'; DROP TABLE users; --";
    try {
      expect(() => excludeSystemAccountsSql('u.email')).toThrow(/malformed/);
    } finally {
      if (prev === undefined) delete process.env.HEALTH_MONITOR_EMAIL;
      else process.env.HEALTH_MONITOR_EMAIL = prev;
    }
  });
});
