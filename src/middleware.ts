import { defineMiddleware } from 'astro:middleware';
import { getDB, getEnv } from './lib/db';
import { getSession } from './lib/auth';
import { logRequest } from './lib/log';
import { isSupportedLang, type LangCode } from './lib/i18n';

// Static assets and internal routes that should always bypass auth
const PUBLIC_FILE_EXTENSIONS = /\.(ico|svg|png|jpg|jpeg|webp|gif|css|js|map|woff|woff2|ttf|eot|txt|json)$/i;

interface RateLimiter {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
}

const RATE_LIMIT_CONFIG: Record<string, { maxRequests: number; windowMs: number }> = {
  login: { maxRequests: 25, windowMs: 60_000 },
  verify: { maxRequests: 60, windowMs: 60_000 },
  api: { maxRequests: 120, windowMs: 60_000 },
};

const slidingWindowBuckets = new Map<string, number[]>();

async function enforceRateLimit(
  request: Request,
  pathname: string
): Promise<{ blocked: Response | null; headers: Record<string, string> }> {
  let bindingName: string | null = null;
  let scope = 'api';

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    bindingName = 'LOGIN_LIMITER';
    scope = 'login';
  } else if (pathname === '/api/verify' || pathname.startsWith('/api/verify/')) {
    bindingName = 'VERIFY_LIMITER';
    scope = 'verify';
  } else if (pathname.startsWith('/api/')) {
    bindingName = 'API_LIMITER';
    scope = 'api';
  }

  if (!bindingName) return { blocked: null, headers: {} };

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  const cfg = RATE_LIMIT_CONFIG[scope] || RATE_LIMIT_CONFIG.api;
  const now = Date.now();
  const bucketKey = `${scope}:${ip}`;
  const recent = (slidingWindowBuckets.get(bucketKey) || []).filter((ts) => now - ts < cfg.windowMs);
  recent.push(now);
  slidingWindowBuckets.set(bucketKey, recent);

  const remaining = Math.max(0, cfg.maxRequests - recent.length);
  const resetEpochSec = Math.ceil((now + cfg.windowMs) / 1000);
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(cfg.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetEpochSec),
  };

  const env = getEnv();
  const limiter = env?.[bindingName] as RateLimiter | undefined;
  if (limiter?.limit) {
    try {
      const { success } = await limiter.limit({ key: bucketKey });
      if (!success) {
        return {
          blocked: new Response(
            JSON.stringify({
              success: false,
              error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please wait before retrying.',
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '60',
                ...headers,
              },
            }
          ),
          headers,
        };
      }
    } catch {
      // Fallback to in-memory sliding window check
    }
  }

  if (recent.length > cfg.maxRequests) {
    return {
      blocked: new Response(
        JSON.stringify({
          success: false,
          error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please wait before retrying.',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            ...headers,
          },
        }
      ),
      headers,
    };
  }

  return { blocked: null, headers };
}

const route = async (
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  next: () => Promise<Response>
): Promise<Response> => {
  const startTime = Date.now();
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

  if (isSupportedLang(potentialLang)) {
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

  // 2. Gateway Rate Limit Enforcement
  const rateLimitResult = await enforceRateLimit(context.request, pathname);
  if (rateLimitResult.blocked) return rateLimitResult.blocked;

  // 3. Resolve database and active session
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

  // 4. Public pages & auth endpoints
  const isPublicPage =
    normalizedPath === '/' ||
    normalizedPath === '/login' ||
    normalizedPath === '/verifier' ||
    normalizedPath.startsWith('/verifier/') ||
    normalizedPath.startsWith('/api/auth/') ||
    normalizedPath === '/privacy' ||
    normalizedPath === '/terms' ||
    normalizedPath === '/accessibility' ||
    normalizedPath === '/hyperlinking-policy';

  if (!isPublicPage) {
    const loginBasePath = resolvedLang === 'en' ? '/login' : `/${resolvedLang}/login`;

    // 5. Role-based Protected Page Routes
    // AICTE Regulatory Council
    if (normalizedPath === '/aicte' || normalizedPath.startsWith('/aicte/')) {
      if (!user || user.role !== 'AICTE_ADMIN') {
        const redirectUrl = `${loginBasePath}?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
        return context.redirect(redirectUrl, 302);
      }
    }

    // Institute Admin Portal
    if (normalizedPath === '/institution' || normalizedPath.startsWith('/institution/')) {
      if (!user || user.role !== 'INSTITUTE_ADMIN') {
        const redirectUrl = `${loginBasePath}?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
        return context.redirect(redirectUrl, 302);
      }
    }

    // Affiliating University Degree Ledger
    if (normalizedPath === '/university' || normalizedPath.startsWith('/university/')) {
      if (!user || user.role !== 'UNIVERSITY_ADMIN') {
        const redirectUrl = `${loginBasePath}?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
        return context.redirect(redirectUrl, 302);
      }
    }

    // Student DPDP Consent Portal
    if (normalizedPath === '/student' || normalizedPath.startsWith('/student/')) {
      if (!user || user.role !== 'STUDENT') {
        const redirectUrl = `${loginBasePath}?redirect=${encodeURIComponent(pathname)}&reason=unauthorized`;
        return context.redirect(redirectUrl, 302);
      }
    }
  }

  // 6. Protected Mutating API Routes
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

  // 7. Security Headers (GIGW 3.0 / OWASP Standards)
  const response = await next();
  for (const [k, v] of Object.entries(rateLimitResult.headers)) {
    response.headers.set(k, v);
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), interest-cohort=()');

  // Request audit logging
  logRequest({
    method: context.request.method,
    path: pathname,
    status: response.status,
    ms: Date.now() - startTime,
    reqId: (context.request.headers.get('cf-ray') || Math.random().toString(36).slice(2, 10)).slice(0, 16),
  });

  return response;
};

export const onRequest = defineMiddleware(route);
