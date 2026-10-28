import type { DatabaseAdapter } from './db';
import type { User, Session, UserRole } from './types';

export const SESSION_COOKIE_NAME = 'vidya_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
 * Inserts a new session into the sessions table with a 7-day expiry.
 */
export async function createSession(
  db: DatabaseAdapter,
  user: User
): Promise<Session> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, role, institution_id, expires_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(token, user.id, user.role, user.institution_id || null, expiresAt)
    .run();

  return {
    id: token,
    user_id: user.id,
    role: user.role,
    institution_id: user.institution_id || null,
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

/**
 * Retrieves and verifies the session token from a Request.
 * Populates and returns user & session info, or null if invalid/expired.
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
    const query = `
      SELECT s.id as session_id, s.user_id, s.role as session_role, s.institution_id as session_institution_id, s.expires_at, s.created_at as session_created_at,
             u.id as u_id, u.username, u.password_hash, u.salt, u.full_name, u.role as u_role, u.institution_id as u_institution_id, u.apaar_id, u.created_at as u_created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > ?
    `;

    const row = await db.prepare(query).bind(sessionId, nowIso).first<any>();
    if (!row) {
      return null;
    }

    const user: User = {
      id: row.u_id || row.user_id,
      username: row.username,
      password_hash: row.password_hash || '',
      salt: row.salt || '',
      full_name: row.full_name,
      role: (row.u_role || row.session_role) as UserRole,
      institution_id: row.u_institution_id || row.session_institution_id || null,
      apaar_id: row.apaar_id || null,
      created_at: row.u_created_at,
    };

    const session: Session = {
      id: row.session_id || sessionId,
      user_id: user.id,
      role: (row.session_role || user.role) as UserRole,
      institution_id: row.session_institution_id || user.institution_id || null,
      expires_at: row.expires_at,
      created_at: row.session_created_at,
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
