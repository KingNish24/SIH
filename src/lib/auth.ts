import type { DatabaseAdapter } from './db';
import type { User, Session, UserRole, AccountSpace, PortalSlug } from './types';

export const SESSION_COOKIE_NAME = 'vidya_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const PORTAL_TO_SPACE: Record<PortalSlug, AccountSpace> = {
  college: 'college_accounts',
  aicte: 'aicte_accounts',
  university: 'university_accounts',
  student: 'student_accounts',
};

export const SPACE_TO_PORTAL: Record<AccountSpace, PortalSlug> = {
  college_accounts: 'college',
  aicte_accounts: 'aicte',
  university_accounts: 'university',
  student_accounts: 'student',
};

export const ROLE_TO_SPACE: Record<UserRole, AccountSpace> = {
  INSTITUTE_ADMIN: 'college_accounts',
  AICTE_ADMIN: 'aicte_accounts',
  UNIVERSITY_ADMIN: 'university_accounts',
  STUDENT: 'student_accounts',
  VERIFIER: 'aicte_accounts',
};

export const ROLE_TO_PORTAL: Record<UserRole, PortalSlug> = {
  INSTITUTE_ADMIN: 'college',
  AICTE_ADMIN: 'aicte',
  UNIVERSITY_ADMIN: 'university',
  STUDENT: 'student',
  VERIFIER: 'aicte',
};

export const PORTAL_TO_ROLE: Record<PortalSlug, UserRole> = {
  college: 'INSTITUTE_ADMIN',
  aicte: 'AICTE_ADMIN',
  university: 'UNIVERSITY_ADMIN',
  student: 'STUDENT',
};

export function resolveAccountSpace(portalOrRole?: string | null): AccountSpace | null {
  if (!portalOrRole) return null;
  const normalized = portalOrRole.trim();
  const lower = normalized.toLowerCase();
  if (lower in PORTAL_TO_SPACE) {
    return PORTAL_TO_SPACE[lower as PortalSlug];
  }
  if (lower === 'institution') {
    return 'college_accounts';
  }
  if (
    lower === 'college_accounts' ||
    lower === 'aicte_accounts' ||
    lower === 'university_accounts' ||
    lower === 'student_accounts'
  ) {
    return lower as AccountSpace;
  }
  const upper = normalized.toUpperCase();
  if (upper in ROLE_TO_SPACE) {
    return ROLE_TO_SPACE[upper as UserRole];
  }
  return null;
}

export function resolvePortalSlug(portalOrRole?: string | null): PortalSlug {
  if (!portalOrRole) return 'college';
  const space = resolveAccountSpace(portalOrRole);
  if (space && space in SPACE_TO_PORTAL) {
    return SPACE_TO_PORTAL[space];
  }
  return 'college';
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * PBKDF2 with SHA-256 password hashing via native Web Crypto API.
 * Standard across Cloudflare Workers, Node.js, and Bun.
 */
export async function hashPassword(
  password: string,
  saltHex?: string
): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(salt),
  };
}

/**
 * Verifies a password against stored PBKDF2 hash & salt.
 */
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const derived = await hashPassword(password, salt);
  return derived.hash === hash;
}

/**
 * Generates a cryptographically strong 32-byte hex session token.
 */
export function generateSessionToken(): string {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(tokenBytes);
}

/**
 * Inserts a new session into the sessions table with a 7-day expiry,
 * recording which isolated database account_space the user belongs to.
 */
export async function createSession(
  db: DatabaseAdapter,
  user: User,
  accountSpace?: AccountSpace
): Promise<Session> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const resolvedSpace: AccountSpace =
    accountSpace || user.account_space || ROLE_TO_SPACE[user.role] || 'student_accounts';

  await db
    .prepare(
      'INSERT INTO sessions (id, account_space, user_id, role, institution_id, apaar_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      token,
      resolvedSpace,
      user.id,
      user.role,
      user.institution_id || null,
      user.apaar_id || null,
      expiresAt
    )
    .run();

  return {
    id: token,
    account_space: resolvedSpace,
    user_id: user.id,
    role: user.role,
    institution_id: user.institution_id || null,
    apaar_id: user.apaar_id || null,
    expires_at: expiresAt,
  };
}

/**
 * Parses cookie string from standard Cookie header.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      if (key) {
        cookies[key] = decodeURIComponent(val);
      }
    }
  }
  return cookies;
}

/**
 * Builds HTTP-only Set-Cookie header for vidya_session.
 */
export function buildSessionCookie(token: string, isProduction: boolean = false): string {
  const secureFlag = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Builds expired Set-Cookie header to clear vidya_session.
 */
export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

const VALID_ACCOUNT_SPACES = new Set<AccountSpace>([
  'college_accounts',
  'aicte_accounts',
  'university_accounts',
  'student_accounts',
]);

/**
 * Retrieves and verifies the session token from a Request.
 * Queries the specific isolated account table (`college_accounts`, `aicte_accounts`,
 * `university_accounts`, or `student_accounts`) indicated by `session.account_space`.
 */
export async function getSession(
  request: Request | { headers: Headers },
  db: DatabaseAdapter
): Promise<{ user: User; session: Session } | null> {
  try {
    const cookieHeader = request.headers.get('cookie');
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const sessionRow = await db
      .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sessionId, nowIso)
      .first<any>();

    if (!sessionRow) {
      return null;
    }

    const accountSpace: AccountSpace = VALID_ACCOUNT_SPACES.has(sessionRow.account_space)
      ? sessionRow.account_space
      : ROLE_TO_SPACE[sessionRow.role as UserRole] || 'student_accounts';

    let userRow = await db
      .prepare(`SELECT * FROM ${accountSpace} WHERE id = ?`)
      .bind(sessionRow.user_id)
      .first<any>();

    if (!userRow) {
      // Fallback to legacy users table if session was created against users table
      userRow = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(sessionRow.user_id)
        .first<any>();
    }

    if (!userRow) {
      return null;
    }

    const user: User = {
      id: userRow.id || sessionRow.user_id,
      username: userRow.username,
      password_hash: userRow.password_hash || '',
      salt: userRow.salt || '',
      full_name: userRow.full_name,
      role: (userRow.role || sessionRow.role) as UserRole,
      account_space: accountSpace,
      institution_id: userRow.institution_id || sessionRow.institution_id || null,
      apaar_id: userRow.apaar_id || sessionRow.apaar_id || null,
      email: userRow.email || null,
      phone: userRow.phone || null,
      designation: userRow.designation || null,
      region: userRow.region || null,
      university_name: userRow.university_name || null,
      created_at: userRow.created_at,
    };

    const session: Session = {
      id: sessionRow.id || sessionId,
      account_space: accountSpace,
      user_id: user.id,
      role: (sessionRow.role || user.role) as UserRole,
      institution_id: sessionRow.institution_id || user.institution_id || null,
      apaar_id: sessionRow.apaar_id || user.apaar_id || null,
      expires_at: sessionRow.expires_at,
      created_at: sessionRow.created_at,
    };

    return { user, session };
  } catch (err) {
    console.error('Error verifying session:', err);
    return null;
  }
}

/**
 * Clears a session token from the database.
 */
export async function destroySession(db: DatabaseAdapter, sessionId: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  } catch (err) {
    console.error('Error destroying session:', err);
  }
}
