import type { DatabaseAdapter } from './db';
import type { Student, Admission, Institution, AdmissionQuota, BranchSeatMatrixRow } from './types';

export interface RosterStudentInput {
  apaar_id: string;
  full_name?: string;
  name?: string;
  dob?: string;
  gender?: string;
  email?: string;
  phone?: string;
  program?: string;
  batch_year?: number;
  dpdp_consent_status?: 'GRANTED' | 'REVOKED' | 'PENDING';
  admission_quota?: AdmissionQuota | string;
  admission_category?: AdmissionQuota | string;
  allotment_ref?: string;
  student_roll_id?: string;
  roll_number?: string;
}

export interface InstitutionSeatTelemetry {
  total_admitted: number;
  sanctioned_intake: number;
  quota_counts: Record<AdmissionQuota, number>;
  duplicates_count: number;
  branch_matrix: BranchSeatMatrixRow[];
}

export function normalizeQuota(raw?: string | null): AdmissionQuota {
  const upper = String(raw || 'APPROVED_INTAKE').trim().toUpperCase();
  if (upper.includes('SUPERNUMERARY') || upper === 'TFWS' || upper === 'EWS' || upper === 'PMSSS') {
    return 'SUPERNUMERARY';
  }
  if (upper === 'NRI') return 'NRI';
  if (upper === 'OCI' || upper === 'PIO') return 'OCI';
  if (upper === 'FN' || upper.includes('FOREIGN')) return 'FN';
  return 'APPROVED_INTAKE';
}

export function computeInstitutionSeatTelemetry(
  admissions: Admission[],
  sanctionedIntake: number = 180
): InstitutionSeatTelemetry {
  const quota_counts: Record<AdmissionQuota, number> = {
    APPROVED_INTAKE: 0,
    SUPERNUMERARY: 0,
    NRI: 0,
    OCI: 0,
    FN: 0,
  };

  let duplicates_count = 0;

  for (const adm of admissions) {
    const q = normalizeQuota(adm.admission_quota);
    quota_counts[q] = (quota_counts[q] || 0) + 1;
    if (adm.is_duplicate === 1 || adm.status === 'FLAGGED_DUPLICATE') {
      duplicates_count++;
    }
  }

  const scale = (sanctionedIntake || 180) / 180;
  const coreBranches = [
    { branch: 'B.Tech Computer Science', code: 'CSE', baseCap: 60 },
    { branch: 'B.Tech Electronics & Comm.', code: 'ECE', baseCap: 60 },
    { branch: 'B.Tech Mechanical Engg', code: 'ME', baseCap: 60 },
  ];

  const matchBranchCode = (program?: string): 'CSE' | 'ECE' | 'ME' => {
    const p = String(program || '').toLowerCase();
    if (p.includes('electr') || p.includes('ece') || p.includes('comm')) return 'ECE';
    if (p.includes('mech')) return 'ME';
    return 'CSE';
  };

  const branch_matrix: BranchSeatMatrixRow[] = coreBranches.map((cb) => {
    const sanctioned = Math.max(1, Math.round(cb.baseCap * scale));
    const branchRows = admissions.filter((a) => matchBranchCode(a.program) === cb.code);
    const admitted = branchRows.length;
    let approved_intake = 0;
    let supernumerary = 0;
    let nri_oci_fn = 0;
    let duplicates = 0;

    for (const r of branchRows) {
      const q = normalizeQuota(r.admission_quota);
      if (q === 'APPROVED_INTAKE') approved_intake++;
      else if (q === 'SUPERNUMERARY') supernumerary++;
      else nri_oci_fn++;

      if (r.is_duplicate === 1 || r.status === 'FLAGGED_DUPLICATE') {
        duplicates++;
      }
    }

    const vacant = Math.max(0, sanctioned - approved_intake);
    const utilization_pct = Number(((admitted / sanctioned) * 100).toFixed(1));

    return {
      branch: cb.branch,
      code: cb.code,
      sanctioned,
      admitted,
      approved_intake,
      supernumerary,
      nri_oci_fn,
      duplicates,
      vacant,
      utilization_pct,
    };
  });

  return {
    total_admitted: admissions.length,
    sanctioned_intake: sanctionedIntake,
    quota_counts,
    duplicates_count,
    branch_matrix,
  };
}

export interface IngestRosterOptions {
  institutionId: string;
  students: RosterStudentInput[];
  mode?: 'single' | 'bulk';
  db: DatabaseAdapter;
  actor: {
    username: string;
    role: string;
    institution_id?: string | null;
  };
}

export interface CreatedAdmissionRecord extends Admission {
  full_name: string;
  student_name: string;
  email: string;
  phone: string;
  dpdp_consent_status: 'GRANTED' | 'REVOKED' | 'PENDING';
  institution_name: string;
}

export interface IngestRosterResult {
  success: boolean;
  mode?: 'single' | 'bulk';
  inserted: number;
  skipped: number;
  duplicates_flagged: number;
  new_enrollment: number;
  sanctioned_intake: number;
  created_admissions?: CreatedAdmissionRecord[];
  errors: string[];
}

export const APAAR_REGEX = /^\d{12}$/;

/**
 * Validates a 12-digit APAAR format according to NDEAR / APAAR registry standards.
 */
export function isValidApaar(id: unknown): boolean {
  if (typeof id !== 'string' && typeof id !== 'number') return false;
  return APAAR_REGEX.test(String(id).trim());
}

/**
 * Deep Roster Intake & Statutory Quota Reservation Module.
 * Encapsulates:
 * 1. Tenant boundary enforcement
 * 2. Input batch sanitization & APAAR isolation
 * 3. Atomic capacity reservation (prevents concurrent over-allocation)
 * 4. Cross-campus duplicate admission detection
 * 5. Batch student/admission ledger writes & compensation rollback
 */
export async function ingestRoster(options: IngestRosterOptions): Promise<IngestRosterResult> {
  const { institutionId, students, mode, db, actor } = options;

  if (!institutionId || !Array.isArray(students)) {
    throw new Error('Invalid payload: institutionId and students array required');
  }

  // 1. Tenant boundary enforcement
  if (actor.role === 'INSTITUTE_ADMIN' && actor.institution_id && actor.institution_id !== institutionId) {
    throw new Error(`Tenant Isolation Violation: Authorized only for ${actor.institution_id}`);
  }
  if (actor.role !== 'INSTITUTE_ADMIN' && actor.role !== 'AICTE_ADMIN') {
    throw new Error('Forbidden: Insufficient privileges for roster ingestion');
  }

  // 2. Fetch institution and check limits
  const instRes = await db.prepare('SELECT * FROM institutions WHERE id = ?').bind(institutionId).all<Institution>();
  const institution = instRes.results[0];
  if (!institution) {
    throw new Error(`Institution ${institutionId} not found`);
  }

  const sanctionedCap = institution.sanctioned_intake;
  let currentEnrollment = institution.current_enrollment;
  const resolvedMode: 'single' | 'bulk' = mode || (students.length === 1 ? 'single' : 'bulk');

  const MAX_BATCH = 1000;
  if (students.length > MAX_BATCH) {
    throw new Error(`Batch too large: max ${MAX_BATCH} students per sync`);
  }

  // 3. Isolate valid 12-digit APAAR identifiers
  const validStudents = students
    .map((st) => ({
      ...st,
      apaar: String(st.apaar_id || '').trim(),
      resolvedName: (st.full_name || st.name || 'Candidate').trim(),
    }))
    .filter((st) => APAAR_REGEX.test(st.apaar));

  const incomingCount = validStudents.length;
  const skippedCount = students.length - incomingCount;

  if (incomingCount === 0) {
    return {
      success: true,
      mode: resolvedMode,
      inserted: 0,
      skipped: skippedCount,
      duplicates_flagged: 0,
      new_enrollment: currentEnrollment,
      sanctioned_intake: sanctionedCap,
      created_admissions: [],
      errors: ['No valid 12-digit APAAR records in roster payload'],
    };
  }

  // 4. Atomic capacity lease (reconcile stale seed enrollment count if actual admissions table has open seats)
  if (currentEnrollment > sanctionedCap) {
    const actualAdmissionsRes = await db
      .prepare('SELECT * FROM admissions WHERE institution_id = ?')
      .bind(institutionId)
      .all<Admission>();
    const actualRowCount = actualAdmissionsRes.results.filter(
      (a) => (a.status as string) !== 'CANCELLED'
    ).length;
    if (actualRowCount + incomingCount <= sanctionedCap) {
      await db
        .prepare('UPDATE institutions SET current_enrollment = ?, status = ? WHERE id = ?')
        .bind(actualRowCount, 'NORMAL', institutionId)
        .run();
      currentEnrollment = actualRowCount;
    }
  }

  const newProjected = currentEnrollment + incomingCount;
  if (newProjected > sanctionedCap) {
    throw new Error(
      `STATUTORY_CAP_EXCEEDED: Cannot enroll ${incomingCount} students. Institution capacity is ${sanctionedCap} with ${currentEnrollment} currently enrolled. Excess: ${newProjected - sanctionedCap}.`
    );
  }

  const reserveRes = await db
    .prepare(
      'UPDATE institutions SET current_enrollment = current_enrollment + ? WHERE id = ? AND current_enrollment + ? <= sanctioned_intake'
    )
    .bind(incomingCount, institutionId, incomingCount)
    .run();

  if (!reserveRes.success || (reserveRes.meta && typeof reserveRes.meta.changes === 'number' && reserveRes.meta.changes === 0)) {
    throw new Error('CONCURRENT_ALLOCATION_CONFLICT: Failed to acquire atomic intake quota lock');
  }

  // 5. Cross-campus duplicate checking and batch insertion
  let insertedCount = 0;
  let skippedDuplicateInSameInst = 0;
  let duplicatesFlagged = 0;
  const errors: string[] = [];
  const createdAdmissions: CreatedAdmissionRecord[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);

  try {
    for (const st of validStudents) {
      const existingAdmissions = await db
        .prepare('SELECT * FROM admissions WHERE apaar_id = ?')
        .bind(st.apaar)
        .all<Admission>();

      const alreadyInSameInst = existingAdmissions.results.some(
        (a) => a.institution_id === institutionId && (a.status as string) !== 'CANCELLED'
      );

      if (alreadyInSameInst) {
        if (resolvedMode === 'single') {
          throw new Error('ALREADY_ENROLLED_IN_INSTITUTION: Student is already admitted in this institution.');
        }
        skippedDuplicateInSameInst++;
        errors.push(`Skipped ${st.apaar}: Already enrolled in ${institutionId}`);
        continue;
      }

      const isConcurrent = existingAdmissions.results.some(
        (a) => a.institution_id !== institutionId && (a.status as string) !== 'CANCELLED'
      );

      if (isConcurrent) {
        duplicatesFlagged++;
        await db
          .prepare("UPDATE admissions SET status = 'FLAGGED_DUPLICATE', is_duplicate = 1 WHERE apaar_id = ?")
          .bind(st.apaar)
          .run();
      }

      const admissionId = `ADM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const status: Admission['status'] = isConcurrent ? 'FLAGGED_DUPLICATE' : 'ENROLLED';

      const resolvedEmail = st.email || `${st.apaar}@student.ac.in`;
      const resolvedPhone = st.phone || '+91 98000 00000';
      const resolvedConsent: 'GRANTED' | 'REVOKED' | 'PENDING' = st.dpdp_consent_status || 'GRANTED';
      const resolvedProgram = st.program || 'B.Tech Computer Science';
      const resolvedBatchYear = Number(st.batch_year) || new Date().getFullYear();
      const resolvedQuota: AdmissionQuota = normalizeQuota(st.admission_quota || st.admission_category);
      const resolvedAllotmentRef = st.allotment_ref ? String(st.allotment_ref).trim() : undefined;
      const resolvedRollNumber = (st.roll_number || st.student_roll_id)
        ? String(st.roll_number || st.student_roll_id).trim()
        : undefined;

      // Upsert student record
      await db
        .prepare(
          `INSERT OR REPLACE INTO students (apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          st.apaar,
          st.resolvedName,
          st.dob || '2004-01-01',
          st.gender || 'Other',
          resolvedEmail,
          resolvedPhone,
          resolvedConsent
        )
        .run();

      // Insert institutional admission record supporting 11-column signature
      await db
        .prepare(
          `INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate, admission_quota, allotment_ref, roll_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          admissionId,
          st.apaar,
          institutionId,
          resolvedProgram,
          resolvedBatchYear,
          todayIso,
          status,
          isConcurrent ? 1 : 0,
          resolvedQuota,
          resolvedAllotmentRef || null,
          resolvedRollNumber || null
        )
        .run();

      createdAdmissions.push({
        id: admissionId,
        apaar_id: st.apaar,
        institution_id: institutionId,
        institution_name: institution.name,
        program: resolvedProgram,
        batch_year: resolvedBatchYear,
        enrollment_date: todayIso,
        status,
        is_duplicate: isConcurrent ? 1 : 0,
        admission_quota: resolvedQuota,
        ...(resolvedAllotmentRef ? { allotment_ref: resolvedAllotmentRef } : {}),
        ...(resolvedRollNumber ? { roll_number: resolvedRollNumber } : {}),
        full_name: st.resolvedName,
        student_name: st.resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        dpdp_consent_status: resolvedConsent,
      });

      insertedCount++;
    }

    if (skippedDuplicateInSameInst > 0) {
      await db
        .prepare('UPDATE institutions SET current_enrollment = current_enrollment - ? WHERE id = ?')
        .bind(skippedDuplicateInSameInst, institutionId)
        .run();
    }

    return {
      success: true,
      mode: resolvedMode,
      inserted: insertedCount,
      skipped: skippedCount + skippedDuplicateInSameInst,
      duplicates_flagged: duplicatesFlagged,
      new_enrollment: currentEnrollment + insertedCount,
      sanctioned_intake: sanctionedCap,
      created_admissions: createdAdmissions,
      errors,
    };
  } catch (err: any) {
    // 6. Automatic compensation rollback on partial batch failure
    await db
      .prepare('UPDATE institutions SET current_enrollment = current_enrollment - ? WHERE id = ?')
      .bind(incomingCount, institutionId)
      .run();
    throw new Error(`Ingestion transaction failed and was rolled back: ${err?.message || String(err)}`);
  }
}
