import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { ingestRoster, type RosterStudentInput } from '../../../lib/roster';
import type { Institution, Admission, Student } from '../../../lib/types';

export const GET: APIRoute = async ({ request, url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Valid administrative session required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const requestedInstId =
      url.searchParams.get('institutionId') ||
      url.searchParams.get('institution_id') ||
      user.institution_id ||
      'INST-001';

    if (user.role === 'INSTITUTE_ADMIN' && user.institution_id && user.institution_id !== requestedInstId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Tenant Isolation Violation: Authorized only for ${user.institution_id}`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Insufficient privileges to access institutional roster',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getDB(locals);

    const instRes = await db
      .prepare('SELECT * FROM institutions WHERE id = ?')
      .bind(requestedInstId)
      .all<Institution>();
    const institution = instRes.results[0];

    if (!institution) {
      return new Response(
        JSON.stringify({ success: false, error: `Institution ${requestedInstId} not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const admRes = await db
      .prepare('SELECT * FROM admissions WHERE institution_id = ?')
      .bind(requestedInstId)
      .all<Admission>();

    const studentsRes = await db.prepare('SELECT * FROM students').bind().all<Student>();
    const studentMap = new Map<string, Student>();
    for (const s of studentsRes.results) {
      studentMap.set(s.apaar_id, s);
    }

    const enrichedAdmissions = admRes.results.map((adm) => {
      const student = studentMap.get(adm.apaar_id);
      const fullName = student?.full_name || adm.student_name || (adm as any).full_name || adm.apaar_id;
      return {
        ...adm,
        institution_name: institution.name,
        student_name: fullName,
        full_name: fullName,
        email: student?.email || (adm as any).email || `${adm.apaar_id}@student.ac.in`,
        phone: student?.phone || (adm as any).phone || '+91 98000 00000',
        dpdp_consent_status: student?.dpdp_consent_status || (adm as any).dpdp_consent_status || 'GRANTED',
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        institution,
        admissions: enrichedAdmissions,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Valid administrative session required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const institutionId = (body.institutionId || body.institution_id || user.institution_id || 'INST-001') as string;
    const action = body.action as string | undefined;

    if (user.role === 'INSTITUTE_ADMIN' && user.institution_id && user.institution_id !== institutionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Tenant Isolation Violation: Authorized only for ${user.institution_id}`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Insufficient privileges for roster ingestion',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getDB(locals);

    // Support normalize_intake / reset_demo_capacity action
    if (action === 'normalize_intake' || action === 'reset_demo_capacity') {
      const instRes = await db
        .prepare('SELECT * FROM institutions WHERE id = ?')
        .bind(institutionId)
        .all<Institution>();
      const inst = instRes.results[0];
      if (!inst) {
        return new Response(
          JSON.stringify({ success: false, error: `Institution ${institutionId} not found` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const targetEnrollment = institutionId === 'INST-001' ? 172 : Math.max(0, inst.sanctioned_intake - 8);
      const sanctionedIntake = inst.sanctioned_intake || 180;

      await db
        .prepare('UPDATE institutions SET current_enrollment = ?, status = ? WHERE id = ?')
        .bind(targetEnrollment, 'NORMAL', institutionId)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          action,
          institution_id: institutionId,
          new_enrollment: targetEnrollment,
          sanctioned_intake: sanctionedIntake,
          status: 'NORMAL',
          message: `Adjusted active batch count to ${targetEnrollment} / ${sanctionedIntake} (${sanctionedIntake - targetEnrollment} seats available) for live admission testing.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Support withdraw_admission / cancel_admission action
    if (action === 'withdraw_admission' || action === 'cancel_admission') {
      return await handleWithdrawAdmission({
        db,
        institutionId,
        admissionId: body.admissionId || body.admission_id || body.id,
        apaarId: body.apaar_id || body.apaarId,
      });
    }

    // Support both Bulk array (`students: [...]`) and Single-Student quick admission (`student: {...}` or direct fields)
    let students: RosterStudentInput[] | undefined = body.students;
    if (!Array.isArray(students)) {
      if (body.student && typeof body.student === 'object') {
        students = [body.student as RosterStudentInput];
      } else if (body.apaar_id) {
        students = [
          {
            apaar_id: String(body.apaar_id),
            full_name: body.full_name || body.name,
            dob: body.dob,
            gender: body.gender,
            email: body.email,
            phone: body.phone,
            program: body.program,
            batch_year: body.batch_year ? Number(body.batch_year) : undefined,
            dpdp_consent_status: body.dpdp_consent_status,
          },
        ];
      }
    }

    const mode: 'single' | 'bulk' | undefined =
      body.mode === 'single' || body.mode === 'bulk'
        ? body.mode
        : Array.isArray(students) && students.length === 1
          ? 'single'
          : 'bulk';

    const result = await ingestRoster({
      institutionId,
      students: students as RosterStudentInput[],
      mode,
      db,
      actor: user,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const msg = err?.message || 'Internal server error';
    let status = 500;
    if (msg.includes('Tenant Isolation Violation') || msg.includes('Forbidden')) status = 403;
    else if (msg.includes('STATUTORY_CAP_EXCEEDED')) status = 409;
    else if (msg.includes('not found')) status = 404;
    else if (msg.includes('Invalid payload') || msg.includes('Batch too large')) status = 400;

    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

async function handleWithdrawAdmission(params: {
  db: ReturnType<typeof getDB>;
  institutionId: string;
  admissionId?: string;
  apaarId?: string;
}): Promise<Response> {
  const { db, institutionId } = params;
  let { admissionId, apaarId } = params;

  if (!admissionId && !apaarId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid payload: admissionId or apaar_id required to withdraw admission',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Locate target admission record in this institution
  let targetAdmission: Admission | undefined;
  if (admissionId) {
    const res = await db
      .prepare('SELECT * FROM admissions WHERE id = ? AND institution_id = ?')
      .bind(admissionId, institutionId)
      .all<Admission>();
    targetAdmission = res.results[0];
  }
  if (!targetAdmission && apaarId) {
    const res = await db
      .prepare('SELECT * FROM admissions WHERE apaar_id = ? AND institution_id = ?')
      .bind(apaarId, institutionId)
      .all<Admission>();
    targetAdmission = res.results[0];
  }

  if (!targetAdmission) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Admission record not found in ${institutionId}`,
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const resolvedAdmissionId = targetAdmission.id;
  const resolvedApaarId = targetAdmission.apaar_id;

  // 1. Delete the admission from `admissions`
  await db
    .prepare('DELETE FROM admissions WHERE id = ? AND institution_id = ?')
    .bind(resolvedAdmissionId, institutionId)
    .run();

  // 2. Decrement `institutions.current_enrollment` by 1
  await db
    .prepare(
      'UPDATE institutions SET current_enrollment = CASE WHEN current_enrollment > 0 THEN current_enrollment - 1 ELSE 0 END WHERE id = ?'
    )
    .bind(institutionId)
    .run();

  // 3. Check if any remaining admission for that `apaar_id` in another college was previously 'FLAGGED_DUPLICATE'
  const remainingRes = await db
    .prepare('SELECT * FROM admissions WHERE apaar_id = ?')
    .bind(resolvedApaarId)
    .all<Admission>();

  if (remainingRes.results.length === 1 && remainingRes.results[0].status === 'FLAGGED_DUPLICATE') {
    await db
      .prepare("UPDATE admissions SET status = 'ENROLLED', is_duplicate = 0 WHERE apaar_id = ?")
      .bind(resolvedApaarId)
      .run();
  }

  // 4. Fetch updated institution enrollment metrics
  const instRes = await db
    .prepare('SELECT * FROM institutions WHERE id = ?')
    .bind(institutionId)
    .all<Institution>();
  const updatedInst = instRes.results[0];

  return new Response(
    JSON.stringify({
      success: true,
      withdrawn_id: resolvedAdmissionId,
      apaar_id: resolvedApaarId,
      institution_id: institutionId,
      new_enrollment: updatedInst?.current_enrollment ?? 0,
      sanctioned_intake: updatedInst?.sanctioned_intake ?? 180,
      status: updatedInst?.status ?? 'NORMAL',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export const DELETE: APIRoute = async ({ request, url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Valid administrative session required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let body: Record<string, any> = {};
    try {
      body = await request.json();
    } catch {
      // Allow query-param based DELETE calls as well
    }

    const institutionId = (
      body.institutionId ||
      body.institution_id ||
      url.searchParams.get('institutionId') ||
      url.searchParams.get('institution_id') ||
      user.institution_id ||
      'INST-001'
    ) as string;

    if (user.role === 'INSTITUTE_ADMIN' && user.institution_id && user.institution_id !== institutionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Tenant Isolation Violation: Authorized only for ${user.institution_id}`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'AICTE_ADMIN') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Insufficient privileges to withdraw admissions',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const admissionId =
      body.admissionId ||
      body.admission_id ||
      body.id ||
      url.searchParams.get('admissionId') ||
      url.searchParams.get('admission_id') ||
      url.searchParams.get('id') ||
      undefined;

    const apaarId =
      body.apaar_id ||
      body.apaarId ||
      url.searchParams.get('apaar_id') ||
      url.searchParams.get('apaarId') ||
      undefined;

    const db = getDB(locals);

    return await handleWithdrawAdmission({
      db,
      institutionId,
      admissionId,
      apaarId,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Internal server error during admission withdrawal',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = DELETE;
