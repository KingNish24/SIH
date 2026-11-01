import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { destroySession, buildClearSessionCookie, SESSION_COOKIE_NAME } from '../../../lib/auth';
import { isSupportedLang, type LangCode } from '../../../lib/i18n';

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

const handleLogout: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const lang = resolveLogoutLang(request, locals, cookies);
  const langPrefix = lang === 'en' ? '' : `/${lang}`;
  const logoutRedirectUrl = `${langPrefix}/login?reason=logged_out`;

  try {
    const sessionId = cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionId) {
      const db = getDB(locals);
      await destroySession(db, sessionId);
    }

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
    return redirect(logoutRedirectUrl, 302);
  }
};

export const GET: APIRoute = handleLogout;
export const POST: APIRoute = handleLogout;
