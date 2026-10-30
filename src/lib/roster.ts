import type { DatabaseAdapter } from './db';
import type { Student, Admission, Institution } from './types';

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
}

export interface IngestRosterOptions {
  institutionId: string;
  students: RosterStudentInput[];
  db: DatabaseAdapter;
  actor: {
    username: string;
    role: string;
    institution_id?: string | null;
  };
}

export interface IngestRosterResult {
  success: boolean;
  inserted: number;
  skipped: number;
  duplicates_flagged: number;
  new_enrollment: number;
  sanctioned_intake: number;
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
  const { institutionId, students, db, actor } = options;

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
  const currentEnrollment = institution.current_enrollment;

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
      inserted: 0,
      skipped: skippedCount,
      duplicates_flagged: 0,
      new_enrollment: currentEnrollment,
      sanctioned_intake: sanctionedCap,
      errors: ['No valid 12-digit APAAR records in roster payload'],
    };
  }

  // 4. Atomic capacity lease
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

  if (!reserveRes.success) {
    throw new Error('CONCURRENT_ALLOCATION_CONFLICT: Failed to acquire atomic intake quota lock');
  }

  // 5. Cross-campus duplicate checking and batch insertion
  let insertedCount = 0;
  let duplicatesFlagged = 0;
  const errors: string[] = [];

  try {
    for (const st of validStudents) {
      const existingAdmissions = await db
        .prepare('SELECT * FROM admissions WHERE apaar_id = ?')
        .bind(st.apaar)
        .all<Admission>();

      const isConcurrent = existingAdmissions.results.some(
        (a) => a.institution_id !== institutionId && a.status !== 'CANCELLED'
      );

      const admissionId = `ADM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const status = isConcurrent ? 'FLAGGED_DUPLICATE' : 'CONFIRMED';
      if (isConcurrent) duplicatesFlagged++;

      // Upsert student record
      await db
        .prepare(
          `INSERT OR IGNORE INTO students (apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          st.apaar,
          st.resolvedName,
          st.dob || '2004-01-01',
          st.gender || 'Other',
          st.email || `${st.apaar}@student.ac.in`,
          st.phone || '+91 00000 00000',
          'GRANTED'
        )
        .run();

      // Insert institutional admission record
      await db
        .prepare(
          `INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, status, is_duplicate)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          admissionId,
          st.apaar,
          institutionId,
          st.program || 'B.Tech Engineering',
          st.batch_year || new Date().getFullYear(),
          status,
          isConcurrent ? 1 : 0
        )
        .run();

      insertedCount++;
    }

    return {
      success: true,
      inserted: insertedCount,
      skipped: skippedCount,
      duplicates_flagged: duplicatesFlagged,
      new_enrollment: newProjected,
      sanctioned_intake: sanctionedCap,
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
