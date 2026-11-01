// Database interface abstraction supporting Cloudflare D1 and SSR fallback
import type { Institution, Student, Admission, Degree, VerificationRequest, PasskeyCredential, User, Session, ScopedConsentTokenRow, SemesterCreditRow } from './types';

export interface DatabaseAdapter {
  prepare: (query: string) => {
    bind: (...params: any[]) => {
      all: <T = any>() => Promise<{ results: T[] }>;
      first: <T = any>(colName?: string) => Promise<T | null>;
      run: () => Promise<{ success: boolean; meta?: any }>;
    };
  };
  batch?: (statements: any[]) => Promise<any[]>;
}

// In-memory fallback dataset matching seed.sql
class MemoryDBAdapter implements DatabaseAdapter {
  private institutions: Institution[] = [
    {
      id: 'INST-001',
      name: 'Technical College A (Apex Institute of Engineering)',
      code: 'TCA-1049',
      sanctioned_intake: 180,
      current_enrollment: 187,
      status: 'OVERRUN_RISK',
      risk_score: 94.2,
      state: 'Maharashtra',
      district: 'Pune',
    },
    {
      id: 'INST-002',
      name: 'Technical College B (Metro Polytechnic & College)',
      code: 'TCB-2081',
      sanctioned_intake: 120,
      current_enrollment: 115,
      status: 'NORMAL',
      risk_score: 12.5,
      state: 'Karnataka',
      district: 'Bengaluru',
    },
    {
      id: 'INST-003',
      name: 'State University College of Engineering',
      code: 'SUC-3302',
      sanctioned_intake: 240,
      current_enrollment: 238,
      status: 'WARNING',
      risk_score: 48.0,
      state: 'Delhi',
      district: 'New Delhi',
    },
  ];

  private students: Student[] = [
    {
      apaar_id: '739284019283',
      full_name: 'Rahul Sharma',
      dob: '2003-05-14',
      gender: 'Male',
      email: 'rahul.sharma@example.edu.in',
      phone: '+91 98765 43210',
      dpdp_consent_status: 'GRANTED',
      passkey_credential_id: 'cred_webauthn_739284',
    },
    {
      apaar_id: '582910384729',
      full_name: 'Priya Verma',
      dob: '2003-11-20',
      gender: 'Female',
      email: 'priya.v@example.edu.in',
      phone: '+91 98111 22334',
      dpdp_consent_status: 'GRANTED',
      passkey_credential_id: 'cred_webauthn_582910',
    },
    {
      apaar_id: '901238471920',
      full_name: 'Aaditya Patel',
      dob: '2004-02-08',
      gender: 'Male',
      email: 'aaditya.p@example.edu.in',
      phone: '+91 97234 56789',
      dpdp_consent_status: 'PENDING',
      passkey_credential_id: null,
    },
    {
      apaar_id: '412398471029',
      full_name: 'Sneha Sundaram',
      dob: '2002-09-17',
      gender: 'Female',
      email: 'sneha.s@example.edu.in',
      phone: '+91 94440 12345',
      dpdp_consent_status: 'GRANTED',
      passkey_credential_id: 'cred_webauthn_412398',
    },
    {
      apaar_id: '601928374819',
      full_name: 'Vikram Malhotra',
      dob: '2001-12-03',
      gender: 'Male',
      email: 'vikram.m@example.edu.in',
      phone: '+91 98990 87654',
      dpdp_consent_status: 'REVOKED',
      passkey_credential_id: 'cred_webauthn_601928',
    },
    {
      apaar_id: '819203847561',
      full_name: 'Ananya Sen',
      dob: '2003-07-25',
      gender: 'Female',
      email: 'ananya.sen@example.edu.in',
      phone: '+91 98300 54321',
      dpdp_consent_status: 'GRANTED',
      passkey_credential_id: 'cred_webauthn_819203',
    },
  ];

  private admissions: Admission[] = [
    {
      id: 'ADM-2024-001',
      apaar_id: '739284019283',
      institution_id: 'INST-001',
      program: 'B.Tech Computer Science',
      batch_year: 2024,
      enrollment_date: '2024-07-15',
      status: 'FLAGGED_DUPLICATE',
      is_duplicate: 1,
    },
    {
      id: 'ADM-2024-002',
      apaar_id: '739284019283',
      institution_id: 'INST-002',
      program: 'B.Tech Information Technology',
      batch_year: 2024,
      enrollment_date: '2024-07-28',
      status: 'FLAGGED_DUPLICATE',
      is_duplicate: 1,
    },
    {
      id: 'ADM-2024-003',
      apaar_id: '582910384729',
      institution_id: 'INST-001',
      program: 'B.Tech Computer Science',
      batch_year: 2024,
      enrollment_date: '2024-07-12',
      status: 'FLAGGED_DUPLICATE',
      is_duplicate: 1,
    },
    {
      id: 'ADM-2024-004',
      apaar_id: '582910384729',
      institution_id: 'INST-003',
      program: 'B.Tech Electronics & Comm.',
      batch_year: 2024,
      enrollment_date: '2024-08-01',
      status: 'FLAGGED_DUPLICATE',
      is_duplicate: 1,
    },
    {
      id: 'ADM-2024-005',
      apaar_id: '901238471920',
      institution_id: 'INST-001',
      program: 'B.Tech Mechanical Engg',
      batch_year: 2024,
      enrollment_date: '2024-07-20',
      status: 'ENROLLED',
      is_duplicate: 0,
    },
    {
      id: 'ADM-2020-006',
      apaar_id: '412398471029',
      institution_id: 'INST-001',
      program: 'B.Tech Computer Science',
      batch_year: 2020,
      enrollment_date: '2020-08-10',
      status: 'ENROLLED',
      is_duplicate: 0,
    },
    {
      id: 'ADM-2020-007',
      apaar_id: '601928374819',
      institution_id: 'INST-002',
      program: 'B.Tech Civil Engg',
      batch_year: 2020,
      enrollment_date: '2020-08-15',
      status: 'ENROLLED',
      is_duplicate: 0,
    },
    {
      id: 'ADM-2024-008',
      apaar_id: '819203847561',
      institution_id: 'INST-002',
      program: 'B.Tech Data Science',
      batch_year: 2024,
      enrollment_date: '2024-07-22',
      status: 'ENROLLED',
      is_duplicate: 0,
    },
  ];

  private degrees: Degree[] = [
    {
      id: 'DEG-2024-8841',
      apaar_id: '412398471029',
      institution_id: 'INST-001',
      degree_name: 'Bachelor of Technology',
      specialization: 'Computer Science & Engineering',
      cgpa: 9.42,
      year_of_passing: 2024,
      status: 'ISSUED',
      issuing_authority: 'Apex State Technological University',
      issued_at: '2024-06-25 10:30:00',
      revoked_at: null,
      revocation_reason: null,
      digital_signature_hash: 'SHA256:8f4c2e17a3b9092419efacbc093129487cfa9082',
    },
    {
      id: 'DEG-2024-3910',
      apaar_id: '601928374819',
      institution_id: 'INST-002',
      degree_name: 'Bachelor of Technology',
      specialization: 'Civil Engineering',
      cgpa: 7.15,
      year_of_passing: 2024,
      status: 'REVOKED',
      issuing_authority: 'Metro Affiliating University',
      issued_at: '2024-06-20 11:00:00',
      revoked_at: '2024-09-12 14:15:00',
      revocation_reason: 'Academic Integrity Violation: Fraudulent lateral entry credit transfer detected during AICTE audit.',
      digital_signature_hash: 'SHA256:1e7d9904ba81f5c391024849acff90192834bba7',
    },
    {
      id: 'DEG-2024-9921',
      apaar_id: '819203847561',
      institution_id: 'INST-002',
      degree_name: 'Bachelor of Technology',
      specialization: 'Data Science & Artificial Intelligence',
      cgpa: 8.89,
      year_of_passing: 2024,
      status: 'ISSUED',
      issuing_authority: 'Metro Affiliating University',
      issued_at: '2024-06-28 16:45:00',
      revoked_at: null,
      revocation_reason: null,
      digital_signature_hash: 'SHA256:7c9e0182ba00392f4918acde492049182390fade',
    },
  ];

  private verificationRequests: VerificationRequest[] = [
    {
      id: 'REQ-9011',
      apaar_id: '412398471029',
      verifier_name: 'Tata Consultancy Services Ltd',
      purpose: 'Background Verification - Systems Engineer',
      consent_status: 'GRANTED',
      verified_at: '2024-10-24 14:22:10',
      response_time_ms: 1240,
    },
    {
      id: 'REQ-9012',
      apaar_id: '601928374819',
      verifier_name: 'Larsen & Toubro Construction',
      purpose: 'Pre-employment Credential Verification',
      consent_status: 'GRANTED',
      verified_at: '2024-10-25 09:15:42',
      response_time_ms: 980,
    },
    {
      id: 'REQ-9013',
      apaar_id: '739284019283',
      verifier_name: 'National Informatics Centre (NIC)',
      purpose: 'Public Fellowship Eligibility Check',
      consent_status: 'PENDING_BIOMETRIC',
      verified_at: null,
      response_time_ms: 0,
    },
  ];

  private passkeys: PasskeyCredential[] = [
    {
      id: 'cred_webauthn_739284',
      apaar_id: '739284019283',
      public_key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz81...',
      counter: 4,
      device_type: 'Windows Hello Fingerprint Sensor',
    },
    {
      id: 'cred_webauthn_412398',
      apaar_id: '412398471029',
      public_key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz92...',
      counter: 12,
      device_type: 'Apple Touch ID Biometric Sensor',
    },
    {
      id: 'cred_webauthn_582910',
      apaar_id: '582910384729',
      public_key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz93...',
      counter: 2,
      device_type: 'Android FIDO2 Biometric Key',
    },
    {
      id: 'cred_webauthn_601928',
      apaar_id: '601928374819',
      public_key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz94...',
      counter: 1,
      device_type: 'YubiKey 5C NFC FIDO2',
    },
  ];

  private users: User[] = [
    {
      id: 'usr_aicte_001',
      username: 'aicte.officer',
      password_hash: '824e730d989e0352cfb0a1673d07a2791e30717a9b6d5fec437ae261088f5750',
      salt: 'c5d4d9749769e7571454fd79b79d2ad7',
      full_name: 'Dr. S. K. Mahajan (AICTE Chief Regulatory Officer)',
      role: 'AICTE_ADMIN',
      institution_id: null,
      apaar_id: null,
    },
    {
      id: 'usr_inst_001',
      username: 'principal.pune',
      password_hash: '5ce6651ef4d90f081964a610390d72bd6c21684076d552c40fcf52c134ec367b',
      salt: 'e8c17281c34c78ce820a1124e9066700',
      full_name: 'Dr. Ramesh Joshi (Principal, Technical College A)',
      role: 'INSTITUTE_ADMIN',
      institution_id: 'INST-001',
      apaar_id: null,
    },
    {
      id: 'usr_univ_001',
      username: 'registrar.univ',
      password_hash: '301b2c4bb975359a21844de3943e2055ede072ecc7f886ea0d82c75de0cbfea8',
      salt: '002d37270c2f723012aca513ff600724',
      full_name: 'Prof. K. Venkatesh (Registrar, State Affiliating University)',
      role: 'UNIVERSITY_ADMIN',
      institution_id: null,
      apaar_id: null,
    },
    {
      id: 'usr_student_001',
      username: 'student.rahul',
      password_hash: '61a1c0df9dbfb018cc68b2dd46cb88d40225f39203fb2fa0b9e9c20db79f8fe8',
      salt: '1a2784398d44ba4056557f678ed2b7e8',
      full_name: 'Rahul Sharma',
      role: 'STUDENT',
      institution_id: 'INST-001',
      apaar_id: '739284019283',
    },
    {
      id: 'usr_verifier_001',
      username: 'verifier.gov',
      password_hash: '02ebdecc9c7fbc3fcca1fcc4648d647833d70405b16992cba0a9cc5f7ffa3b92',
      salt: 'f2ab869161bb2a63630f857ccd0c3d6e',
      full_name: 'Vikramaditya Rao (Chief Verification Officer, National Gateway)',
      role: 'VERIFIER',
      institution_id: null,
      apaar_id: null,
    },
  ];

  private sessions: Session[] = [];

  private scopedConsentTokens: ScopedConsentTokenRow[] = [
    {
      token_id: 'VIDYA-DPDP-8492-A19F',
      apaar_id: '739284019283',
      verifier_org: 'UPSC Civil Services Board',
      purpose: 'Degree & Eligibility Verification',
      disclosed_fields: JSON.stringify(['degree_status', 'cgpa_threshold', 'abc_credits']),
      ttl_label: '24 Hours (Single-Use)',
      single_use: 1,
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      signature_digest: 'SHA256:9f41c80b2a73e19d4401bc8a772e9012f3451d0a8b76c5e1290a4f8b3c12e771',
    },
    {
      token_id: 'VIDYA-DPDP-3104-C72B',
      apaar_id: '739284019283',
      verifier_org: 'TCS Background Verification',
      purpose: 'Zero-Knowledge CGPA >= 7.5 Check',
      disclosed_fields: JSON.stringify(['degree_status', 'cgpa_threshold']),
      ttl_label: '1 Hour (Single-Use)',
      single_use: 1,
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
      signature_digest: 'SHA256:4a82d19f0e55b62c8910fa32817465bc9012e4f8a1b2c3d4e5f60718293a4b5c',
    },
    {
      token_id: 'VIDYA-DPDP-6291-E08D',
      apaar_id: '412398471029',
      verifier_org: 'GATE Admissions Committee (IIT Roorkee)',
      purpose: 'B.Tech Honours & ABC 160-Credit Audit',
      disclosed_fields: JSON.stringify(['degree_status', 'cgpa_threshold', 'abc_credits']),
      ttl_label: '24 Hours (Single-Use)',
      single_use: 1,
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      signature_digest: 'SHA256:7d12e84a90b3c4f12839045a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8',
    },
    {
      token_id: 'VIDYA-DPDP-5510-F94A',
      apaar_id: '582910384729',
      verifier_org: 'DRDO Scientist Entry Recruitment Board',
      purpose: 'Degree & Eligibility Verification',
      disclosed_fields: JSON.stringify(['degree_status', 'cgpa_threshold']),
      ttl_label: '24 Hours (Single-Use)',
      single_use: 1,
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      signature_digest: 'SHA256:3c91a04f82e1b7d6543210fedcba9876543210abcdef0123456789abcdef0123',
    },
  ];

  private semesterCredits: SemesterCreditRow[] = [
    {
      apaar_id: '739284019283',
      program: 'B.Tech Computer Science & Engineering',
      accumulated_credits: 120,
      max_credits: 160,
      nep_exit_stage: "120 Credits — 3-Year Bachelor's Degree Eligible (Semester 6 Completed)",
      semester_breakdown: JSON.stringify([20, 20, 20, 20, 20, 20, 0, 0]),
      is_lateral_entry: 1,
      entry_mode: '2nd-Year Lateral Entry (Sem 3 Direct)',
      prior_diploma_board: 'MSBTE State Polytechnic Diploma (Computer Engg — 80 Credits)',
      transferred_credits: 80,
      lateral_status: 'VERIFIED_ANCHORED',
      lateral_note: 'Prior 3-Year Polytechnic Diploma (80 ABC Credits) cryptographically verified via DigiLocker & MSBTE ledger before 2nd-Year B.Tech Lateral Entry.',
    },
    {
      apaar_id: '412398471029',
      program: 'B.Tech Computer Science & Engineering',
      accumulated_credits: 160,
      max_credits: 160,
      nep_exit_stage: '160 Credits — 4-Year B.Tech Honours / Research Degree Conferred',
      semester_breakdown: JSON.stringify([20, 20, 20, 20, 20, 20, 20, 20]),
      is_lateral_entry: 0,
      entry_mode: '1st-Year Regular (10+2 PCM)',
      prior_diploma_board: 'Direct 1st-Year Regular Admission (10+2 PCM Qualifying)',
      transferred_credits: 0,
      lateral_status: 'STANDARD_ENTRY',
      lateral_note: 'All 8 semesters (160 Credits) earned continuously at AICTE-approved parent institution.',
    },
    {
      apaar_id: '582910384729',
      program: 'B.Tech Electronics & Comm.',
      accumulated_credits: 80,
      max_credits: 160,
      nep_exit_stage: '80 Credits — UG Diploma / Lateral Entry Eligible (Exit Year 2)',
      semester_breakdown: JSON.stringify([20, 20, 20, 20, 0, 0, 0, 0]),
      is_lateral_entry: 1,
      entry_mode: '2nd-Year Lateral Entry (Sem 3 Direct)',
      prior_diploma_board: 'DTE Karnataka Polytechnic Diploma (Electronics — 80 Credits)',
      transferred_credits: 80,
      lateral_status: 'VERIFIED_ANCHORED',
      lateral_note: 'Verified 80-credit UG Diploma anchored to 12-digit APAAR ID; eligible for NEP 2020 2nd-Year Lateral Entry.',
    },
    {
      apaar_id: '901238471920',
      program: 'B.Tech Mechanical Engineering',
      accumulated_credits: 40,
      max_credits: 160,
      nep_exit_stage: '40 Credits — UG Certificate Threshold Reached (Exit Year 1)',
      semester_breakdown: JSON.stringify([20, 20, 0, 0, 0, 0, 0, 0]),
      is_lateral_entry: 0,
      entry_mode: '1st-Year Regular (10+2 PCM)',
      prior_diploma_board: 'Direct 1st-Year Regular Admission (10+2 Qualifying)',
      transferred_credits: 0,
      lateral_status: 'STANDARD_ENTRY',
      lateral_note: 'Completed Year 1 (40 Credits); qualifies for NEP 2020 UG Certificate if exiting early.',
    },
    {
      apaar_id: '601928374819',
      program: 'B.Tech Civil Engineering',
      accumulated_credits: 120,
      max_credits: 160,
      nep_exit_stage: 'REVOKED — Unverified Lateral Entry Credit Transfer Blocked',
      semester_breakdown: JSON.stringify([0, 0, 20, 20, 20, 20, 20, 20]),
      is_lateral_entry: 1,
      entry_mode: '2nd-Year Lateral Entry (Disputed)',
      prior_diploma_board: 'Unverified Private Polytechnic Certificate (No ABC / APAAR Anchor)',
      transferred_credits: 80,
      lateral_status: 'DISCREPANCY_FLAGGED',
      lateral_note: 'ALERT: Claimed 80 lateral-entry diploma credits lacked cryptographic APAAR/ABC provenance. Degree revoked during AICTE audit.',
    },
    {
      apaar_id: '819203847561',
      program: 'B.Tech Data Science & AI',
      accumulated_credits: 160,
      max_credits: 160,
      nep_exit_stage: '160 Credits — 4-Year B.Tech Honours / Research Degree Conferred',
      semester_breakdown: JSON.stringify([20, 20, 20, 20, 20, 20, 20, 20]),
      is_lateral_entry: 0,
      entry_mode: '1st-Year Regular (10+2 PCM)',
      prior_diploma_board: 'Direct 1st-Year Regular Admission (10+2 Qualifying)',
      transferred_credits: 0,
      lateral_status: 'STANDARD_ENTRY',
      lateral_note: 'Full 160-credit B.Tech curriculum verified and anchored on National Academic Bank of Credits.',
    },
  ];

  prepare(query: string) {
    const q = query.trim();
    return {
      bind: (...params: any[]) => {
        return {
          all: async <T = any>(): Promise<{ results: T[] }> => {
            const results = this.executeSelect(q, params);
            return { results: results as T[] };
          },
          first: async <T = any>(colName?: string): Promise<T | null> => {
            const results = this.executeSelect(q, params);
            if (results.length === 0) return null;
            if (colName) return results[0][colName] ?? null;
            return results[0] as T;
          },
          run: async () => {
            return this.executeMutation(q, params);
          },
        };
      },
    };
  }

  async batch(statements: Array<{ run: () => Promise<any> }>): Promise<any[]> {
    const out = [];
    for (const s of statements) out.push(await s.run());
    return out;
  }

  private executeSelect(query: string, params: any[]): any[] {
    const upper = query.toUpperCase();

    if (upper.includes('FROM INSTITUTIONS')) {
      if (upper.includes('WHERE ID = ?')) {
        const inst = this.institutions.find((i) => i.id === params[0]);
        return inst ? [{ ...inst }] : [];
      }
      return this.institutions.map((i) => ({ ...i }));
    }

    if (upper.includes('FROM STUDENTS')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        const student = this.students.find((s) => s.apaar_id === params[0]);
        return student ? [{ ...student }] : [];
      }
      return this.students.map((s) => ({ ...s }));
    }

    if (upper.includes('FROM ADMISSIONS')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        return this.admissions
          .filter((a) => a.apaar_id === params[0])
          .map((a) => {
            const inst = this.institutions.find((i) => i.id === a.institution_id);
            return { ...a, institution_name: inst?.name || a.institution_id };
          });
      }
      if (upper.includes('WHERE INSTITUTION_ID = ?')) {
        return this.admissions
          .filter((a) => a.institution_id === params[0])
          .map((a) => {
            const s = this.students.find((st) => st.apaar_id === a.apaar_id);
            return { ...a, student_name: s?.full_name || a.apaar_id };
          });
      }
      return this.admissions.map((a) => {
        const inst = this.institutions.find((i) => i.id === a.institution_id);
        const s = this.students.find((st) => st.apaar_id === a.apaar_id);
        return {
          ...a,
          institution_name: inst?.name || a.institution_id,
          student_name: s?.full_name || a.apaar_id,
        };
      });
    }

    if (upper.includes('FROM DEGREES')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        return this.degrees
          .filter((d) => d.apaar_id === params[0])
          .map((d) => {
            const inst = this.institutions.find((i) => i.id === d.institution_id);
            const s = this.students.find((st) => st.apaar_id === d.apaar_id);
            return {
              ...d,
              institution_name: inst?.name || d.institution_id,
              student_name: s?.full_name || d.apaar_id,
            };
          });
      }
      if (upper.includes('WHERE ID = ?')) {
        const deg = this.degrees.find((d) => d.id === params[0]);
        return deg ? [{ ...deg }] : [];
      }
      return this.degrees.map((d) => {
        const inst = this.institutions.find((i) => i.id === d.institution_id);
        const s = this.students.find((st) => st.apaar_id === d.apaar_id);
        return {
          ...d,
          institution_name: inst?.name || d.institution_id,
          student_name: s?.full_name || d.apaar_id,
        };
      });
    }

    if (upper.includes('FROM VERIFICATION_REQUESTS')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        return this.verificationRequests.filter((r) => r.apaar_id === params[0]).map((r) => ({ ...r }));
      }
      return this.verificationRequests.map((r) => ({ ...r }));
    }

    if (upper.includes('FROM PASSKEY_CREDENTIALS')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        return this.passkeys.filter((p) => p.apaar_id === params[0]).map((p) => ({ ...p }));
      }
      return this.passkeys.map((p) => ({ ...p }));
    }

    if (upper.includes('FROM SESSIONS') && upper.includes('JOIN USERS')) {
      const sessionId = params[0];
      const nowIso = params[1] || new Date().toISOString();
      const session = this.sessions.find((s) => s.id === sessionId && s.expires_at > nowIso);
      if (!session) return [];
      const user = this.users.find((u) => u.id === session.user_id);
      if (!user) return [];
      return [
        {
          session_id: session.id,
          user_id: session.user_id,
          session_role: session.role,
          session_institution_id: session.institution_id,
          expires_at: session.expires_at,
          session_created_at: session.created_at,
          u_id: user.id,
          username: user.username,
          password_hash: user.password_hash,
          salt: user.salt,
          full_name: user.full_name,
          u_role: user.role,
          u_institution_id: user.institution_id,
          apaar_id: user.apaar_id,
          u_created_at: user.created_at,
        },
      ];
    }

    if (upper.includes('FROM SESSIONS')) {
      if (upper.includes('WHERE ID = ?')) {
        const sess = this.sessions.find((s) => s.id === params[0]);
        return sess ? [{ ...sess }] : [];
      }
      return this.sessions.map((s) => ({ ...s }));
    }

    if (upper.includes('FROM USERS')) {
      if (upper.includes('WHERE USERNAME = ?')) {
        const user = this.users.find((u) => u.username.toLowerCase() === String(params[0]).toLowerCase());
        return user ? [{ ...user }] : [];
      }
      if (upper.includes('WHERE ID = ?')) {
        const user = this.users.find((u) => u.id === params[0]);
        return user ? [{ ...user }] : [];
      }
      return this.users.map((u) => ({ ...u }));
    }

    if (upper.includes('FROM SCOPED_CONSENT_TOKENS')) {
      if (upper.includes('WHERE TOKEN_ID = ?')) {
        const tok = this.scopedConsentTokens.find((t) => t.token_id === params[0]);
        return tok ? [{ ...tok }] : [];
      }
      if (upper.includes('WHERE APAAR_ID = ?')) {
        return this.scopedConsentTokens
          .filter((t) => t.apaar_id === params[0])
          .map((t) => ({ ...t }));
      }
      return this.scopedConsentTokens.map((t) => ({ ...t }));
    }

    if (upper.includes('FROM SEMESTER_CREDITS')) {
      if (upper.includes('WHERE APAAR_ID = ?')) {
        const row = this.semesterCredits.find((c) => c.apaar_id === params[0]);
        return row ? [{ ...row }] : [];
      }
      return this.semesterCredits.map((c) => ({ ...c }));
    }

    return [];
  }

  private executeMutation(query: string, params: any[]): { success: boolean; meta?: any } {
    const upper = query.toUpperCase();

    // ATOMIC QUOTA RESERVATION: params = [count, count, instId, count]
    if (upper.includes('CURRENT_ENROLLMENT = CURRENT_ENROLLMENT + ?')) {
      const n = Number(params[0]);
      const inst = this.institutions.find((i) => i.id === params[2]);
      if (!inst || inst.current_enrollment + n > inst.sanctioned_intake) {
        return { success: true, meta: { changes: 0 } };
      }
      inst.current_enrollment += n;
      inst.status = inst.current_enrollment >= inst.sanctioned_intake * 0.95 ? 'WARNING' : 'NORMAL';
      return { success: true, meta: { changes: 1 } };
    }

    // UPDATE INSTITUTIONS ENROLLMENT
    if (upper.includes('UPDATE INSTITUTIONS SET CURRENT_ENROLLMENT')) {
      const newEnroll = params[0];
      const newStatus = params[1];
      const instId = params[2];
      const inst = this.institutions.find((i) => i.id === instId);
      if (inst) {
        inst.current_enrollment = newEnroll;
        inst.status = newStatus;
      }
      return { success: true };
    }

    // UPDATE INSTITUTIONS STATUS (AICTE SHOW-CAUSE NOTICE / AUDIT)
    if (upper.includes('UPDATE INSTITUTIONS SET STATUS = ?')) {
      const [newStatus, idOrCode] = params;
      const inst = this.institutions.find((i) => i.id === idOrCode || i.code === idOrCode);
      if (inst) {
        inst.status = newStatus;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // UPDATE ADMISSIONS STATUS (AICTE PFMS FREEZE / DUPLICATE HOLD)
    if (upper.includes('UPDATE ADMISSIONS SET STATUS = ?')) {
      const [newStatus, apaar_id] = params;
      let changes = 0;
      for (const adm of this.admissions) {
        if (adm.apaar_id === apaar_id) {
          adm.status = newStatus;
          changes++;
        }
      }
      return { success: true, meta: { changes } };
    }

    // INSERT INTO STUDENTS
    if (upper.includes('INSERT INTO STUDENTS') || upper.includes('INSERT OR REPLACE INTO STUDENTS')) {
      const [apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status, passkey_credential_id] = params;
      const existingIdx = this.students.findIndex((s) => s.apaar_id === apaar_id);
      const studentObj: Student = {
        apaar_id,
        full_name,
        dob: dob || '2004-01-01',
        gender: gender || 'Unspecified',
        email: email || `${apaar_id}@student.ac.in`,
        phone: phone || '+91 90000 00000',
        dpdp_consent_status: dpdp_consent_status || 'PENDING',
        passkey_credential_id: passkey_credential_id || null,
      };
      if (existingIdx >= 0) {
        this.students[existingIdx] = studentObj;
      } else {
        this.students.push(studentObj);
      }
      return { success: true };
    }

    // INSERT INTO ADMISSIONS
    if (upper.includes('INSERT INTO ADMISSIONS')) {
      const [id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate] = params;
      this.admissions.push({
        id,
        apaar_id,
        institution_id,
        program,
        batch_year: Number(batch_year) || 2024,
        enrollment_date: enrollment_date || new Date().toISOString().split('T')[0],
        status: status || 'ENROLLED',
        is_duplicate: Number(is_duplicate) || 0,
      });

      // Update institution current enrollment
      const inst = this.institutions.find((i) => i.id === institution_id);
      if (inst) {
        inst.current_enrollment += 1;
        if (inst.current_enrollment > inst.sanctioned_intake) {
          inst.status = 'OVERRUN_RISK';
          inst.risk_score = Math.min(100, Math.round(85 + (inst.current_enrollment - inst.sanctioned_intake) * 2));
        }
      }
      return { success: true };
    }

    // UPDATE DEGREES (REVOKE / GRANT / REINSTATE)
    if (upper.includes("UPDATE DEGREES SET STATUS = 'ISSUED'")) {
      const [id] = params;
      const deg = this.degrees.find((d) => d.id === id);
      if (deg) {
        deg.status = 'ISSUED';
        deg.revoked_at = null;
        deg.revocation_reason = null;
      }
      return { success: true };
    }

    if (upper.includes('UPDATE DEGREES SET STATUS = ?')) {
      const [status, revoked_at, revocation_reason, id] = params;
      const deg = this.degrees.find((d) => d.id === id);
      if (deg) {
        deg.status = status;
        deg.revoked_at = revoked_at;
        deg.revocation_reason = revocation_reason;
      }
      return { success: true };
    }

    // INSERT INTO DEGREES
    if (upper.includes('INSERT INTO DEGREES')) {
      const [id, apaar_id, institution_id, degree_name, specialization, cgpa, year_of_passing, statusOrAuth, authOrIssued, issuedOrHash, hashOrSig, sigOrKey, keyIdMaybe] = params;
      const hasExplicitIssuedLiteral = upper.includes("'ISSUED'");
      const status = hasExplicitIssuedLiteral ? 'ISSUED' : (statusOrAuth || 'ISSUED');
      const issuing_authority = hasExplicitIssuedLiteral ? statusOrAuth : authOrIssued;
      const issued_at = hasExplicitIssuedLiteral ? authOrIssued : issuedOrHash;
      const digital_signature_hash = hasExplicitIssuedLiteral ? issuedOrHash : hashOrSig;
      const signature = hasExplicitIssuedLiteral ? hashOrSig : sigOrKey;
      const signing_key_id = hasExplicitIssuedLiteral ? sigOrKey : keyIdMaybe;

      this.degrees.push({
        id,
        apaar_id,
        institution_id,
        degree_name,
        specialization,
        cgpa: Number(cgpa) || 8.0,
        year_of_passing: Number(year_of_passing) || 2024,
        status: status as any,
        issuing_authority,
        issued_at: issued_at || new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        digital_signature_hash,
        ...(signature ? { signature } : {}),
        ...(signing_key_id ? { signing_key_id } : {}),
      } as any);
      return { success: true };
    }

    // INSERT INTO VERIFICATION_REQUESTS
    if (upper.includes('INSERT INTO VERIFICATION_REQUESTS')) {
      const [id, apaar_id, verifier_name, purpose, consent_status, verified_at, response_time_ms] = params;
      this.verificationRequests.unshift({
        id,
        apaar_id,
        verifier_name,
        purpose,
        consent_status: consent_status || 'GRANTED',
        verified_at: verified_at || new Date().toISOString(),
        response_time_ms: Number(response_time_ms) || 850,
      });
      return { success: true };
    }

    // UPDATE STUDENT DPDP CONSENT
    if (upper.includes('UPDATE STUDENTS SET DPDP_CONSENT_STATUS = ?')) {
      const [status, apaar_id] = params;
      const student = this.students.find((s) => s.apaar_id === apaar_id);
      if (student) {
        student.dpdp_consent_status = status;
      }
      return { success: true };
    }

    // INSERT PASSKEY
    if (upper.includes('INSERT INTO PASSKEY_CREDENTIALS')) {
      const [id, apaar_id, public_key, counter, device_type, transports] = params;
      this.passkeys.push({
        id,
        apaar_id,
        public_key,
        counter: Number(counter) || 0,
        device_type: device_type || 'Biometric Passkey',
        transports: transports || null,
      });
      const st = this.students.find((s) => s.apaar_id === apaar_id);
      if (st) {
        st.passkey_credential_id = id;
        st.dpdp_consent_status = 'GRANTED';
      }
      return { success: true };
    }

    // UPDATE PASSKEY COUNTER
    if (upper.includes('UPDATE PASSKEY_CREDENTIALS SET COUNTER = ?')) {
      const [counter, id] = params;
      const pk = this.passkeys.find((p) => p.id === id);
      if (pk) pk.counter = Number(counter) || 0;
      return { success: true };
    }

    // UPDATE STUDENT CONSENT & PASSKEY CREDENTIAL ID
    if (upper.includes('UPDATE STUDENTS SET DPDP_CONSENT_STATUS = ?, PASSKEY_CREDENTIAL_ID = ?')) {
      const [status, credId, apaar_id] = params;
      const st = this.students.find((s) => s.apaar_id === apaar_id);
      if (st) {
        st.dpdp_consent_status = status;
        st.passkey_credential_id = credId;
      }
      return { success: true };
    }

    // INSERT INTO SCOPED_CONSENT_TOKENS
    if (upper.includes('INTO SCOPED_CONSENT_TOKENS')) {
      const [token_id, apaar_id, verifier_org, purpose, disclosed_fields, ttl_label, single_use, status, created_at, expires_at, signature_digest] = params;
      const existingIdx = this.scopedConsentTokens.findIndex((t) => t.token_id === token_id);
      const row: ScopedConsentTokenRow = {
        token_id,
        apaar_id,
        verifier_org,
        purpose,
        disclosed_fields: typeof disclosed_fields === 'string' ? disclosed_fields : JSON.stringify(disclosed_fields || []),
        ttl_label,
        single_use: Number(single_use) ? 1 : 0,
        status: (status as any) || 'ACTIVE',
        created_at,
        expires_at,
        signature_digest,
      };
      if (existingIdx >= 0) {
        this.scopedConsentTokens[existingIdx] = row;
      } else {
        this.scopedConsentTokens.unshift(row);
      }
      return { success: true };
    }

    // UPDATE SCOPED_CONSENT_TOKENS STATUS
    if (upper.includes('UPDATE SCOPED_CONSENT_TOKENS SET STATUS = ?')) {
      const [status, token_id] = params;
      const tok = this.scopedConsentTokens.find((t) => t.token_id === token_id);
      if (tok) {
        tok.status = status;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }

    // INSERT OR REPLACE INTO SEMESTER_CREDITS
    if (upper.includes('INTO SEMESTER_CREDITS')) {
      const [apaar_id, program, accumulated_credits, max_credits, nep_exit_stage, semester_breakdown, is_lateral_entry, entry_mode, prior_diploma_board, transferred_credits, lateral_status, lateral_note] = params;
      const idx = this.semesterCredits.findIndex((c) => c.apaar_id === apaar_id);
      const row: SemesterCreditRow = {
        apaar_id,
        program,
        accumulated_credits: Number(accumulated_credits) || 0,
        max_credits: Number(max_credits) || 160,
        nep_exit_stage,
        semester_breakdown: typeof semester_breakdown === 'string' ? semester_breakdown : JSON.stringify(semester_breakdown || []),
        is_lateral_entry: Number(is_lateral_entry) ? 1 : 0,
        entry_mode,
        prior_diploma_board,
        transferred_credits: Number(transferred_credits) || 0,
        lateral_status: (lateral_status as any) || 'STANDARD_ENTRY',
        lateral_note,
      };
      if (idx >= 0) {
        this.semesterCredits[idx] = row;
      } else {
        this.semesterCredits.push(row);
      }
      return { success: true };
    }

    // INSERT INTO SESSIONS
    if (upper.includes('INSERT INTO SESSIONS')) {
      const [id, user_id, role, institution_id, expires_at] = params;
      this.sessions.push({
        id,
        user_id,
        role,
        institution_id: institution_id || null,
        expires_at,
        created_at: new Date().toISOString(),
      });
      return { success: true };
    }

    // DELETE FROM SESSIONS WHERE ID = ?
    if (upper.includes('DELETE FROM SESSIONS WHERE ID = ?')) {
      const id = params[0];
      this.sessions = this.sessions.filter((s) => s.id !== id);
      return { success: true };
    }

    // DELETE FROM SESSIONS WHERE EXPIRES_AT < ?
    if (upper.includes('DELETE FROM SESSIONS WHERE EXPIRES_AT < ?')) {
      const cutoff = params[0];
      this.sessions = this.sessions.filter((s) => s.expires_at >= cutoff);
      return { success: true };
    }

    // INSERT OR REPLACE INTO USERS
    if (upper.includes('INTO USERS')) {
      const [id, username, password_hash, salt, full_name, role, institution_id, apaar_id] = params;
      const idx = this.users.findIndex((u) => u.id === id || u.username === username);
      const user: User = {
        id,
        username,
        password_hash,
        salt,
        full_name,
        role,
        institution_id: institution_id || null,
        apaar_id: apaar_id || null,
        created_at: new Date().toISOString(),
      };
      if (idx >= 0) {
        this.users[idx] = user;
      } else {
        this.users.push(user);
      }
      return { success: true };
    }

    return { success: true };
  }
}

// Global fallback singleton across requests
const memoryDB = new MemoryDBAdapter();

let cfEnv: any = null;

try {
  // @ts-ignore
  const cfMod = await import('cloudflare:workers');
  if (cfMod?.env) {
    cfEnv = cfMod.env;
  }
} catch {
  // Running in local Bun / Node dev environment
}

/** Cloudflare env bindings (null outside the Workers runtime). */
export function getEnv(): Record<string, any> | null {
  return cfEnv;
}

export function getDB(locals?: any): DatabaseAdapter {
  const db = cfEnv?.DB ?? locals?.runtime?.env?.DB;
  if (db) {
    return db as DatabaseAdapter;
  }
  // In-memory fallback is for local development only; never silently serve mock data in production.
  if (cfEnv || import.meta.env.PROD) {
    throw new Error('D1 binding "DB" is not configured. Refusing to fall back to in-memory database in production.');
  }
  return memoryDB;
}
