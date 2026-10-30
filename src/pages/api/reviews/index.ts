import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';

const KEYS = ['technical', 'scalability', 'innovation', 'presentation'] as const;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ success: false, error: 'Invalid JSON body.' }, 400);

  const r = (body as any).ratings ?? {};
  const scores: number[] = [];
  for (const k of KEYS) {
    const v = Number(r[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return json({ success: false, error: `Rating "${k}" must be an integer from 1 to 5.` }, 400);
    }
    scores.push(v);
  }
  const comment = String((body as any).comment ?? '').trim().slice(0, 500) || null;

  const ip =
    request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const ua = (request.headers.get('user-agent') || '').slice(0, 300);

  const db = getDB(locals);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .prepare('SELECT COUNT(*) AS c FROM reviews WHERE ip = ? AND created_at > ?')
    .bind(ip, since)
    .first<{ c: number }>();
  if ((recent?.c ?? 0) > 0) {
    return json({ success: false, error: 'You already submitted a rating from this network in the last hour.' }, 429);
  }

  await db
    .prepare(
      'INSERT INTO reviews (id, ip, technical, scalability, innovation, presentation, comment, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(crypto.randomUUID(), ip, ...scores, comment, ua, new Date().toISOString())
    .run();

  return json({ success: true });
};
