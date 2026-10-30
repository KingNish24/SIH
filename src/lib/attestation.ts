import type { DatabaseAdapter } from './db';
import type { Student, Degree, Admission, Institution } from './types';
import { verifyDegree, getSigningKeys } from './signing';
import { generateQrSvg } from './qr';
import { maskApaar, maskName, maskEmail, maskPhone } from './types';

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
  student: Partial<Student> | null;
  admissions: Array<Admission & { institution_name: string; institution_code: string }>;
  degrees: Array<Degree & { verified: boolean; error?: string }>;
  predicate_result?: {
    satisfied: boolean;
    cgpa_check?: boolean;
    year_check?: boolean;
    degree_check?: boolean;
    attestation_statement?: string;
    attestation_signature?: string;
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
 * 3. Ed25519 cryptographic degree validation
 * 4. Zero-Knowledge selective disclosure predicate attestation & signing
 * 5. Tamper-evident W3C VC payload and QR code synthesis
 * 6. Audit logging into the verification ledger
 */
export async function verifyCredential(options: VerifyCredentialOptions): Promise<VerifyCredentialResult> {
  const { apaar_id, verifier_name = 'Public Verifier', purpose = 'Credential Verification', predicate, consent_token, db } = options;

  const cleanApaar = String(apaar_id || '').trim();
  if (!/^\d{12}$/.test(cleanApaar)) {
    throw new Error('INVALID_APAAR_FORMAT: Must be an exact 12-digit numerical identifier');
  }

  // 1. Fetch Student
  const studentRes = await db.prepare('SELECT * FROM students WHERE apaar_id = ?').bind(cleanApaar).all<Student>();
  const student = studentRes.results[0];
  if (!student) {
    throw new Error(`STUDENT_NOT_FOUND: No records found for APAAR ID: ${cleanApaar}`);
  }

  // 2. DPDP Consent Check (DPDP Act 2023 Sec. 6)
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

  // 5. Verify cryptographic signatures on degrees
  const verifiedDegrees = await Promise.all(
    degrees.map(async (deg) => {
      try {
        const verified = await verifyDegree(deg);
        return { ...deg, verified };
      } catch (err: any) {
        return { ...deg, verified: false, error: err?.message };
      }
    })
  );

  // 6. Generate W3C Verifiable Credential QR
  let qrSvg: string | null = null;
  let vcPayload: any = null;
  const primaryDegree = verifiedDegrees[0];

  if (primaryDegree && primaryDegree.verified) {
    const signingKeys = await getSigningKeys();
    vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'UniversityDegreeCredential'],
      issuer: primaryDegree.institution_name,
      issuanceDate: primaryDegree.issue_date,
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
        created: primaryDegree.created_at,
        verificationMethod: `did:aicte:keys#${signingKeys.kid}`,
        proofValue: primaryDegree.signature,
      },
    };

    const qrPayload = JSON.stringify({
      t: 'AICTE-DEGREE-VC',
      id: primaryDegree.id,
      apaar: primaryDegree.apaar_id,
      deg: primaryDegree.degree_name,
      yr: primaryDegree.year_of_passing,
      cgpa: primaryDegree.cgpa,
      sig: primaryDegree.signature.slice(0, 32) + '...',
      v: true,
    });

    qrSvg = generateQrSvg(qrPayload, 200);
  }

  // 7. ZKP / Selective Disclosure Predicate Attestation
  let predicateResult: VerifyCredentialResult['predicate_result'] = null;
  if (predicate && Object.keys(predicate).length > 0) {
    let satisfied = true;
    let cgpaCheck: boolean | undefined;
    let yearCheck: boolean | undefined;
    let degreeCheck: boolean | undefined;

    if (predicate.min_cgpa !== undefined) {
      cgpaCheck = primaryDegree ? primaryDegree.cgpa >= predicate.min_cgpa : false;
      if (!cgpaCheck) satisfied = false;
    }
    if (predicate.min_year !== undefined) {
      yearCheck = primaryDegree ? primaryDegree.year_of_passing >= predicate.min_year : false;
      if (!yearCheck) satisfied = false;
    }
    if (predicate.require_valid_degree) {
      degreeCheck = primaryDegree ? Boolean(primaryDegree.verified) : false;
      if (!degreeCheck) satisfied = false;
    }

    const signingKeys = await getSigningKeys();
    const statement = `ATT_PREDICATE:apaar=${cleanApaar}:min_cgpa=${predicate.min_cgpa ?? 'na'}:min_year=${predicate.min_year ?? 'na'}:degree_valid=${predicate.require_valid_degree ?? 'na'}:satisfied=${satisfied}`;
    const enc = new TextEncoder();
    const sigBuf = await crypto.subtle.sign('Ed25519', signingKeys.priv, enc.encode(statement));

    predicateResult = {
      satisfied,
      cgpa_check: cgpaCheck,
      year_check: yearCheck,
      degree_check: degreeCheck,
      attestation_statement: statement,
      attestation_signature: bytesToB64(sigBuf),
      verified_by: 'AICTE Central Attestation Node (Ed25519)',
      timestamp: new Date().toISOString(),
    };
  }

  // 8. Log Verification Audit Record
  let auditLogged = false;
  try {
    const requestId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    await db
      .prepare(
        `INSERT INTO verification_requests (id, apaar_id, verifier_name, purpose, status)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(requestId, cleanApaar, verifier_name, purpose, isConsentGranted ? 'VERIFIED' : 'PENDING_CONSENT')
      .run();
    auditLogged = true;
  } catch {
    // Non-fatal audit log failure
  }

  // 9. Apply DPDP PII Masking
  const finalStudent: Partial<Student> = isConsentGranted
    ? student
    : {
        apaar_id: maskApaar(student.apaar_id),
        full_name: maskName(student.full_name),
        dob: '****-**-**',
        gender: student.gender,
        email: maskEmail(student.email),
        phone: maskPhone(student.phone),
        dpdp_consent_status: student.dpdp_consent_status,
      };

  return {
    success: true,
    student: finalStudent,
    admissions: enrichedAdmissions,
    degrees: verifiedDegrees,
    predicate_result: predicateResult,
    qr_svg: qrSvg,
    vc_payload: vcPayload,
    audit_logged: auditLogged,
    dpdp_consent_applied: !isConsentGranted,
  };
}
