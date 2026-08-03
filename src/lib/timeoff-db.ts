import pg from 'pg';

/**
 * Read-only connection to the Time-Off app's Postgres database
 * (`timeoff_at_unilink_portal` on the same Aiven cluster, a DIFFERENT database).
 *
 * Time-Off is the company's system of record for employment status: HR flips
 * `users."isActive"` there when someone is offboarded. The LMS mirrors that flag
 * onto its own `users.is_active` nightly so reports stop naming people who have
 * left. See docs/SPEC-EMPLOYEE-STATUS-SYNC.md.
 *
 * Three things here are deliberate and have each broken something before:
 *
 * 1. **`TIMEOFF_DATABASE_URL` is its own explicit variable, backed by its own
 *    role (`lms_timeoff_ro`, SELECT on `users` only).** Never derive it from
 *    `DATABASE_URL` by string-rewriting the database name. After the Jul 2026
 *    least-privilege migration every database has a separate role, so a derived
 *    URL connects fine (Aiven grants CONNECT broadly) and then fails the query
 *    with SQLSTATE 42501 — and it cannot reproduce locally, where `.env.local`
 *    still uses a superuser.
 * 2. **`sslmode` is stripped from the URL in any position.** `pg` treats
 *    `sslmode=require` as verify-full and it OVERRIDES the `ssl` option below,
 *    failing Aiven's chain with SELF_SIGNED_CERT_IN_CHAIN.
 * 3. **A missing variable returns no rows instead of throwing**, so a deploy
 *    that lands before the credential does degrades to a no-op sync rather than
 *    a 500. The caller distinguishes the two — see `readRoster`.
 *
 * Column names in Time-Off are camelCase (Prisma) and MUST be double-quoted.
 */

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  if (pool) return pool;

  const url = process.env.TIMEOFF_DATABASE_URL;
  if (!url) return null;

  const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');

  pool = new pg.Pool({
    connectionString: cleanUrl,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });

  return pool;
}

/** One employee as the LMS cares about them: who they are and whether they're still here. */
export interface TimeoffEmployee {
  email: string;
  name: string | null;
  isActive: boolean;
}

export interface RosterResult {
  /** Empty when `configured` is false, or when the read failed. */
  employees: TimeoffEmployee[];
  /** False when TIMEOFF_DATABASE_URL is unset — a no-op sync, not a failure. */
  configured: boolean;
  /** Present when the query threw. The caller must NOT write anything. */
  error: string | null;
}

/**
 * Read the full Time-Off roster — active AND inactive, because the sync is
 * symmetric and needs to see rehires as well as leavers.
 *
 * `isActive` is the only trustworthy status field. `leaveDate` looks like a
 * termination marker and is not one: nothing in the Time-Off app writes it, and
 * as of 2026-08-03 there are 30 ACTIVE employees carrying a `leaveDate` and 44
 * INACTIVE ones with none. Both people named in the report that triggered this
 * work (Eder Gamboa, Luis Brenes) are `isActive = false` with `leaveDate` NULL.
 */
export async function readRoster(): Promise<RosterResult> {
  const db = getPool();
  if (!db) return { employees: [], configured: false, error: null };

  try {
    const result = await db.query<{ email: string; name: string | null; isActive: boolean }>(`
      SELECT lower(u.email) AS email,
             u.name         AS name,
             u."isActive"   AS "isActive"
      FROM users u
      WHERE u.email IS NOT NULL AND u.email <> ''
      ORDER BY lower(u.email)
    `);

    return {
      employees: result.rows.map((r) => ({
        email: r.email,
        name: r.name || null,
        // Default to ACTIVE on a null. Guessing "inactive" from missing data
        // would deactivate a real employee and lock them out of the LMS.
        isActive: r.isActive ?? true,
      })),
      configured: true,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;
    // 42501 = the role exists but has no grant; 42P01 = the table is absent.
    // Both mean "do not trust this read", never "everyone has left".
    return {
      employees: [],
      configured: true,
      error: code ? `${code}: ${message}` : message,
    };
  }
}
