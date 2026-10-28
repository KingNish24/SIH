import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { startRegistration, finishRegistration } from '../../../lib/webauthn';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { action, apaar_id, credential, device_type } = await request.json();
    if (!apaar_id) return json({ success: false, error: 'apaar_id required' }, 400);

    const db = getDB(locals);
    const student: any = (await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(apaar_id).all()).results[0];
    if (!student) return json({ success: false, error: `Student with APAAR ${apaar_id} not found` }, 404);

    if (action === 'GET_OPTIONS') {
      const options = await startRegistration(db, request, student);
      return json({ success: true, options });
    }

    if (action === 'COMPLETE_REGISTRATION') {
      if (!credential?.id || !credential?.response) {
        return json({ success: false, error: 'WebAuthn registration response required' }, 400);
      }
      const devType = String(device_type || 'FIDO2 / WebAuthn Passkey').slice(0, 100);
      let credId: string;
      try {
        credId = await finishRegistration(db, request, apaar_id, credential, devType);
      } catch (e: any) {
        return json({ success: false, error: e.message }, 400);
      }

      await db.prepare('UPDATE students SET dpdp_consent_status = ?, passkey_credential_id = ? WHERE apaar_id = ?')
        .bind('GRANTED', credId, apaar_id).run();

      return json({
        success: true,
        message: 'Passkey securely registered. DPDP biometric consent active.',
        credentialId: credId,
        deviceType: devType,
      }, 201);
    }

    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (error: any) {
    return json({ success: false, error: error.message }, 500);
  }
};
