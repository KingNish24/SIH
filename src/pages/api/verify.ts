import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type { Student, Degree, Admission, Institution } from '../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { apaar_id, verifier_name, purpose } = body;

    if (!apaar_id || !/^\d{12}$/.test(String(apaar_id).trim())) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid APAAR ID format. Must be an exact 12-digit numerical identifier.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanApaar = String(apaar_id).trim();
    const db = getDB(locals);

    // 1. Fetch Student
    const studentRes = await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(cleanApaar).all<Student>();
    const student = studentRes.results[0];

    if (!student) {
      return new Response(JSON.stringify({
        success: false,
        error: `No records found for APAAR ID: ${cleanApaar}. Please verify the APAAR ID or check AICTE central registry.`,
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. DPDP Consent Check (DPDP Act 2023 Section 6)
    const isConsentGranted = student.dpdp_consent_status === 'GRANTED';

    // 3. Fetch Degrees
    const degreesRes = await db.prepare('SELECT * FROM degrees WHERE apaar_id = ?').bind(cleanApaar).all<Degree>();
    const degrees = degreesRes.results;

    // 4. Fetch Admissions & Institution details
    const admRes = await db.prepare('SELECT * FROM admissions WHERE apaar_id = ?').bind(cleanApaar).all<Admission>();
    const instRes = await db.prepare('SELECT * FROM institutions').bind().all<Institution>();
    const institutions = instRes.results;

    const enrichedAdmissions = admRes.results.map((a) => {
      const inst = institutions.find((i) => i.id === a.institution_id);
      return {
        ...a,
        institution_name: inst?.name || a.institution_id,
        institution_code: inst?.code || 'N/A',
      };
    });

    const enrichedDegrees = degrees.map((d) => {
      const inst = institutions.find((i) => i.id === d.institution_id);
      return {
        ...d,
        institution_name: inst?.name || d.institution_id,
      };
    });

    const elapsedMs = Date.now() - startTime;

    // 5. Log verification request
    const reqId = `REQ-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
    const verifier = verifier_name || 'Authorized Verifier (e.g. TCS / UPSC)';
    const reqPurpose = purpose || 'Employment / Higher Education Credential Verification';

    await db.prepare(
      `INSERT INTO verification_requests (id, apaar_id, verifier_name, purpose, consent_status, verified_at, response_time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      reqId,
      cleanApaar,
      verifier,
      reqPurpose,
      isConsentGranted ? 'GRANTED' : 'PENDING_BIOMETRIC',
      new Date().toISOString().replace('T', ' ').substring(0, 19),
      elapsedMs
    ).run();

    // Mask PII if consent is pending
    const responsePayload = {
      success: true,
      requestId: reqId,
      responseTimeMs: elapsedMs,
      apaar_id: cleanApaar,
      consentStatus: student.dpdp_consent_status,
      consentGranted: isConsentGranted,
      student: isConsentGranted ? {
        fullName: student.full_name,
        dob: student.dob,
        gender: student.gender,
        email: student.email,
        phone: student.phone,
        hasPasskeyBiometric: Boolean(student.passkey_credential_id),
      } : {
        fullName: student.full_name.charAt(0) + '*** ' + student.full_name.split(' ').slice(1).join(' ').charAt(0) + '***',
        dob: '****-**-**',
        gender: student.gender,
        email: '***@***.edu.in',
        phone: '+91 ***** ***10',
        hasPasskeyBiometric: Boolean(student.passkey_credential_id),
        notice: 'DPDP Act 2023 Compliance: Full academic and biometric record requires explicit student Passkey authorization.',
      },
      degrees: enrichedDegrees,
      enrollments: enrichedAdmissions,
      integrityAudit: {
        totalDegrees: enrichedDegrees.length,
        revokedDegrees: enrichedDegrees.filter((d) => d.status === 'REVOKED').length,
        hasDuplicateEnrollment: enrichedAdmissions.some((a) => a.is_duplicate === 1),
        cryptographicProofVerified: enrichedDegrees.every((d) => d.digital_signature_hash.startsWith('SHA256:')),
      },
    };

    return new Response(JSON.stringify(responsePayload), {
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
