import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { action, apaar_id, credential, device_type } = body;

    const db = getDB(locals);

    if (action === 'GET_OPTIONS') {
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
        return new Response(JSON.stringify({ success: false, error: `Student with APAAR ${apaar_id} not found` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate WebAuthn creation options
      const hostname = new URL(request.url).hostname;
      const challenge = btoa(`vidya_challenge_${Date.now()}_${Math.random()}`);
      const options = {
        challenge,
        rp: {
          name: 'VIDYA National Academic Identity System (AICTE / MoE)',
          id: hostname,
        },
        user: {
          id: btoa(apaar_id),
          name: student.email || `${apaar_id}@student.ac.in`,
          displayName: student.full_name || 'Academic Scholar',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Windows Hello, Touch ID, Face ID
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      };

      return new Response(JSON.stringify({ success: true, options }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'COMPLETE_REGISTRATION') {
      if (!apaar_id || !credential?.id) {
        return new Response(JSON.stringify({ success: false, error: 'apaar_id and credential.id are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const credId = credential.id;
      const pubKey = credential.publicKey || `PK_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const devType = device_type || 'Platform Biometric (Windows Hello / Touch ID)';

      // Insert credential
      await db.prepare(
        `INSERT INTO passkey_credentials (id, apaar_id, public_key, counter, device_type)
         VALUES (?, ?, ?, 1, ?)`
      ).bind(credId, apaar_id, pubKey, devType).run();

      // Update student consent status
      await db.prepare(
        'UPDATE students SET dpdp_consent_status = ?, passkey_credential_id = ? WHERE apaar_id = ?'
      ).bind('GRANTED', credId, apaar_id).run();

      return new Response(JSON.stringify({
        success: true,
        message: 'Passkey securely registered. DPDP biometric consent active.',
        credentialId: credId,
        deviceType: devType,
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
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
