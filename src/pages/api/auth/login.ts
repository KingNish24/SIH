import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { verifyPassword, createSession, buildSessionCookie, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../../lib/auth';
import type { User, UserRole } from '../../../lib/types';

const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  AICTE_ADMIN: '/aicte',
  INSTITUTE_ADMIN: '/institution',
  UNIVERSITY_ADMIN: '/university',
  STUDENT: '/student',
  VERIFIER: '/verifier',
};

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  try {
    let username = '';
    let password = '';
    let requestedRole: string | undefined;
    let targetRedirect: string | undefined;

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (isJson) {
      const body = await request.json().catch(() => ({}));
      username = String(body.username || '').trim();
      password = String(body.password || '');
      requestedRole = body.role;
      targetRedirect = body.redirect;
    } else {
      const formData = await request.formData().catch(() => new FormData());
      username = String(formData.get('username') || '').trim();
      password = String(formData.get('password') || '');
      requestedRole = formData.get('role')?.toString();
      targetRedirect = formData.get('redirect')?.toString();
    }

    if (!username || !password) {
      const errorMsg = 'Username and password are required.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/login?error=${encodeURIComponent(errorMsg)}`, 302);
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
      return redirect(`/login?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const isValid = await verifyPassword(password, userRes.password_hash, userRes.salt);
    if (!isValid) {
      const errorMsg = 'Invalid username or password.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/login?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    if (requestedRole && requestedRole !== userRes.role) {
      const errorMsg = `Authorized role for this account is ${userRes.role}, not ${requestedRole}.`;
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error: errorMsg }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/login?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    // Generate Session
    const session = await createSession(db, userRes);

    // Determine target URL
    let destination = ROLE_DEFAULT_REDIRECT[userRes.role] || '/';
    if (targetRedirect && targetRedirect.startsWith('/') && !targetRedirect.startsWith('/login')) {
      destination = targetRedirect;
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
