import type { DatabaseAdapter } from './db';
import type { Student, Degree, Admission, Institution } from './types';
import { verifyDegree, getSigningKeys } from './signing';
import { generateQrSvg } from './qr';
import { maskApaar, maskName, maskEmail, maskPhone } from './types';
import { validateAndConsumeConsentToken, type TokenValidationResult } from '../pages/api/student/token';

export { validateAndConsumeConsentToken, type TokenValidationResult };

export interface PredicateQuery {
  min_cgpa?: number;
  min_year?: number;
  require_valid_degree?: boolean;
}

export interface VerifyCredentialOptions {
  apaar_id: string;
  verifier_name?: string;
  purpose?: string;
  predicate?: PredicateQuery;
  consent_token?: string;
  db: DatabaseAdapter;
}

export interface VerifyCredentialResult {
  success: boolean;
  requestId: string;
  responseTimeMs: number;
  apaar_id: string;
  consentStatus: string;
  consentGranted: boolean;
  predicateMode: boolean;
  predicateVerified?: boolean;
  redactedCgpa?: string;
  predicateProof: Record<string, unknown> | null;
  student: Record<string, unknown> | null;
  admissions: Array<Admission & { institution_name: string; institution_code: string }>;
  enrollments: Array<Admission & { institution_name: string; institution_code: string }>;
  degrees: Array<Record<string, unknown>>;
  integrityAudit: {
    totalDegrees: number;
    revokedDegrees: number;
    hasDuplicateEnrollment: boolean;
    cryptographicProofVerified: boolean;
    unsignedOrInvalidDegrees: string[];
  };
  predicate_result?: {
    satisfied: boolean;
    cgpa_check?: boolean;
    year_check?: boolean;
    degree_check?: boolean;
    attestation_statement?: string;
    attestation_signature?: string | null;
    verified_by?: string;
    timestamp?: string;
  } | null;
  qr_svg: string | null;
  vc_payload?: any;
  audit_logged: boolean;
  dpdp_consent_applied: boolean;
}

const bytesToB64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};

/**
 * Deep Credential Attestation & Verification Module.
 * Encapsulates:
 * 1. APAAR identity resolution
 * 2. Section 6 DPDP statutory masking & consent validation
 * 3. Ed25519 cryptographic degree validation (full 3-argument canonical check)
 * 4. Zero-Knowledge selective disclosure predicate attestation & signing
 * 5. Tamper-evident W3C VC payload and QR code synthesis
 * 6. Audit logging into the verification ledger
 */
export async function verifyCredential(options: VerifyCredentialOptions): Promise<VerifyCredentialResult> {
  const startTime = Date.now();
  const { apaar_id, verifier_name, purpose, predicate, consent_token, db } = options;

  const cleanApaar = String(apaar_id || '').trim();
  if (!/^\d{12}$/.test(cleanApaar)) {
    throw new Error('INVALID_APAAR_FORMAT: Invalid APAAR ID format. Must be an exact 12-digit numerical identifier.');
  }

  // 1. Fetch Student
  const studentRes = await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(cleanApaar).all<Student>();
  const student = studentRes.results[0];
  if (!student) {
    throw new Error(`STUDENT_NOT_FOUND: No records found for APAAR ID: ${cleanApaar}. Please verify the APAAR ID or check AICTE central registry.`);
  }

  // 2. DPDP Consent Check (DPDP Act 2023 Sec. 6)
  const providedToken = typeof consent_token === 'string' ? consent_token.trim() : '';
  const tokenValidation = providedToken
    ? await validateAndConsumeConsentToken(providedToken, cleanApaar, db)
    : null;
  const hasValidConsentToken = Boolean(tokenValidation?.valid);
  const isConsentGranted = providedToken
    ? hasValidConsentToken
    : student.dpdp_consent_status === 'GRANTED';
  const resolvedConsentStatus = providedToken
    ? (hasValidConsentToken ? 'GRANTED_VIA_TOKEN' : `TOKEN_${tokenValidation?.status || 'INVALID'}`)
    : student.dpdp_consent_status;

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

  // 5. Verify cryptographic signatures on degrees & build W3C VC QR payloads
  const enrichedDegrees = await Promise.all(
    degrees.map(async (d: any) => {
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
          institution_code: inst?.code || 'N/A',
          signatureValid,
          verified: signatureValid,
          qrSvg,
          offlineQrPayload: offlineVerifiablePayload,
        };
      }

      return {
        ...d,
        institution_name: inst?.name || d.institution_id,
        institution_code: inst?.code || 'N/A',
        signatureValid,
        verified: signatureValid,
        qrSvg,
        offlineQrPayload: offlineVerifiablePayload,
      };
    })
  );

  // 6. Top-level W3C Verifiable Credential summary
  let topQrSvg: string | null = null;
  let vcPayload: any = null;
  const primaryDegree = enrichedDegrees[0] as any;
  if (primaryDegree) {
    topQrSvg = primaryDegree.qrSvg || null;
    const signingKeys = await getSigningKeys();
    const kid = signingKeys?.kid || primaryDegree.signing_key_id || 'aicte-nad-2026';
    vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'UniversityDegreeCredential'],
      issuer: primaryDegree.institution_name,
      issuanceDate: primaryDegree.issued_at,
      credentialSubject: {
        id: `did:apaar:${student.apaar_id}`,
        name: isConsentGranted ? student.full_name : maskName(student.full_name),
        degree: primaryDegree.degree_name,
        specialization: primaryDegree.specialization,
        cgpa: primaryDegree.cgpa,
        year: primaryDegree.year_of_passing,
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: primaryDegree.issued_at,
        verificationMethod: `did:aicte:keys#${kid}`,
        proofValue: primaryDegree.signature,
      },
    };
  }

  // 7. ZKP / Selective Disclosure Predicate Attestation
  let predicateProof: Record<string, unknown> | null = null;
  let predicateResult: VerifyCredentialResult['predicate_result'] = null;
  if (isPredicateMode) {
    const rawPrimaryDeg = degrees[0];
    const rawCgpa = rawPrimaryDeg ? Number(rawPrimaryDeg.cgpa) : 0;
    const rawYear = rawPrimaryDeg ? Number(rawPrimaryDeg.year_of_passing) : 0;
    const isIssuedAndValid = Boolean(
      rawPrimaryDeg &&
      rawPrimaryDeg.status === 'ISSUED' &&
      primaryDegree?.signatureValid
    );

    const cgpaSatisfied = Boolean(rawPrimaryDeg && rawCgpa >= minCgpa);
    const yearSatisfied = Boolean(rawPrimaryDeg && rawYear >= minYear);
    const statusSatisfied = reqValidDegree ? isIssuedAndValid : Boolean(rawPrimaryDeg);
    const predicateVerified = cgpaSatisfied && yearSatisfied && statusSatisfied;

    const redactedCgpaLabel = rawPrimaryDeg
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

    predicateResult = {
      satisfied: predicateVerified,
      cgpa_check: cgpaSatisfied,
      year_check: yearSatisfied,
      degree_check: statusSatisfied,
      attestation_statement: canonicalPredicateStatement,
      attestation_signature: attestationSignature,
      verified_by: 'AICTE Central Attestation Node (Ed25519)',
      timestamp: evaluatedAt,
    };
  }

  const elapsedMs = Date.now() - startTime;
  const reqId = `REQ-${crypto.randomUUID()}`;
  const verifier = verifier_name || 'Authorized Verifier (e.g. TCS / UPSC)';
  const reqPurpose = isPredicateMode
    ? `${purpose || 'Zero-Knowledge Eligibility Predicate Verification'} [CGPA >= ${minCgpa}]`
    : (purpose || 'Employment / Higher Education Credential Verification');

  // 8. Log Verification Audit Record
  let auditLogged = false;
  try {
    await db
      .prepare(
        `INSERT INTO verification_requests (id, apaar_id, verifier_name, purpose, consent_status, verified_at, response_time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        reqId,
        cleanApaar,
        verifier,
        reqPurpose,
        isConsentGranted ? 'GRANTED' : 'PENDING_BIOMETRIC',
        new Date().toISOString().replace('T', ' ').substring(0, 19),
        elapsedMs
      )
      .run();
    auditLogged = true;
  } catch {
    // Non-fatal audit log failure
  }

  // 9. Apply DPDP PII Masking while preserving both camelCase (verifier UI) and snake_case (domain types)
  const finalStudent = isConsentGranted
    ? {
        apaar_id: student.apaar_id,
        fullName: student.full_name,
        full_name: student.full_name,
        dob: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.dob,
        gender: student.gender,
        email: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.email,
        phone: isPredicateMode ? 'REDACTED (Zero-Knowledge Mode)' : student.phone,
        hasPasskeyBiometric: Boolean(student.passkey_credential_id),
        dpdp_consent_status: student.dpdp_consent_status,
      }
    : {
        apaar_id: maskApaar(student.apaar_id),
        fullName: maskName(student.full_name),
        full_name: maskName(student.full_name),
        dob: '****-**-**',
        gender: student.gender,
        email: maskEmail(student.email),
        phone: maskPhone(student.phone),
        hasPasskeyBiometric: Boolean(student.passkey_credential_id),
        dpdp_consent_status: student.dpdp_consent_status,
        notice: 'DPDP Act 2023 Compliance: Full academic and biometric record requires explicit student Passkey authorization.',
      };

  return {
    success: true,
    requestId: reqId,
    responseTimeMs: elapsedMs,
    apaar_id: cleanApaar,
    consentStatus: resolvedConsentStatus,
    consentGranted: isConsentGranted,
    predicateMode: isPredicateMode,
    predicateVerified: predicateProof ? Boolean(predicateProof.predicateVerified) : undefined,
    redactedCgpa: predicateProof ? String(predicateProof.redactedCgpa) : undefined,
    predicateProof,
    student: finalStudent,
    admissions: enrichedAdmissions,
    enrollments: enrichedAdmissions,
    degrees: enrichedDegrees,
    integrityAudit: {
      totalDegrees: enrichedDegrees.length,
      revokedDegrees: enrichedDegrees.filter((d: any) => d.status === 'REVOKED').length,
      hasDuplicateEnrollment: enrichedAdmissions.some((a) => a.is_duplicate === 1),
      cryptographicProofVerified: enrichedDegrees.length > 0 && enrichedDegrees.every((d: any) => d.signatureValid),
      unsignedOrInvalidDegrees: enrichedDegrees.filter((d: any) => !d.signatureValid).map((d: any) => d.id),
    },
    predicate_result: predicateResult,
    qr_svg: topQrSvg,
    vc_payload: vcPayload,
    audit_logged: auditLogged,
    dpdp_consent_applied: !isConsentGranted,
  };
}

export const verifyAcademicRecord = verifyCredential;
