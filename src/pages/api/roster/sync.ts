import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { Institution } from '../../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const institutionId = (body.institutionId || body.institution_id) as string;
    const students = body.students as Array<{
      apaar_id: string;
      full_name?: string;
      name?: string;
      dob?: string;
      gender?: string;
      email?: string;
      phone?: string;
      program?: string;
      batch_year?: number;
    }>;

    if (!institutionId || !Array.isArray(students)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid payload: institutionId and students array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Enforce Tenant Isolation & RBAC
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Valid administrative session required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.role === 'INSTITUTE_ADMIN' && user.institution_id && user.institution_id !== institutionId) {
      return new Response(JSON.stringify({
        success: false,
        error: `Tenant Isolation Violation: Authorized only for institution ${user.institution_id}. Modification of ${institutionId} is strictly forbidden.`,
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Insufficient privileges to synchronize institution roster' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDB(locals);

    // 1. Fetch current institution data
    const instRes = await db.prepare('SELECT * FROM institutions WHERE id = ?').bind(institutionId).all<Institution>();
    const institution = instRes.results[0];
    if (!institution) {
      return new Response(JSON.stringify({ success: false, error: `Institution ${institutionId} not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sanctionedCap = institution.sanctioned_intake;
    const currentEnrollment = institution.current_enrollment;

    // 2. Validate payload up front (malformed APAARs are skipped, not counted against quota)
    const MAX_BATCH = 1000;
    if (students.length > MAX_BATCH) {
      return new Response(JSON.stringify({ success: false, error: `Batch too large: max ${MAX_BATCH} students per sync` }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const valid = students
      .map((st) => ({ ...st, apaar: String(st.apaar_id).trim() }))
      .filter((st) => /^\d{12}$/.test(st.apaar));
    const incomingCount = valid.length;

    if (incomingCount === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid 12-digit APAAR IDs in payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Atomically reserve seats: only succeeds if the cap is not exceeded (no read-then-write race)
    const reserve = await db.prepare(
      `UPDATE institutions
         SET current_enrollment = current_enrollment + ?,
             status = CASE WHEN current_enrollment + ? >= sanctioned_intake * 0.95 THEN 'WARNING' ELSE 'NORMAL' END
       WHERE id = ? AND current_enrollment + ? <= sanctioned_intake`
    ).bind(incomingCount, incomingCount, institutionId, incomingCount).run();

    if (!reserve.meta || reserve.meta.changes !== 1) {
      const available = Math.max(0, sanctionedCap - currentEnrollment);
      return new Response(JSON.stringify({
        success: false,
        error: `Sanctioned intake exceeded: ${incomingCount} students requested, only ${available} seat(s) available (cap ${sanctionedCap}). Sync rejected.`,
        data: {
          institutionId,
          currentEnrollment,
          sanctionedCap,
          requested: incomingCount,
          available,
          isOverrun: true,
          excessSeats: Math.max(0, currentEnrollment + incomingCount - sanctionedCap),
        },
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Build inserts, flagging cross-campus duplicates
    const insertedStudents = [];
    const duplicateAlerts = [];
    const statements = [];
    const today = new Date().toISOString().split('T')[0];

    for (const st of valid) {
      const apaar = st.apaar;
      const existingAdmissions = await db.prepare('SELECT * FROM admissions WHERE apaar_id = ?').bind(apaar).all();
      const crossEnrolled = existingAdmissions.results.some((a: any) => a.institution_id !== institutionId);

      const admissionStatus = crossEnrolled ? 'FLAGGED_DUPLICATE' : 'ENROLLED';
      const isDuplicate = crossEnrolled ? 1 : 0;
      const studentName = st.full_name || st.name || 'Candidate';

      if (crossEnrolled) {
        duplicateAlerts.push({
          apaar_id: apaar,
          student_name: studentName,
          message: `Student APAAR ${apaar} is already enrolled in an affiliated institution! Flagged for AICTE inspection.`,
        });
      }

      statements.push(
        db.prepare(
          `INSERT OR REPLACE INTO students (apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT dpdp_consent_status FROM students WHERE apaar_id = ?), 'PENDING'))`
        ).bind(
          apaar,
          studentName,
          st.dob || '2004-01-01',
          st.gender || 'Not Specified',
          st.email || `${apaar}@campus.edu.in`,
          st.phone || '+91 90000 00000',
          apaar
        ),
        db.prepare(
          `INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          `ADM-${crypto.randomUUID()}`,
          apaar,
          institutionId,
          st.program || 'B.Tech Computer Science',
          st.batch_year || 2024,
          today,
          admissionStatus,
          isDuplicate
        )
      );

      insertedStudents.push({ apaar_id: apaar, full_name: studentName, status: admissionStatus });
    }

    // 5. Insert everything in one batch (D1 batch is transactional); release seats on failure
    try {
      if (db.batch) {
        await db.batch(statements);
      } else {
        for (const s of statements) await s.run();
      }
    } catch (err) {
      await db.prepare('UPDATE institutions SET current_enrollment = current_enrollment - ? WHERE id = ?')
        .bind(incomingCount, institutionId).run();
      throw err;
    }

    const projectedEnrollment = currentEnrollment + incomingCount;

    return new Response(JSON.stringify({
      success: true,
      data: {
        institutionId,
        previousEnrollment: currentEnrollment,
        currentEnrollment: projectedEnrollment,
        sanctionedCap,
        isOverrun: false,
        excessSeats: 0,
        syncedCount: insertedStudents.length,
        duplicateAlerts,
        message: `Successfully synchronized ${insertedStudents.length} students to Cloudflare D1.`,
      },
    }), {
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
