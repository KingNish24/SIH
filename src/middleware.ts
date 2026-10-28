import { defineMiddleware } from 'astro:middleware';
import { getDB } from './lib/db';
import { getSession } from './lib/auth';
import { checkRateLimit } from './lib/ratelimit';
import { logRequest, logJSON } from './lib/log';

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
};

const CSP = [
  "default-src 'self'",
  // Astro may inline small hoisted scripts/styles, so 'unsafe-inline' is required here
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  `connect-src 'self'${import.meta.env.DEV ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'publickey-credentials-get=(self), publickey-credentials-create=(self), camera=(), microphone=(), geolocation=(), payment=()',
};

function withHeaders(res: Response, reqId: string): Response {
  let out = res;
  try {
    out.headers.set('X-Request-Id', reqId);
  } catch {
    // Immutable headers (e.g. passthrough responses): clone into a mutable Response
    out = new Response(res.body, res);
    out.headers.set('X-Request-Id', reqId);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const start = Date.now();
  const reqId = crypto.randomUUID();
  const { pathname } = context.url;
  const method = context.request.method;

  let res: Response;
  try {
    res = (await checkRateLimit(context.request, pathname)) ?? (await route(context, next));
  } catch (err: any) {
    logJSON('error', { msg: 'unhandled', reqId, method, path: pathname, error: err?.message });
    res = new Response(JSON.stringify({ success: false, error: 'Internal Server Error', reqId }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  res = withHeaders(res, reqId);
  logRequest({ method, path: pathname, status: res.status, ms: Date.now() - start, reqId });
  return res;
});
