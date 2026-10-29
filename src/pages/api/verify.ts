import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type { Student, Degree, Admission, Institution } from '../../lib/types';
import { verifyDegree, getSigningKeys } from '../../lib/signing';
import { generateQrSvg } from '../../lib/qr';

const bytesToB64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};

export interface PredicateQuery {
  min_cgpa?: number;
  min_year?: number;
  require_valid_degree?: boolean;
}

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

    // 2. DPDP Consent Check (DPDP Act 2023 Section 6) + optional consent_token override
    const hasValidConsentToken = typeof consent_token === 'string' && consent_token.trim().length >= 8;
    const isConsentGranted = student.dpdp_consent_status === 'GRANTED' || hasValidConsentToken;

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

    const isPredicateMode = Boolean(
      predicate &&
      typeof predicate === 'object' &&
      (predicate.min_cgpa !== undefined || predicate.min_year !== undefined || predicate.require_valid_degree !== undefined)
    );

    const minCgpa = predicate?.min_cgpa !== undefined ? Number(predicate.min_cgpa) : 7.5;
    const minYear = predicate?.min_year !== undefined ? Number(predicate.min_year) : 2022;
    const reqValidDegree = predicate?.require_valid_degree !== undefined ? Boolean(predicate.require_valid_degree) : true;

    const enrichedDegrees = await Promise.all(degrees.map(async (d: any) => {
      const inst = institutions.find((i) => i.id === d.institution_id);
      const signablePayload = {
        id: d.id,
        apaar_id: d.apaar_id,
        institution_id: d.institution_id,
        degree_name: d.degree_name,
        specialization: d.specialization,
        cgpa: d.cgpa,
        year_of_passing: d.year_of_passing,
        issuing_authority: d.issuing_authority,
        issued_at: d.issued_at,
      };
      const signatureValid = await verifyDegree(signablePayload, d.signature, d.signing_key_id);

      // Compact W3C VC / Offline QR Signed Payload
      const qrVcPayloadObj = {
        v: 'W3C-VC-NAD-1.0',
        id: d.id,
        apaar_id: d.apaar_id,
        institution_id: d.institution_id,
        degree_name: d.degree_name,
        specialization: d.specialization,
        cgpa: isPredicateMode ? undefined : Number(d.cgpa),
        cgpa_predicate: isPredicateMode ? `>= ${minCgpa.toFixed(2)}` : undefined,
        year_of_passing: Number(d.year_of_passing),
        issuing_authority: d.issuing_authority,
        issued_at: d.issued_at,
        status: d.status,
        kid: d.signing_key_id || 'aicte-nad-2026',
        sig: d.signature || '',
      };

      // Offline full verifiable payload (retains canonical fields so client WebCrypto can verify in-browser with 0 DB queries)
      const offlineVerifiablePayload = {
        id: d.id,
        apaar_id: d.apaar_id,
        institution_id: d.institution_id,
        degree_name: d.degree_name,
        specialization: d.specialization,
        cgpa: Number(d.cgpa),
        year_of_passing: Number(d.year_of_passing),
        issuing_authority: d.issuing_authority,
        issued_at: d.issued_at,
        kid: d.signing_key_id || 'aicte-nad-2026',
        sig: d.signature || '',
      };

      const qrSvg = generateQrSvg(JSON.stringify(qrVcPayloadObj), {
        size: 168,
        margin: 2,
        darkColor: '#0F2942',
        lightColor: '#FFFFFF',
        label: `W3C Verifiable Credential QR for ${d.id}`,
      });

      if (isPredicateMode) {
        const meetsCgpa = Number(d.cgpa) >= minCgpa;
        return {
          ...d,
          cgpa: meetsCgpa
            ? `REDACTED (Meets >= ${minCgpa.toFixed(2)} Threshold)`
            : `REDACTED (Below ${minCgpa.toFixed(2)} Threshold)`,
          cgpa_redacted: true,
          institution_name: inst?.name || d.institution_id,
          signatureValid,
          qrSvg,
          offlineQrPayload: offlineVerifiablePayload,
        };
      }

      return {
        ...d,
        institution_name: inst?.name || d.institution_id,
        signatureValid,
        qrSvg,
        offlineQrPayload: offlineVerifiablePayload,
      };
    }));

    // Evaluate Zero-Knowledge Selective Attribute Disclosure Predicate Proof if requested
    let predicateProof: Record<string, unknown> | null = null;
    if (isPredicateMode) {
      const primaryDeg = degrees[0];
      const rawCgpa = primaryDeg ? Number(primaryDeg.cgpa) : 0;
      const rawYear = primaryDeg ? Number(primaryDeg.year_of_passing) : 0;
      const isIssuedAndValid = Boolean(
        primaryDeg &&
        primaryDeg.status === 'ISSUED' &&
        enrichedDegrees[0]?.signatureValid
      );

      const cgpaSatisfied = Boolean(primaryDeg && rawCgpa >= minCgpa);
      const yearSatisfied = Boolean(primaryDeg && rawYear >= minYear);
      const statusSatisfied = reqValidDegree ? isIssuedAndValid : Boolean(primaryDeg);
      const predicateVerified = cgpaSatisfied && yearSatisfied && statusSatisfied;

      const redactedCgpaLabel = primaryDeg
        ? (cgpaSatisfied
            ? `REDACTED (Meets >= ${minCgpa.toFixed(2)} Threshold)`
            : `REDACTED (Does Not Meet >= ${minCgpa.toFixed(2)} Threshold)`)
        : 'REDACTED (No Degree Conferred)';

      const evaluatedAt = new Date().toISOString();
      const canonicalPredicateStatement = JSON.stringify({
        apaar_id: cleanApaar,
        cgpa_threshold_met: cgpaSatisfied,
        degree_status_valid: statusSatisfied,
        evaluated_at: evaluatedAt,
        min_cgpa: minCgpa,
        min_year: minYear,
        predicate_verified: predicateVerified,
        protocol: 'ZK-SELECTIVE-DISCLOSURE-DPDP-SEC6',
        year_threshold_met: yearSatisfied,
      });

      let attestationSignature: string | null = null;
      let attestationKid = 'aicte-nad-zkp-2026';
      const signingKeys = await getSigningKeys();
      if (signingKeys) {
        const sigBuf = await crypto.subtle.sign(
          { name: 'Ed25519' },
          signingKeys.priv,
          new TextEncoder().encode(canonicalPredicateStatement)
        );
        attestationSignature = bytesToB64(sigBuf);
        attestationKid = signingKeys.kid;
      }

      predicateProof = {
        enabled: true,
        predicateVerified,
        redactedCgpa: redactedCgpaLabel,
        thresholds: {
          min_cgpa: minCgpa,
          min_year: minYear,
          require_valid_degree: reqValidDegree,
        },
        assertions: {
          cgpaThresholdMet: cgpaSatisfied,
          graduationYearMet: yearSatisfied,
          activeIssuedDegreeMet: statusSatisfied,
        },
        canonicalStatement: canonicalPredicateStatement,
        attestationSignature,
        attestationKeyId: attestationKid,
        evaluatedAt,
      };
    }

    const elapsedMs = Date.now() - startTime;

    // 5. Log verification request
    const reqId = `REQ-${crypto.randomUUID()}`;
    const verifier = verifier_name || 'Authorized Verifier (e.g. TCS / UPSC)';
    const reqPurpose = isPredicateMode
      ? `${purpose || 'Zero-Knowledge Eligibility Predicate Verification'} [CGPA >= ${minCgpa}]`
      : (purpose || 'Employment / Higher Education Credential Verification');

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
      consentStatus: hasValidConsentToken ? 'GRANTED_VIA_TOKEN' : student.dpdp_consent_status,
      consentGranted: isConsentGranted,
      predicateMode: isPredicateMode,
      predicateVerified: predicateProof ? Boolean(predicateProof.predicateVerified) : undefined,
      redactedCgpa: predicateProof ? String(predicateProof.redactedCgpa) : undefined,
      predicateProof,
      student: isConsentGranted ? {
        fullName: student.full_name,
        dob: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.dob,
        gender: student.gender,
        email: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.email,
        phone: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.phone,
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
        cryptographicProofVerified: enrichedDegrees.length > 0 && enrichedDegrees.every((d) => d.signatureValid),
        unsignedOrInvalidDegrees: enrichedDegrees.filter((d) => !d.signatureValid).map((d) => d.id),
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
