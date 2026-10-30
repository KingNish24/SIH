import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { ingestRoster } from '../../../lib/roster';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Valid administrative session required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const institutionId = (body.institutionId || body.institution_id) as string;
    const students = body.students;

    const db = getDB(locals);

    const result = await ingestRoster({
      institutionId,
      students,
      db,
      actor: user,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const msg = err?.message || 'Internal server error';
    let status = 500;
    if (msg.includes('Tenant Isolation Violation') || msg.includes('Forbidden')) status = 403;
    else if (msg.includes('STATUTORY_CAP_EXCEEDED')) status = 409;
    else if (msg.includes('not found')) status = 404;
    else if (msg.includes('Invalid payload') || msg.includes('Batch too large')) status = 400;

    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
