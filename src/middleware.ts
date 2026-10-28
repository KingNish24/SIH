import { defineMiddleware } from 'astro:middleware';
import { getDB } from './lib/db';
import { getSession } from './lib/auth';

// Static assets and internal routes that should always bypass auth
const PUBLIC_FILE_EXTENSIONS = /\.(ico|svg|png|jpg|jpeg|webp|gif|css|js|map|woff|woff2|ttf|eot|txt|json)$/i;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 1. Always pass through static assets and Astro internals
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/node_modules') ||
    PUBLIC_FILE_EXTENSIONS.test(pathname)
  ) {
    return next();
  }

  // 2. Resolve database and active session
  const db = getDB(context.locals);
  const sessionData = await getSession(context.request, db);

  if (sessionData) {
    context.locals.user = sessionData.user;
    context.locals.session = sessionData.session;
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }

  const user = context.locals.user;

  // 3. Public pages & auth endpoints
  // Verifier portal (/verifier) is open to all citizens, recruiters & verifiers
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/verifier' ||
    pathname.startsWith('/verifier/') ||
    pathname.startsWith('/api/auth/')
  ) {
    return next();
  }

  // 4. Role-based Protected Page Routes
  // AICTE Regulatory Council
  if (pathname === '/aicte' || pathname.startsWith('/aicte/')) {
    if (!user || user.role !== 'AICTE_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    return next();
  }

  // Institute Admin Portal
  if (pathname === '/institution' || pathname.startsWith('/institution/')) {
    if (!user || user.role !== 'INSTITUTE_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    return next();
  }

  // Affiliating University Degree Ledger
  if (pathname === '/university' || pathname.startsWith('/university/')) {
    if (!user || user.role !== 'UNIVERSITY_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    return next();
  }

  // Student DPDP Consent Portal
  if (pathname === '/student' || pathname.startsWith('/student/')) {
    if (!user || user.role !== 'STUDENT') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    return next();
  }

  // 5. Protected Mutating API Routes
  if (pathname.startsWith('/api/aicte/')) {
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (user.role !== 'AICTE_ADMIN') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: AICTE_ADMIN role required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (pathname === '/api/roster/sync') {
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: INSTITUTE_ADMIN role required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (pathname.startsWith('/api/university/degree') && context.request.method !== 'GET') {
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (user.role !== 'UNIVERSITY_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: UNIVERSITY_ADMIN role required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (pathname === '/api/student/consent') {
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (user.role !== 'STUDENT' && user.role !== 'AICTE_ADMIN') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: STUDENT role required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
});
