import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import { verifyCredential, type PredicateQuery } from '../../lib/attestation';

export const POST: APIRoute = async ({ request, locals }) => {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { apaar_id, verifier_name, purpose, predicate, consent_token } = body as {
      apaar_id?: string;
      verifier_name?: string;
      purpose?: string;
      predicate?: PredicateQuery;
      consent_token?: string;
    };

    const db = getDB(locals);

    const result = await verifyCredential({
      apaar_id: apaar_id || '',
      verifier_name,
      purpose,
      predicate,
      consent_token,
      db,
    });

    const elapsedMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        ...result,
        meta: {
          execution_time_ms: elapsedMs,
          statutory_framework: 'DPDP Act 2023 Section 6 & AICTE APH 2024-2027',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const msg = err?.message || 'Internal verification error';
    let status = 500;
    if (msg.includes('INVALID_APAAR_FORMAT')) status = 400;
    else if (msg.includes('STUDENT_NOT_FOUND')) status = 404;

    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
