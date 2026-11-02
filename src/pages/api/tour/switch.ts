import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../../lib/auth';
import type { User, AccountSpace, PortalSlug } from '../../../lib/types';

// Reviewer-tour helper: signs the reviewer into one of the PUBLISHED demo accounts
// in its isolated database account space (`college_accounts`, `aicte_accounts`,
// `university_accounts`, `student_accounts`). Credentials never ship to the browser.
const DEMO_ACCOUNTS: Record<string, { username: string; space: AccountSpace; portal: PortalSlug }> = {
  institution: { username: 'principal.pune', space: 'college_accounts', portal: 'college' },
  college: { username: 'principal.pune', space: 'college_accounts', portal: 'college' },
  aicte: { username: 'aicte.officer', space: 'aicte_accounts', portal: 'aicte' },
  university: { username: 'registrar.univ', space: 'university_accounts', portal: 'university' },
  student: { username: 'student.rahul', space: 'student_accounts', portal: 'student' },
};

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
  const roleKey = (url.searchParams.get('role') || '').toLowerCase();
  const next = url.searchParams.get('next') || '/';
  const target = DEMO_ACCOUNTS[roleKey];
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!target) return redirect('/', 302);

  const db = getDB(locals);
  const user = await db
    .prepare(`SELECT * FROM ${target.space} WHERE LOWER(username) = ?`)
    .bind(target.username.toLowerCase())
    .first<User>();

  if (!user) {
    return redirect(`/login/${target.portal}?redirect=${encodeURIComponent(safeNext)}`, 302);
  }

  user.account_space = target.space;
  const session = await createSession(db, user, target.space);
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
