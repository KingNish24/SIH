// Cloudflare Workers Rate Limiting binding wrapper. No-op when bindings are absent (local dev).
import { getEnv } from './db';

interface RateLimiter {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
}

/** Picks the limiter binding for a request, or null if the path isn't rate limited. */
function pickLimiter(pathname: string, method: string): { binding: string; scope: string } | null {
  if (pathname === '/api/auth/login' && method === 'POST') return { binding: 'LOGIN_LIMITER', scope: 'login' };
  if (pathname === '/api/verify' || pathname.startsWith('/api/verify/')) return { binding: 'VERIFY_LIMITER', scope: 'verify' };
  if (pathname.startsWith('/api/')) return { binding: 'API_LIMITER', scope: 'api' };
  return null;
}

/** Returns a 429 Response if the request exceeds its limit, otherwise null. */
export async function checkRateLimit(request: Request, pathname: string): Promise<Response | null> {
  const pick = pickLimiter(pathname, request.method);
  if (!pick) return null;
  const limiter = getEnv()?.[pick.binding] as RateLimiter | undefined;
  if (!limiter?.limit) return null; // graceful no-op in dev

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  try {
    const { success } = await limiter.limit({ key: `${pick.scope}:${ip}` });
    if (success) return null;
  } catch {
    return null; // fail open if the limiter itself errors
  }
  return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please retry later.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}
