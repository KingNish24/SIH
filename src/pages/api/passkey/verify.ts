import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { startAuthentication, verifyAssertion } from '../../../lib/webauthn';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * GET_CHALLENGE -> authentication options (challenge stored single-use in KV, 120s TTL)
 * COMPLETE_VERIFICATION -> verifies assertion server-side, then sets consent to
 *   `consent_status` (GRANTED | REVOKED; default GRANTED).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { action, apaar_id, assertion, consent_status } = await request.json();
    if (!apaar_id) return json({ success: false, error: 'apaar_id required' }, 400);
    const db = getDB(locals);

    if (action === 'GET_CHALLENGE') {
      const { options, hasRegisteredPasskey } = await startAuthentication(db, request, apaar_id);
      if (!hasRegisteredPasskey) return json({ success: false, error: 'No passkey registered for this student', hasRegisteredPasskey }, 404);
      return json({ success: true, options, hasRegisteredPasskey });
    }

    if (action === 'COMPLETE_VERIFICATION') {
      const target = consent_status || 'GRANTED';
      if (!['GRANTED', 'REVOKED'].includes(target)) {
        return json({ success: false, error: 'consent_status must be GRANTED or REVOKED' }, 400);
      }
      const student: any = (await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(apaar_id).all()).results[0];
      if (!student) return json({ success: false, error: 'Student not found' }, 404);

      try {
        await verifyAssertion(db, request, apaar_id, assertion);
      } catch (e: any) {
        return json({ success: false, authenticated: false, error: e.message }, 401);
      }

      await db.prepare('UPDATE students SET dpdp_consent_status = ? WHERE apaar_id = ?').bind(target, apaar_id).run();

      return json({
        success: true,
        authenticated: true,
        studentName: student.full_name,
        apaar_id,
        dpdp_consent_status: target,
        verified_at: new Date().toISOString(),
      });
    }

    return json({ success: false, error: 'Invalid action' }, 400);
  } catch (error: any) {
    return json({ success: false, error: error.message }, 500);
  }
};
