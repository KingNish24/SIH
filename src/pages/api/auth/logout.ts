import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { destroySession, buildClearSessionCookie, SESSION_COOKIE_NAME } from '../../../lib/auth';

const handleLogout: APIRoute = async ({ request, locals, cookies, redirect }) => {
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
      return new Response(JSON.stringify({ success: true, redirect: '/login?reason=logged_out' }), {
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
        Location: '/login?reason=logged_out',
        'Set-Cookie': clearCookieHeader,
      },
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return redirect('/login?reason=logged_out', 302);
  }
};

export const GET: APIRoute = handleLogout;
export const POST: APIRoute = handleLogout;
