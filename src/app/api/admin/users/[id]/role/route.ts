import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canManageRoles, isValidRole, type Role } from '@/lib/permissions';
import { pool, query, queryOne } from '@/lib/db';

/**
 * Change a user's role.
 *
 * Before this route existed, roles could only be changed by running SQL by
 * hand — /admin/users was a read-only list and /api/admin/users exported GET
 * only. A super_admin looking for the control in the UI could not find it
 * because there was no control.
 *
 * This is the single most privileged write in the application, so it is the
 * narrowest. Four independent guards, each of which must hold:
 *
 *   1. `canManageRoles` — super_admin ONLY, not `canManage`. A plain admin who
 *      could assign roles could grant themselves super_admin in one request,
 *      or hand out `auditor` (unrestricted visibility of every learner) as if
 *      it were a content permission.
 *   2. The target role must be in `ROLES`. Anything else is rejected here
 *      rather than left to the DB CHECK constraint, so the caller gets a clear
 *      400 instead of a 500 — and `user` in particular, which does not exist,
 *      fails with a message saying so.
 *   3. Nobody may change their OWN role. Self-demotion is the accident that
 *      locks the last administrator out of the admin panel, and self-promotion
 *      is meaningless for the only role that can reach this route.
 *   4. The LAST active super_admin cannot be demoted. Without this, two
 *      legitimate-looking changes in sequence leave the platform with no one
 *      able to manage roles, and no UI path back — only SQL.
 *
 * Every accepted change is written to `user_role_changes` in the same
 * transaction as the update, so the trail cannot disagree with the outcome.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor || !canManageRoles(actor)) {
      // Deliberately 403, not 404: the caller is authenticated and this is a
      // permission decision. A 404 here would send a super_admin hunting for a
      // typo in the URL.
      return NextResponse.json(
        { success: false, error: 'Only a Super Administrator can change roles' },
        { status: 403 }
      );
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { role, reason } = (body ?? {}) as { role?: unknown; reason?: unknown };

    if (!isValidRole(role)) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Invalid role. Allowed: super_admin, admin, auditor, instructor, learner` +
            (role === 'user' ? " — there is no 'user' role in this platform." : ''),
        },
        { status: 400 }
      );
    }

    const target = await queryOne<{ id: string; email: string; name: string | null; role: string }>(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [id]
    );

    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (target.id === actor.id) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    if (target.role === role) {
      // Not an error, but say nothing changed rather than writing an audit row
      // recording a transition from a role to itself.
      return NextResponse.json({
        success: true,
        data: { user: target, changed: false },
      });
    }

    // Guard 4. Counted BEFORE the update, and only over active accounts — a
    // deactivated super_admin cannot sign in, so it must not count as cover.
    if (target.role === 'super_admin' && role !== 'super_admin') {
      const remaining = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM users
          WHERE role = 'super_admin' AND is_active = true AND id <> $1`,
        [target.id]
      );
      if (!remaining || remaining.n === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              'This is the last active Super Administrator. Promote someone else first, ' +
              'or the platform would be left with no one able to manage roles.',
          },
          { status: 409 }
        );
      }
    }

    // One statement per unit of work, both inside the same transaction: the
    // audit row and the role must land together or not at all. `pool.query`
    // would run each on an arbitrary pooled connection, so BEGIN/COMMIT here
    // are written as a single multi-statement call via a dedicated helper —
    // see the note below on why this is not two `execute()` calls.
    const updated = await updateRoleWithAudit({
      userId: target.id,
      fromRole: target.role,
      toRole: role,
      actorId: actor.id,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null,
    });

    return NextResponse.json({
      success: true,
      data: {
        user: updated,
        changed: true,
        previous_role: target.role,
      },
    });
  } catch (error) {
    console.error('Role change failed:', error);
    const e = error as { code?: string };
    // 42501 means the migration's GRANT never ran against this database. Say so
    // instead of a generic 500 — it is the one failure that cannot reproduce
    // locally, so the message has to carry the diagnosis.
    if (e.code === '42501') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Database permission denied. migrations/010_user_role_changes.sql has not been ' +
            'applied to this database, or its GRANT to lms_app is missing.',
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Update the role and record it, atomically.
 *
 * `@/lib/db` exposes only pool-level helpers, and a pool hands each call an
 * arbitrary connection — so `execute('BEGIN')` followed by `execute(...)` can
 * run on two different sessions, silently leaving the BEGIN open on one and the
 * write auto-committed on the other. Borrowing one client is the only correct
 * shape, and it is `release()`d rather than `end()`ed: ending a shared singleton
 * pool from a call site breaks the NEXT request, far from the code that did it.
 */
async function updateRoleWithAudit(args: {
  userId: string;
  fromRole: string;
  toRole: Role;
  actorId: string;
  reason: string | null;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      is_active: boolean;
    }>(
      `UPDATE users SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, name, role, is_active`,
      [args.toRole, args.userId]
    );

    await client.query(
      `INSERT INTO user_role_changes (user_id, from_role, to_role, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [args.userId, args.fromRole, args.toRole, args.actorId, args.reason]
    );

    await client.query('COMMIT');
    return res.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Role history for one user — the audit view of the trail written above. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentUser();
    // Read gate is intentionally the SAME as the write gate here. The trail
    // names which administrator granted which privilege; that is not part of
    // the read-only oversight surface an auditor is given.
    if (!actor || !canManageRoles(actor)) {
      return NextResponse.json(
        { success: false, error: 'Only a Super Administrator can view role history' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const history = await query(
      `SELECT rc.from_role, rc.to_role, rc.reason, rc.changed_at,
              actor.email AS changed_by_email
         FROM user_role_changes rc
         LEFT JOIN users actor ON actor.id = rc.changed_by
        WHERE rc.user_id = $1
        ORDER BY rc.changed_at DESC
        LIMIT 50`,
      [id]
    );

    return NextResponse.json({ success: true, data: { history } });
  } catch (error) {
    console.error('Role history failed:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
