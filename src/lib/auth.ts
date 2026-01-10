import { cookies } from 'next/headers';
import { randomInt } from 'crypto';
import { queryOne, execute } from './db';
import { User, Session } from './types';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';

// Lazy-load Resend client to avoid build-time initialization
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const SESSION_COOKIE_NAME = 'lms_session';
const SESSION_MAX_AGE_DAYS = parseInt(process.env.SESSION_MAX_AGE_DAYS || '30');
const AUTH_CODE_EXPIRY_MINUTES = parseInt(process.env.AUTH_CODE_EXPIRY_MINUTES || '10');

// Rate limiting: Track code request attempts per email
const codeRequestCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_CODE_REQUESTS = 5;  // Max requests per window
const CODE_REQUEST_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Rate limiting: Track verification attempts per email
const verifyAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_VERIFY_ATTEMPTS = 5; // Max verification attempts per window
const VERIFY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Generate cryptographically secure 6-digit code
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

// Check rate limit for code requests
function checkCodeRequestLimit(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase();
  const record = codeRequestCounts.get(key);

  if (!record || now > record.resetAt) {
    codeRequestCounts.set(key, { count: 1, resetAt: now + CODE_REQUEST_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_CODE_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

// Check rate limit for verification attempts
function checkVerifyLimit(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase();
  const record = verifyAttempts.get(key);

  if (!record || now > record.resetAt) {
    verifyAttempts.set(key, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_VERIFY_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

// Check if email domain is allowed
export function isAllowedEmail(email: string): boolean {
  const allowedDomains = ['unilinktransportation.com', 'unilinkportal.com'];
  const domain = email.toLowerCase().split('@')[1];
  return allowedDomains.includes(domain);
}

// Send auth code via email
export async function sendAuthCode(email: string): Promise<{ success: boolean; error?: string }> {
  if (!isAllowedEmail(email)) {
    return { success: false, error: 'Email domain not authorized' };
  }

  // Check rate limit
  if (!checkCodeRequestLimit(email)) {
    return { success: false, error: 'Too many code requests. Please try again later.' };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRY_MINUTES * 60 * 1000);

  // Store code in database
  await execute(
    `INSERT INTO auth_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), code, expiresAt.toISOString()]
  );

  // Send email
  try {
    await getResend().emails.send({
      from: 'Unilink IT Training <noreply@unilinkportal.com>',
      to: email,
      subject: 'Your Login Code - Unilink IT Training',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a365d;">Unilink IT Training</h2>
          <p>Your login verification code is:</p>
          <div style="background: #f0f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2d3748;">${code}</span>
          </div>
          <p style="color: #718096;">This code will expire in ${AUTH_CODE_EXPIRY_MINUTES} minutes.</p>
          <p style="color: #718096; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

// Verify auth code and create session
export async function verifyAuthCode(
  email: string,
  code: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  // Check rate limit
  if (!checkVerifyLimit(email)) {
    return { success: false, error: 'Too many verification attempts. Please try again later.' };
  }

  const authCode = await queryOne<{ id: string; expires_at: string; used: boolean }>(
    `SELECT id, expires_at, used FROM auth_codes
     WHERE email = $1 AND code = $2
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase(), code]
  );

  if (!authCode) {
    return { success: false, error: 'Invalid code' };
  }

  if (authCode.used) {
    return { success: false, error: 'Code already used' };
  }

  if (new Date(authCode.expires_at) < new Date()) {
    return { success: false, error: 'Code expired' };
  }

  // Mark code as used
  await execute(`UPDATE auth_codes SET used = true WHERE id = $1`, [authCode.id]);

  // Get or create user
  let user = await queryOne<User>(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (!user) {
    const isSuperAdmin = email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
    await execute(
      `INSERT INTO users (email, role) VALUES ($1, $2)`,
      [email.toLowerCase(), isSuperAdmin ? 'super_admin' : 'learner']
    );
    user = await queryOne<User>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  }

  if (!user || !user.is_active) {
    return { success: false, error: 'Account is not active' };
  }

  // Create session
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await execute(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, token, expiresAt.toISOString()]
  );

  // Get the session ID we just created
  const session = await queryOne<{ id: string }>(
    `SELECT id FROM sessions WHERE token = $1`,
    [token]
  );

  // Record login history
  if (session) {
    await execute(
      `INSERT INTO login_history (user_id, session_id, logged_in_at, ip_address, user_agent)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [user.id, session.id, ipAddress || null, userAgent || null]
    );
  }

  // Update user's last_login_at
  await execute(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  );

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return { success: true };
}

// Get current user from session
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const session = await queryOne<Session & User>(
    `SELECT u.* FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [token]
  );

  return session || null;
}

// Logout
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Get the session to find the login history record
    const session = await queryOne<{ id: string }>(
      `SELECT id FROM sessions WHERE token = $1`,
      [token]
    );

    if (session) {
      // Update login_history with logout time and calculate session duration
      await execute(
        `UPDATE login_history
         SET logged_out_at = NOW(),
             session_duration_seconds = EXTRACT(EPOCH FROM (NOW() - logged_in_at))::INTEGER
         WHERE session_id = $1 AND logged_out_at IS NULL`,
        [session.id]
      );
    }

    await execute(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Check if user has admin access
export function isAdmin(user: User | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

// Check if user is super admin
export function isSuperAdmin(user: User | null): boolean {
  return user?.role === 'super_admin';
}
