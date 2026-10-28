import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = getDB(locals);
    const result = await db.prepare('SELECT * FROM institutions ORDER BY risk_score DESC').bind().all();
    return new Response(JSON.stringify({ success: true, data: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
