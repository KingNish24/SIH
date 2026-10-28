import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { Institution, Admission, Student } from '../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = getDB(locals);

    // 1. Fetch institutions
    const instRes = await db.prepare('SELECT * FROM institutions').bind().all<Institution>();
    const institutions = instRes.results;

    // 2. Fetch admissions with student and institution details
    const admRes = await db.prepare('SELECT * FROM admissions').bind().all<Admission>();
    const admissions = admRes.results;

    // 3. Fetch students
    const stuRes = await db.prepare('SELECT * FROM students').bind().all<Student>();
    const students = stuRes.results;

    // Identify Overrun Colleges
    const overrunColleges = institutions
      .filter((inst) => inst.current_enrollment > inst.sanctioned_intake)
      .map((inst) => {
        const excess = inst.current_enrollment - inst.sanctioned_intake;
        const utilization = Number(((inst.current_enrollment / inst.sanctioned_intake) * 100).toFixed(1));
        return {
          ...inst,
          excess,
          utilization,
        };
      })
      .sort((a, b) => b.excess - a.excess);

    // Identify Cross-Campus Duplicates
    // Group admissions by apaar_id
    const apaarMap = new Map<string, Admission[]>();
    for (const adm of admissions) {
      if (!apaarMap.has(adm.apaar_id)) {
        apaarMap.set(adm.apaar_id, []);
      }
      apaarMap.get(adm.apaar_id)!.push(adm);
    }

    const crossCampusDuplicates: Array<{
      apaar_id: string;
      student_name: string;
      student_email: string;
      enrollments: Array<{
        institution_id: string;
        institution_name: string;
        program: string;
        batch_year: number;
        enrollment_date: string;
      }>;
    }> = [];

    for (const [apaar, adms] of apaarMap.entries()) {
      // Find distinct institutions this student is enrolled in
      const distinctInstitutions = new Set(adms.map((a) => a.institution_id));
      if (distinctInstitutions.size > 1) {
        const student = students.find((s) => s.apaar_id === apaar);
        const enrollmentList = adms.map((a) => {
          const inst = institutions.find((i) => i.id === a.institution_id);
          return {
            institution_id: a.institution_id,
            institution_name: inst?.name || a.institution_id,
            program: a.program,
            batch_year: a.batch_year,
            enrollment_date: a.enrollment_date,
          };
        });

        crossCampusDuplicates.push({
          apaar_id: apaar,
          student_name: student?.full_name || 'Unknown Student',
          student_email: student?.email || `${apaar}@campus.edu.in`,
          enrollments: enrollmentList,
        });
      }
    }

    // Calculate dynamic risk scores and inspection priorities
    const riskRankings = institutions.map((inst) => {
      const excess = Math.max(0, inst.current_enrollment - inst.sanctioned_intake);
      const instAdmissions = admissions.filter((a) => a.institution_id === inst.id);
      const duplicateCount = instAdmissions.filter((a) => a.is_duplicate === 1).length;

      const riskFactors: string[] = [];
      let calculatedRisk = 10.0; // Baseline

      if (excess > 0) {
        calculatedRisk += 55.0 + Math.min(30, excess * 4);
        riskFactors.push(`Seat Cap Overrun (+${excess} seats over sanctioned ${inst.sanctioned_intake})`);
      } else if (inst.current_enrollment >= inst.sanctioned_intake * 0.98) {
        calculatedRisk += 30.0;
        riskFactors.push(`Near Saturation (${inst.current_enrollment}/${inst.sanctioned_intake} seats filled)`);
      }

      if (duplicateCount > 0) {
        calculatedRisk += duplicateCount * 18.0;
        riskFactors.push(`${duplicateCount} Cross-Campus Duplicate Enrollment(s) Detected`);
      }

      calculatedRisk = Math.min(99.8, Number(calculatedRisk.toFixed(1)));
      const priority = calculatedRisk >= 75 ? 'HIGH' : calculatedRisk >= 40 ? 'MEDIUM' : 'LOW';

      return {
        institution_id: inst.id,
        name: inst.name,
        code: inst.code,
        state: inst.state,
        district: inst.district,
        sanctioned: inst.sanctioned_intake,
        enrolled: inst.current_enrollment,
        excess,
        duplicate_count: duplicateCount,
        risk_score: calculatedRisk,
        risk_factors: riskFactors.length > 0 ? riskFactors : ['Normal Operations - No Anomalies Detected'],
        priority,
      };
    }).sort((a, b) => b.risk_score - a.risk_score);

    return new Response(JSON.stringify({
      success: true,
      data: {
        summary: {
          totalInstitutions: institutions.length,
          overrunCount: overrunColleges.length,
          duplicateStudentsCount: crossCampusDuplicates.length,
          highRiskCount: riskRankings.filter((r) => r.priority === 'HIGH').length,
        },
        overrunColleges,
        crossCampusDuplicates,
        riskRankings,
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
