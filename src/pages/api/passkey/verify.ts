import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { action, apaar_id, assertion } = body;

    const db = getDB(locals);

    if (action === 'GET_CHALLENGE') {
      if (!apaar_id) {
        return new Response(JSON.stringify({ success: false, error: 'apaar_id required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const credRes = await db.prepare('SELECT * FROM passkey_credentials WHERE apaar_id = ?').bind(apaar_id).all();
      const credentials = credRes.results;

      const hostname = new URL(request.url).hostname;
      const challenge = btoa(`vidya_auth_challenge_${Date.now()}_${Math.random()}`);
      const options = {
        challenge,
        timeout: 60000,
        rpId: hostname,
        allowCredentials: credentials.map((c: any) => ({
          id: c.id,
          type: 'public-key',
        })),
        userVerification: 'required',
      };

      return new Response(JSON.stringify({
        success: true,
        options,
        hasRegisteredPasskey: credentials.length > 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'COMPLETE_VERIFICATION') {
      if (!apaar_id) {
        return new Response(JSON.stringify({ success: false, error: 'apaar_id required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check student
      const studentRes = await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(apaar_id).all();
      const student = studentRes.results[0];
      if (!student) {
        return new Response(JSON.stringify({ success: false, error: 'Student not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Update student consent status to GRANTED
      await db.prepare('UPDATE students SET dpdp_consent_status = ? WHERE apaar_id = ?')
        .bind('GRANTED', apaar_id)
        .run();

      return new Response(JSON.stringify({
        success: true,
        authenticated: true,
        studentName: student.full_name,
        apaar_id,
        dpdp_consent_status: 'GRANTED',
        verified_at: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
