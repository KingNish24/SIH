import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { verifyPassword, createSession, buildSessionCookie, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../../lib/auth';
import { isSupportedLang, type LangCode } from '../../../lib/i18n';
import type { User, UserRole } from '../../../lib/types';

const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  AICTE_ADMIN: '/aicte',
  INSTITUTE_ADMIN: '/institution',
  UNIVERSITY_ADMIN: '/university',
  STUDENT: '/student',
  VERIFIER: '/verifier',
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
    const loginPath = `${langPrefix}/login`;

    let username = '';
    let password = '';
    let requestedRole: string | undefined;
    let targetRedirect: string | undefined;
    let demoQuickSwitch = false;

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (isJson) {
      const body = await request.json().catch(() => ({}));
      username = String(body.username || '').trim();
      password = String(body.password || '');
      requestedRole = body.role;
      targetRedirect = body.redirect;
      demoQuickSwitch = Boolean(body.demo_quick_switch);
    } else {
      const formData = await request.formData().catch(() => new FormData());
      username = String(formData.get('username') || '').trim();
      password = String(formData.get('password') || '');
      requestedRole = formData.get('role')?.toString();
      targetRedirect = formData.get('redirect')?.toString();
      demoQuickSwitch = formData.get('demo_quick_switch') === 'true';
    }

    const DEMO_ROLE_USERNAMES: Record<string, string> = {
      AICTE_ADMIN: 'aicte.officer',
      INSTITUTE_ADMIN: 'principal.pune',
      UNIVERSITY_ADMIN: 'registrar.univ',
      STUDENT: 'student.rahul',
      VERIFIER: 'verifier.gov',
    };

    if (demoQuickSwitch && requestedRole && DEMO_ROLE_USERNAMES[requestedRole]) {
      username = DEMO_ROLE_USERNAMES[requestedRole];
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
    const userRes = await db
      .prepare('SELECT * FROM users WHERE username = ?')
      .bind(username.toLowerCase())
      .first<User>();

    if (!userRes) {
      const errorMsg = 'Invalid username or password.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const isAllowedDemoSwitch =
      demoQuickSwitch &&
      requestedRole &&
      DEMO_ROLE_USERNAMES[requestedRole] === userRes.username.toLowerCase();

    const isValid = isAllowedDemoSwitch
      ? true
      : await verifyPassword(password, userRes.password_hash, userRes.salt);
    if (!isValid) {
      const errorMsg = 'Invalid username or password.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    if (requestedRole && requestedRole !== userRes.role) {
      const errorMsg = `Authorized role for this account is ${userRes.role}, not ${requestedRole}.`;
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${loginPath}?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    // Generate Session
    const session = await createSession(db, userRes);

    // Determine target URL preserving language prefix
    const defaultRolePath = ROLE_DEFAULT_REDIRECT[userRes.role] || '/';
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
          user: {
            id: userRes.id,
            username: userRes.username,
            full_name: userRes.full_name,
            role: userRes.role,
            institution_id: userRes.institution_id,
            apaar_id: userRes.apaar_id,
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
