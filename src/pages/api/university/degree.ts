import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { Degree } from '../../../lib/types';
import { canonicalDegree, signDegree, type SignableDegree } from '../../../lib/signing';

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const db = getDB(locals);
    const institutionId = url.searchParams.get('institutionId');
    const apaarId = url.searchParams.get('apaarId');

    let query = 'SELECT * FROM degrees';
    let params: any[] = [];

    if (apaarId) {
      query += ' WHERE apaar_id = ?';
      params.push(apaarId);
    } else if (institutionId) {
      query += ' WHERE institution_id = ?';
      params.push(institutionId);
    }

    query += ' ORDER BY issued_at DESC';

    const degreesRes = await db.prepare(query).bind(...params).all<Degree>();
    return new Response(JSON.stringify({ success: true, data: degreesRes.results }), {
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { apaar_id, institution_id, degree_name, specialization, cgpa, year_of_passing, issuing_authority } = body;

    if (!apaar_id || !degree_name || !issuing_authority) {
      return new Response(JSON.stringify({ success: false, error: 'Missing mandatory fields: apaar_id, degree_name, issuing_authority' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDB(locals);
    const degreeId = `DEG-${crypto.randomUUID()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const signable: SignableDegree = {
      id: degreeId,
      apaar_id: String(apaar_id),
      institution_id: institution_id || 'INST-001',
      degree_name: String(degree_name),
      specialization: specialization || 'General',
      cgpa: Number(cgpa) || 8.0,
      year_of_passing: Number(year_of_passing) || 2024,
      issuing_authority: String(issuing_authority),
      issued_at: now,
    };
    const canonical = canonicalDegree(signable);
    const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const digestHex = Array.from(new Uint8Array(digestBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const sigHash = `SHA256:${digestHex}`;
    // Ed25519 signature over canonical JSON (fails closed if key is missing)
    const { signature, keyId } = await signDegree(signable);

    await db.prepare(
      `INSERT INTO degrees (id, apaar_id, institution_id, degree_name, specialization, cgpa, year_of_passing, status, issuing_authority, issued_at, digital_signature_hash, signature, signing_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?)`
    ).bind(
      signable.id,
      signable.apaar_id,
      signable.institution_id,
      signable.degree_name,
      signable.specialization,
      signable.cgpa,
      signable.year_of_passing,
      signable.issuing_authority,
      signable.issued_at,
      sigHash,
      signature,
      keyId
    ).run();

    return new Response(JSON.stringify({
      success: true,
      message: `Degree ${degreeId} successfully issued and digitally stamped on APAAR ${apaar_id}`,
      data: {
        id: degreeId,
        apaar_id,
        degree_name,
        status: 'ISSUED',
        issued_at: now,
        digital_signature_hash: sigHash,
        signature,
        signing_key_id: keyId,
      },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const degreeId = body.degreeId || body.degree_id;
    const { action, reason } = body;

    if (!degreeId) {
      return new Response(JSON.stringify({ success: false, error: 'degreeId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDB(locals);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (action === 'REVOKE') {
      const revocationReason = reason || 'Administrative Revocation by Affiliating University Senate';
      await db.prepare(
        'UPDATE degrees SET status = ?, revoked_at = ?, revocation_reason = ? WHERE id = ?'
      ).bind('REVOKED', now, revocationReason, degreeId).run();

      return new Response(JSON.stringify({
        success: true,
        message: `Degree ${degreeId} has been REVOKED immediately. All verifiers will see tamper-proof Revoked status.`,
        data: { id: degreeId, status: 'REVOKED', revoked_at: now, revocation_reason: revocationReason },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (action === 'REINSTATE') {
      await db.prepare(
        "UPDATE degrees SET status = 'ISSUED', revoked_at = NULL, revocation_reason = NULL WHERE id = ?"
      ).bind(degreeId).run();

      return new Response(JSON.stringify({
        success: true,
        message: `Degree ${degreeId} has been REINSTATED.`,
        data: { id: degreeId, status: 'ISSUED' },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action: must be REVOKE or REINSTATE' }), {
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
