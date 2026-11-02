import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import {
  verifyPassword,
  createSession,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  PORTAL_TO_SPACE,
  PORTAL_TO_ROLE,
  resolveAccountSpace,
  resolvePortalSlug,
} from '../../../lib/auth';
import { isSupportedLang, type LangCode } from '../../../lib/i18n';
import type { User, UserRole, PortalSlug, AccountSpace } from '../../../lib/types';

const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  AICTE_ADMIN: '/aicte',
  INSTITUTE_ADMIN: '/institution',
  UNIVERSITY_ADMIN: '/university',
  STUDENT: '/student',
  VERIFIER: '/verifier',
};

const PORTAL_SPACE_LABELS: Record<PortalSlug, string> = {
  college: 'College Portal',
  aicte: 'AICTE Portal',
  university: 'University Portal',
  student: 'Student Portal',
};

const DEMO_PORTAL_USERNAMES: Record<PortalSlug, string> = {
  college: 'principal.pune',
  aicte: 'aicte.officer',
  university: 'registrar.univ',
  student: 'student.rahul',
};

function resolveAuthLang(request: Request, locals: App.Locals, cookies: any): LangCode {
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const firstSeg = refUrl.pathname.split('/').filter(Boolean)[0];
      if (isSupportedLang(firstSeg)) {
        return firstSeg;
      }
    } catch {}
  }
  const cookieLang = cookies?.get?.('gov_preferred_lang')?.value;
  if (isSupportedLang(cookieLang)) {
    return cookieLang;
  }
  if (isSupportedLang(locals?.lang)) {
    return locals.lang;
  }
  return 'en';
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  try {
    const lang = resolveAuthLang(request, locals, cookies);
    const langPrefix = lang === 'en' ? '' : `/${lang}`;

    let username = '';
    let password = '';
    let requestedPortal: string | undefined;
    let requestedRole: string | undefined;
    let targetRedirect: string | undefined;
    let demoQuickSwitch = false;

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (isJson) {
      const body = await request.json().catch(() => ({}));
      username = String(body.username || body.identifier || '').trim();
      password = String(body.password || '');
      requestedPortal = body.portal ? String(body.portal).trim() : undefined;
      requestedRole = body.role ? String(body.role).trim() : undefined;
      targetRedirect = body.redirect;
      demoQuickSwitch = Boolean(body.demo_quick_switch);
    } else {
      const formData = await request.formData().catch(() => new FormData());
      username = String(formData.get('username') || formData.get('identifier') || '').trim();
      password = String(formData.get('password') || '');
      requestedPortal = formData.get('portal')?.toString().trim();
      requestedRole = formData.get('role')?.toString().trim();
      targetRedirect = formData.get('redirect')?.toString();
      demoQuickSwitch = formData.get('demo_quick_switch') === 'true';
    }

    // Resolve portal slug and isolated account space
    const portalSlug: PortalSlug = resolvePortalSlug(requestedPortal || requestedRole || 'college');
    const accountSpace: AccountSpace = PORTAL_TO_SPACE[portalSlug];
    const portalLabel = PORTAL_SPACE_LABELS[portalSlug];
    const loginPath = `${langPrefix}/login/${portalSlug}`;

    if (demoQuickSwitch && !username) {
      username = DEMO_PORTAL_USERNAMES[portalSlug];
    }

    if (!username || (!password && !demoQuickSwitch)) {
      const errorMsg = 'Username and password are required.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const db = getDB(locals);
    let userRes: User | null = null;

    // Query ONLY the isolated account table for the target portal
    if (accountSpace === 'student_accounts') {
      userRes = await db
        .prepare('SELECT * FROM student_accounts WHERE LOWER(username) = ? OR apaar_id = ?')
        .bind(username.toLowerCase(), username.trim())
        .first<User>();
    } else {
      userRes = await db
        .prepare(`SELECT * FROM ${accountSpace} WHERE LOWER(username) = ?`)
        .bind(username.toLowerCase())
        .first<User>();
    }

    if (!userRes) {
      const errorMsg = `No account found in the ${portalLabel} database space. Please use the correct portal login.`;
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg, account_space: accountSpace }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const isAllowedDemoSwitch =
      demoQuickSwitch &&
      (DEMO_PORTAL_USERNAMES[portalSlug] === userRes.username.toLowerCase() ||
        (portalSlug === 'college' && userRes.username.toLowerCase() === 'principal.bengaluru'));

    const isValid = isAllowedDemoSwitch
      ? true
      : await verifyPassword(password, userRes.password_hash, userRes.salt);

    if (!isValid) {
      const errorMsg = `Invalid credentials for ${portalLabel}.`;
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const expectedRole = PORTAL_TO_ROLE[portalSlug];
    const effectiveRole: UserRole = (userRes.role || expectedRole) as UserRole;
    userRes.role = effectiveRole;
    userRes.account_space = accountSpace;

    // Generate Session scoped to the isolated accountSpace
    const session = await createSession(db, userRes, accountSpace);

    // Determine target URL preserving language prefix
    const defaultRolePath = ROLE_DEFAULT_REDIRECT[effectiveRole] || '/';
    let destination = defaultRolePath === '/' ? (langPrefix || '/') : `${langPrefix}${defaultRolePath}`;
    if (
      targetRedirect &&
      targetRedirect.startsWith('/') &&
      !targetRedirect.startsWith('/login') &&
      !/^\/[a-z]{2,3}\/login(\/|$|\?)/.test(targetRedirect)
    ) {
      const firstTargetSeg = targetRedirect.split('/').filter(Boolean)[0];
      if (langPrefix && !isSupportedLang(firstTargetSeg)) {
        destination = targetRedirect === '/' ? langPrefix : `${langPrefix}${targetRedirect}`;
      } else {
        destination = targetRedirect;
      }
    }

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.BUILD_CF || !!process.env.CF_PAGES;
    const cookieHeader = buildSessionCookie(session.id, isProd);

    // Set cookie via Astro Cookies helper
    cookies.set(SESSION_COOKIE_NAME, session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: isProd,
    });

    if (isJson) {
      return new Response(
        JSON.stringify({
          success: true,
          redirect: destination,
          portal: portalSlug,
          account_space: accountSpace,
          user: {
            id: userRes.id,
            username: userRes.username,
            full_name: userRes.full_name,
            role: effectiveRole,
            account_space: accountSpace,
            institution_id: userRes.institution_id || null,
            apaar_id: userRes.apaar_id || null,
            designation: userRes.designation || null,
            university_name: userRes.university_name || null,
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
          },
        }
      );
    }

    // HTML Form submission redirect
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination,
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
