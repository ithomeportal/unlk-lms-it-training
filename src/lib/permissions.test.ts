import { describe, expect, it } from 'vitest';
import { User } from './types';
import {
  ROLES,
  Role,
  canExportData,
  canManage,
  canViewAdmin,
  hasFullUserVisibility,
  isAuditor,
  isSuperAdmin,
  roleBadgeClass,
  roleLabel,
} from './permissions';

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

  it('falls back to Learner for unknown roles', () => {
    expect(roleLabel('root')).toBe('Learner');
    expect(roleLabel(null)).toBe('Learner');
  });

  it('gives every role a badge class', () => {
    for (const role of ROLES) expect(roleBadgeClass(role)).toMatch(/border-/);
    expect(roleBadgeClass('root')).toBe(roleBadgeClass('learner'));
  });
});
