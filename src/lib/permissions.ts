import { User } from './types';

/**
 * Central authorization policy. This is the ONLY place role literals are
 * compared — every guard (API route, server layout, sidebar) must call a
 * helper from this file rather than re-implementing the comparison.
 *
 * Roles, least to most privileged:
 *   learner    — the default; courses, quizzes, search, own profile
 *   instructor — reserved; currently identical to learner (no runtime checks)
 *   auditor    — READ-ONLY oversight: sees the whole admin panel's read
 *                surface (all user activity, reports, analytics, exports)
 *                but can never create, edit or delete anything
 *   admin      — full management of content (courses, lessons, quizzes,
 *                categories, RAG review); cannot export bulk user data
 *   super_admin— everything
 */
export type Role = 'super_admin' | 'admin' | 'auditor' | 'instructor' | 'learner';

export const ROLES: readonly Role[] = [
  'super_admin',
  'admin',
  'auditor',
  'instructor',
  'learner',
] as const;

/** Roles allowed to MUTATE anything in the admin panel. */
const MANAGE_ROLES: readonly Role[] = ['super_admin', 'admin'] as const;

/** Roles allowed to READ the admin panel (a superset of MANAGE_ROLES). */
const VIEW_ADMIN_ROLES: readonly Role[] = ['super_admin', 'admin', 'auditor'] as const;

/** Roles allowed to export bulk user-activity data. */
const EXPORT_ROLES: readonly Role[] = ['super_admin', 'auditor'] as const;

/** Roles whose oversight is unrestricted — they see every user's rows, including super_admins. */
const FULL_VISIBILITY_ROLES: readonly Role[] = ['super_admin', 'auditor'] as const;

// These are type predicates so that `if (!canViewAdmin(user)) return 401;`
// narrows `user` to a non-null User in the code that follows — the same
// narrowing the old `!user || !isAdmin(user)` form provided.
function hasRole(user: User | null | undefined, roles: readonly Role[]): user is User {
  return !!user && roles.includes(user.role as Role);
}

/**
 * WRITE gate. Guard EVERY POST / PUT / PATCH / DELETE handler and every
 * management page with this. An auditor must never pass it.
 */
export function canManage(user: User | null | undefined): user is User {
  return hasRole(user, MANAGE_ROLES);
}

/**
 * READ gate for the admin panel. Guard admin GET handlers and read-only
 * admin pages with this. NEVER use it on a mutating handler.
 */
export function canViewAdmin(user: User | null | undefined): user is User {
  return hasRole(user, VIEW_ADMIN_ROLES);
}

/** Bulk export of user-activity data (CSV/JSON). Read-only by nature. */
export function canExportData(user: User | null | undefined): user is User {
  return hasRole(user, EXPORT_ROLES);
}

/**
 * Whether the viewer may see EVERY user's activity rows. Plain admins have
 * other super_admins filtered out of analytics; auditors and super_admins do
 * not, because partial visibility would defeat the point of an audit role.
 */
export function hasFullUserVisibility(user: User | null | undefined): user is User {
  return hasRole(user, FULL_VISIBILITY_ROLES);
}

export function isSuperAdmin(user: User | null | undefined): user is User {
  return user?.role === 'super_admin';
}

export function isAuditor(user: User | null | undefined): user is User {
  return user?.role === 'auditor';
}

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Administrator',
  admin: 'Administrator',
  auditor: 'Auditor',
  instructor: 'Instructor',
  learner: 'Learner',
};

/** Human-readable role name. Falls back to the raw value for unknown roles. */
export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[role as Role] ?? 'Learner';
}

const ROLE_BADGE_CLASSES: Record<Role, string> = {
  super_admin: 'border-red-500 text-red-400',
  admin: 'border-purple-500 text-purple-400',
  auditor: 'border-amber-500 text-amber-400',
  instructor: 'border-blue-500 text-blue-400',
  learner: 'border-slate-600 text-slate-400',
};

/** Tailwind classes for a role badge, so every screen colours roles alike. */
export function roleBadgeClass(role: string | null | undefined): string {
  return ROLE_BADGE_CLASSES[role as Role] ?? ROLE_BADGE_CLASSES.learner;
}
