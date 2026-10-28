export type UserRole = 'AICTE_ADMIN' | 'INSTITUTE_ADMIN' | 'UNIVERSITY_ADMIN' | 'STUDENT' | 'VERIFIER';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  full_name: string;
  role: UserRole;
  institution_id?: string | null;
  apaar_id?: string | null;
  created_at?: string;
}

export interface Session {
  id: string;
  user_id: string;
  role: UserRole;
  institution_id?: string | null;
  expires_at: string;
  created_at?: string;
}

export interface SessionWithUser {
  session: Session;
  user: Omit<User, 'password_hash' | 'salt'>;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  sanctioned_intake: number;
  current_enrollment: number;
  status: 'NORMAL' | 'WARNING' | 'OVERRUN_RISK';
  risk_score: number;
  state: string;
  district: string;
  created_at?: string;
}

export interface Student {
  apaar_id: string;
  full_name: string;
  dob: string;
  gender: string;
  email: string;
  phone: string;
  dpdp_consent_status: 'GRANTED' | 'REVOKED' | 'PENDING';
  passkey_credential_id?: string | null;
  created_at?: string;
}

export interface Admission {
  id: string;
  apaar_id: string;
  institution_id: string;
  program: string;
  batch_year: number;
  enrollment_date: string;
  status: 'ENROLLED' | 'PROVISIONAL' | 'FLAGGED_DUPLICATE';
  is_duplicate: number;
  created_at?: string;
  // joined fields
  institution_name?: string;
  student_name?: string;
}

export interface Degree {
  id: string;
  apaar_id: string;
  institution_id: string;
  degree_name: string;
  specialization: string;
  cgpa: number;
  year_of_passing: number;
  status: 'ISSUED' | 'REVOKED' | 'PENDING';
  issuing_authority: string;
  issued_at: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  digital_signature_hash: string;
  // joined fields
  student_name?: string;
  institution_name?: string;
}

export interface VerificationRequest {
  id: string;
  apaar_id: string;
  verifier_name: string;
  purpose: string;
  consent_status: 'PENDING_BIOMETRIC' | 'GRANTED' | 'DENIED' | 'EXPIRED';
  verified_at?: string | null;
  response_time_ms: number;
  created_at?: string;
}

export interface PasskeyCredential {
  id: string;
  apaar_id: string;
  public_key: string;
  counter: number;
  device_type: string;
  created_at?: string;
}

export interface AnomalyReport {
  overrunColleges: (Institution & { excess: number; utilization: number })[];
  crossCampusDuplicates: {
    apaar_id: string;
    student_name: string;
    enrollments: {
      institution_id: string;
      institution_name: string;
      program: string;
      batch_year: number;
      enrollment_date: string;
    }[];
  }[];
  riskRankings: {
    institution_id: string;
    name: string;
    code: string;
    sanctioned: number;
    enrolled: number;
    risk_score: number;
    risk_factors: string[];
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

// Data Masking Helpers for Statutory DPDP Compliance (Zero Unmasked PII Leaks)
export function maskApaar(apaar: string): string {
  if (!apaar || apaar.length < 12) return 'XXXX-XXXX-9283';
  return `XXXX-XXXX-${apaar.slice(-4)}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return 'r***@***.in';
  const [user] = email.split('@');
  return `${user.slice(0, 1)}***@***.in`;
}

export function maskPhone(phone: string): string {
  if (!phone) return '+91 XXXXX X3210';
  const clean = phone.replace(/\D/g, '');
  const lastFour = clean.slice(-4) || '3210';
  return `+91 XXXXX X${lastFour}`;
}

export function maskName(name: string): string {
  if (!name) return 'Candidate';
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
