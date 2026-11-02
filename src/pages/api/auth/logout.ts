import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import {
  destroySession,
  buildClearSessionCookie,
  SESSION_COOKIE_NAME,
  getSession,
  ROLE_TO_PORTAL,
  SPACE_TO_PORTAL,
} from '../../../lib/auth';
import { isSupportedLang, type LangCode } from '../../../lib/i18n';
import type { PortalSlug } from '../../../lib/types';

function resolveLogoutLang(request: Request, locals: App.Locals, cookies: any): LangCode {
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

function inferPortalFromReferer(request: Request): PortalSlug | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const refUrl = new URL(referer);
    const segments = refUrl.pathname.split('/').filter(Boolean);
    const pathAfterLang = isSupportedLang(segments[0]) ? segments.slice(1) : segments;
    const first = pathAfterLang[0]?.toLowerCase();
    if (first === 'institution' || first === 'college') return 'college';
    if (first === 'aicte') return 'aicte';
    if (first === 'university') return 'university';
    if (first === 'student') return 'student';
    if (first === 'login' && pathAfterLang[1]) {
      const sub = pathAfterLang[1].toLowerCase();
      if (sub === 'college' || sub === 'aicte' || sub === 'university' || sub === 'student') {
        return sub as PortalSlug;
      }
    }
  } catch {}
  return null;
}

const handleLogout: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const lang = resolveLogoutLang(request, locals, cookies);
  const langPrefix = lang === 'en' ? '' : `/${lang}`;
  let portalSlug: PortalSlug | null = inferPortalFromReferer(request);

  try {
    const db = getDB(locals);
    if (!portalSlug && locals?.user?.role) {
      portalSlug = ROLE_TO_PORTAL[locals.user.role] || null;
    }

    const sessionId = cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionId) {
      if (!portalSlug) {
        const active = await getSession(request, db);
        if (active?.session?.account_space && active.session.account_space in SPACE_TO_PORTAL) {
          portalSlug = SPACE_TO_PORTAL[active.session.account_space];
        } else if (active?.user?.role && active.user.role in ROLE_TO_PORTAL) {
          portalSlug = ROLE_TO_PORTAL[active.user.role];
        }
      }
      await destroySession(db, sessionId);
    }

    const logoutRedirectUrl = portalSlug
      ? `${langPrefix}/login/${portalSlug}?reason=logged_out`
      : `${langPrefix}/login?reason=logged_out`;

    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    const clearCookieHeader = buildClearSessionCookie();

    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      return new Response(JSON.stringify({ success: true, redirect: logoutRedirectUrl }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookieHeader,
        },
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: logoutRedirectUrl,
        'Set-Cookie': clearCookieHeader,
      },
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    const fallbackUrl = portalSlug
      ? `${langPrefix}/login/${portalSlug}?reason=logged_out`
      : `${langPrefix}/login?reason=logged_out`;
    return redirect(fallbackUrl, 302);
  }
};

export const GET: APIRoute = handleLogout;
export const POST: APIRoute = handleLogout;
