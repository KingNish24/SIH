import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';

// Risk metrics are sensitive regulatory data: authenticated sessions only.
// AICTE admins see all institutions; institute admins see only their own.
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const db = getDB(locals);
    const cols = 'id, name, code, sanctioned_intake, current_enrollment, status, risk_score, state, district';
    let result;
    if (user.role === 'AICTE_ADMIN') {
      result = await db.prepare(`SELECT ${cols} FROM institutions ORDER BY risk_score DESC LIMIT 500`).bind().all();
    } else if (user.role === 'INSTITUTE_ADMIN' && user.institution_id) {
      result = await db.prepare(`SELECT ${cols} FROM institutions WHERE id = ?`).bind(user.institution_id).all();
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: insufficient role' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, data: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
