import { defineMiddleware } from 'astro:middleware';
import { getDB } from './lib/db';
import { getSession } from './lib/auth';
import { checkRateLimit } from './lib/ratelimit';
import { logRequest, logJSON } from './lib/log';
import { isSupportedLang, type LangCode } from './lib/i18n';

// Static assets and internal routes that should always bypass auth
const PUBLIC_FILE_EXTENSIONS = /\.(ico|svg|png|jpg|jpeg|webp|gif|css|js|map|woff|woff2|ttf|eot|txt|json)$/i;

const route = async (context: Parameters<Parameters<typeof defineMiddleware>[0]>[0], next: () => Promise<Response>): Promise<Response> => {
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

  // 1.5. Multilingual URL Resolution
  const segments = pathname.split('/').filter(Boolean);
  const potentialLang = segments[0];
  let resolvedLang: LangCode = 'en';
  let normalizedPath = pathname;
  let isLangPrefixed = false;

  if (isSupportedLang(potentialLang)) {
    isLangPrefixed = true;
    resolvedLang = potentialLang;
    const remaining = segments.slice(1).join('/');
    normalizedPath = remaining ? `/${remaining}` : '/';

    // Canonical redirect for /en prefix to root path
    if (resolvedLang === 'en') {
      const search = context.url.search;
      return context.redirect(`${normalizedPath}${search}`, 302);
    }
  } else {
    // Resolve from cookie if present
    const cookieHeader = context.request.headers.get('cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)gov_preferred_lang=([a-z]{2,3})/);
    if (match && isSupportedLang(match[1])) {
      resolvedLang = match[1] as LangCode;
    }
  }

  context.locals.lang = resolvedLang;

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
  if (
    normalizedPath === '/' ||
    normalizedPath === '/login' ||
    normalizedPath === '/verifier' ||
    normalizedPath.startsWith('/verifier/') ||
    normalizedPath.startsWith('/api/auth/') ||
    normalizedPath === '/privacy' ||
    normalizedPath === '/terms' ||
    normalizedPath === '/accessibility' ||
    normalizedPath === '/hyperlinking-policy'
  ) {
    if (isLangPrefixed) {
      return context.rewrite(normalizedPath);
    }
    return next();
  }

  // 4. Role-based Protected Page Routes
  // AICTE Regulatory Council
  if (normalizedPath === '/aicte' || normalizedPath.startsWith('/aicte/')) {
    if (!user || user.role !== 'AICTE_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    if (isLangPrefixed) {
      return context.rewrite(normalizedPath);
    }
    return next();
  }

  // Institute Admin Portal
  if (normalizedPath === '/institution' || normalizedPath.startsWith('/institution/')) {
    if (!user || user.role !== 'INSTITUTE_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    if (isLangPrefixed) {
      return context.rewrite(normalizedPath);
    }
    return next();
  }

  // Affiliating University Degree Ledger
  if (normalizedPath === '/university' || normalizedPath.startsWith('/university/')) {
    if (!user || user.role !== 'UNIVERSITY_ADMIN') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    if (isLangPrefixed) {
      return context.rewrite(normalizedPath);
    }
    return next();
  }

  // Student DPDP Consent Portal
  if (normalizedPath === '/student' || normalizedPath.startsWith('/student/')) {
    if (!user || user.role !== 'STUDENT') {
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
      return context.redirect(redirectUrl, 302);
    }
    if (isLangPrefixed) {
      return context.rewrite(normalizedPath);
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

  // 6. Security Headers (GIGW 3.0 / OWASP Standards)
  if (isLangPrefixed) {
    return context.rewrite(normalizedPath);
  }
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), interest-cohort=()'
  );
  return response;
};

export const onRequest = defineMiddleware(route);
