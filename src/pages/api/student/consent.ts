import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const apaar_id = (body.apaar_id || body.apaarId) as string;
    const consent_status = (body.consent_status || body.consentStatus || body.status) as string;

    if (!apaar_id || !consent_status) {
      return new Response(JSON.stringify({ success: false, error: 'apaar_id and consent_status are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!['GRANTED', 'REVOKED', 'PENDING'].includes(consent_status)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid consent status: must be GRANTED, REVOKED, or PENDING' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDB(locals);
    await db.prepare('UPDATE students SET dpdp_consent_status = ? WHERE apaar_id = ?')
      .bind(consent_status, apaar_id)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: `DPDP Consent status updated to ${consent_status} for APAAR ${apaar_id}`,
      data: {
        apaar_id,
        dpdp_consent_status: consent_status,
        updated_at: new Date().toISOString(),
      },
    }), {
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
