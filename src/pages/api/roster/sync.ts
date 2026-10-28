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
    const incomingCount = students.length;
    const projectedEnrollment = currentEnrollment + incomingCount;
    const isOverrun = projectedEnrollment > sanctionedCap;
    const excessSeats = Math.max(0, projectedEnrollment - sanctionedCap);

    const insertedStudents = [];
    const duplicateAlerts = [];

    // 2. Process each valid student
    for (const st of students) {
      const apaar = String(st.apaar_id).trim();
      if (!/^\d{12}$/.test(apaar)) {
        continue; // Skip malformed APAARs from syncing directly
      }

      // Check if this student is already enrolled in another institution
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

      // Insert or update student record
      await db.prepare(
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
      ).run();

      // Insert admission
      const admissionId = `ADM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.prepare(
        `INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        admissionId,
        apaar,
        institutionId,
        st.program || 'B.Tech Computer Science',
        st.batch_year || 2024,
        new Date().toISOString().split('T')[0],
        admissionStatus,
        isDuplicate
      ).run();

      insertedStudents.push({ apaar_id: apaar, full_name: studentName, status: admissionStatus });
    }

    // 3. Update institution enrollment and status
    const updatedStatus = isOverrun ? 'OVERRUN_RISK' : projectedEnrollment >= sanctionedCap * 0.95 ? 'WARNING' : 'NORMAL';
    await db.prepare(
      'UPDATE institutions SET current_enrollment = ?, status = ? WHERE id = ?'
    ).bind(projectedEnrollment, updatedStatus, institutionId).run();

    return new Response(JSON.stringify({
      success: true,
      data: {
        institutionId,
        previousEnrollment: currentEnrollment,
        currentEnrollment: projectedEnrollment,
        sanctionedCap,
        isOverrun,
        excessSeats,
        syncedCount: insertedStudents.length,
        duplicateAlerts,
        message: isOverrun
          ? `WARNING: Sanctioned cap of ${sanctionedCap} seats exceeded! Current enrollment is ${projectedEnrollment} (+${excessSeats} excess). Regulatory risk trigger activated.`
          : `Successfully synchronized ${insertedStudents.length} students to Cloudflare D1.`,
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
