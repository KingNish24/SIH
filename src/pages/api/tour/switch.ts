import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../../lib/auth';
import type { User } from '../../../lib/types';

// Reviewer-tour helper: signs the reviewer into one of the PUBLISHED demo accounts
// (the same ones shown on /login). Credentials never ship to the browser.
const DEMO_ACCOUNTS: Record<string, string> = {
  institution: 'principal.pune',
  aicte: 'aicte.officer',
  university: 'registrar.univ',
  student: 'student.rahul',
};

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
  const role = url.searchParams.get('role') || '';
  const next = url.searchParams.get('next') || '/';
  const username = DEMO_ACCOUNTS[role];
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!username) return redirect('/', 302);

  const db = getDB(locals);
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<User>();
  if (!user) return redirect(`/login?redirect=${encodeURIComponent(safeNext)}`, 302);

  const session = await createSession(db, user);
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.BUILD_CF || !!process.env.CF_PAGES;
  cookies.set(SESSION_COOKIE_NAME, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isProd,
  });
  return redirect(safeNext, 302);
};
