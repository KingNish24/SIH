import type { APIRoute } from 'astro';
import { getDB, getEnv } from '../../../lib/db';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// GET /api/reviews/export?format=csv|json  with  Authorization: Bearer <REVIEW_EXPORT_TOKEN>
export const GET: APIRoute = async ({ request, locals, url }) => {
  const token = String(getEnv()?.REVIEW_EXPORT_TOKEN ?? (locals as any)?.runtime?.env?.REVIEW_EXPORT_TOKEN ?? '');
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !safeEqual(given, token)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await getDB(locals).prepare('SELECT * FROM reviews ORDER BY created_at DESC').bind().all<any>();
  const rows = res.results || [];

  if (url.searchParams.get('format') === 'csv') {
    const head = ['created_at', 'ip', 'technical', 'scalability', 'innovation', 'presentation', 'comment'];
    const csv = [head.join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="reviews.csv"' } });
  }
  return new Response(JSON.stringify({ success: true, count: rows.length, reviews: rows }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
