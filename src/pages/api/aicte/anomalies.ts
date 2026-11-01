import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

/** Risk model (kept identical to the previous in-JS computation). */
function scoreInstitution(inst: any) {
  const sanctioned = Number(inst.sanctioned_intake);
  const enrolled = Number(inst.current_enrollment);
  const excess = Math.max(0, enrolled - sanctioned);
  const duplicateCount = Number(inst.duplicate_count) || 0;

  const riskFactors: string[] = [];
  let calculatedRisk = 10.0; // Baseline

  if (excess > 0) {
    calculatedRisk += 55.0 + Math.min(30, excess * 4);
    riskFactors.push(`Seat Cap Overrun (+${excess} seats over sanctioned ${sanctioned})`);
  } else if (enrolled >= sanctioned * 0.98) {
    calculatedRisk += 30.0;
    riskFactors.push(`Near Saturation (${enrolled}/${sanctioned} seats filled)`);
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
    sanctioned,
    enrolled,
    excess,
    duplicate_count: duplicateCount,
    risk_score: calculatedRisk,
    risk_factors: riskFactors.length > 0 ? riskFactors : ['Normal Operations - No Anomalies Detected'],
    priority,
  };
}

// Same risk model expressed in SQL so summary counts are computed in D1, not by loading every row.
const RISK_SQL = `
  MIN(99.8,
    10.0
    + CASE
        WHEN i.current_enrollment > i.sanctioned_intake
          THEN 55.0 + MIN(30, (i.current_enrollment - i.sanctioned_intake) * 4)
        WHEN i.current_enrollment >= i.sanctioned_intake * 0.98 THEN 30.0
        ELSE 0 END
    + 18.0 * (SELECT COUNT(*) FROM admissions a WHERE a.institution_id = i.id AND a.is_duplicate = 1)
  )`;

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const db = getDB(locals);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const offset = (page - 1) * limit;

    // 1. Aggregate summary (single row)
    const summaryRow = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM institutions) AS total_institutions,
        (SELECT COUNT(*) FROM institutions WHERE current_enrollment > sanctioned_intake) AS overrun_count,
        (SELECT COUNT(*) FROM (SELECT apaar_id FROM admissions GROUP BY apaar_id HAVING COUNT(DISTINCT institution_id) > 1)) AS duplicate_students,
        (SELECT COUNT(*) FROM institutions i WHERE ${RISK_SQL} >= 75) AS high_risk_count
    `).bind().first<any>();

    // 2. Paginated institutions ranked by risk, with duplicate counts aggregated in SQL
    const instRes = await db.prepare(`
      SELECT i.id, i.name, i.code, i.state, i.district, i.sanctioned_intake, i.current_enrollment, i.status,
             (SELECT COUNT(*) FROM admissions a WHERE a.institution_id = i.id AND a.is_duplicate = 1) AS duplicate_count,
             ${RISK_SQL} AS computed_risk
      FROM institutions i
      ORDER BY computed_risk DESC, i.id
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all<any>();
    const institutions = instRes.results;

    const riskRankings = institutions.map(scoreInstitution).sort((a, b) => b.risk_score - a.risk_score);

    const overrunColleges = institutions
      .filter((inst) => inst.current_enrollment > inst.sanctioned_intake)
      .map((inst) => ({
        id: inst.id,
        name: inst.name,
        code: inst.code,
        state: inst.state,
        district: inst.district,
        sanctioned_intake: inst.sanctioned_intake,
        current_enrollment: inst.current_enrollment,
        status: inst.status,
        excess: inst.current_enrollment - inst.sanctioned_intake,
        utilization: Number(((inst.current_enrollment / inst.sanctioned_intake) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.excess - a.excess);

    // 3. Paginated cross-campus duplicates: only students enrolled at >1 institution
    const dupRes = await db.prepare(`
      SELECT a.apaar_id, s.full_name, s.email, a.institution_id, inst.name AS institution_name,
             a.program, a.batch_year, a.enrollment_date
      FROM admissions a
      JOIN institutions inst ON inst.id = a.institution_id
      LEFT JOIN students s ON s.apaar_id = a.apaar_id
      WHERE a.apaar_id IN (
        SELECT apaar_id FROM admissions
        GROUP BY apaar_id HAVING COUNT(DISTINCT institution_id) > 1
        ORDER BY apaar_id LIMIT ? OFFSET ?
      )
      ORDER BY a.apaar_id, a.enrollment_date
    `).bind(limit, offset).all<any>();

    const grouped = new Map<string, any>();
    for (const row of dupRes.results) {
      let entry = grouped.get(row.apaar_id);
      if (!entry) {
        entry = {
          apaar_id: row.apaar_id,
          student_name: row.full_name || 'Unknown Student',
          student_email: row.email || `${row.apaar_id}@campus.edu.in`,
          enrollments: [],
        };
        grouped.set(row.apaar_id, entry);
      }
      entry.enrollments.push({
        institution_id: row.institution_id,
        institution_name: row.institution_name || row.institution_id,
        program: row.program,
        batch_year: row.batch_year,
        enrollment_date: row.enrollment_date,
      });
    }
    // Defensive filter (also keeps the local in-memory dev adapter correct)
    const crossCampusDuplicates = [...grouped.values()].filter(
      (d) => new Set(d.enrollments.map((e: any) => e.institution_id)).size > 1
    );

    const hasAgg = summaryRow && summaryRow.total_institutions !== undefined;
    return json({
      success: true,
      data: {
        summary: {
          totalInstitutions: hasAgg ? Number(summaryRow.total_institutions) : institutions.length,
          overrunCount: hasAgg ? Number(summaryRow.overrun_count) : overrunColleges.length,
          duplicateStudentsCount: hasAgg ? Number(summaryRow.duplicate_students) : crossCampusDuplicates.length,
          highRiskCount: hasAgg ? Number(summaryRow.high_risk_count) : riskRankings.filter((r) => r.priority === 'HIGH').length,
        },
        pagination: { page, limit },
        overrunColleges,
        crossCampusDuplicates,
        riskRankings,
      },
    });
  } catch (error: any) {
    return json({ success: false, error: error.message }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDB(locals);
    const body = await request.json();
    const action = String(body.action || '').trim().toUpperCase();

    if (action === 'ISSUE_SHOW_CAUSE') {
      const targetIdOrCode = String(body.institution_id || body.code || '').trim();
      if (!targetIdOrCode) {
        return json({ success: false, error: 'institution_id or code is required for ISSUE_SHOW_CAUSE' }, 400);
      }

      await db
        .prepare('UPDATE institutions SET status = ? WHERE id = ? OR code = ?')
        .bind('SHOW_CAUSE_ISSUED', targetIdOrCode, targetIdOrCode)
        .run();

      return json({
        success: true,
        action: 'ISSUE_SHOW_CAUSE',
        target: targetIdOrCode,
        status: 'SHOW_CAUSE_ISSUED',
        message: `Show-Cause Notice persisted in D1 for ${targetIdOrCode} (APH 2024-27 Clause 7.14).`,
      });
    }

    if (action === 'FREEZE_DUPLICATE_SEAT') {
      const apaarId = String(body.apaar_id || '').trim();
      if (!/^\d{12}$/.test(apaarId)) {
        return json({ success: false, error: 'Valid 12-digit apaar_id is required for FREEZE_DUPLICATE_SEAT' }, 400);
      }

      await db
        .prepare('UPDATE admissions SET status = ? WHERE apaar_id = ?')
        .bind('PFMS_FROZEN', apaarId)
        .run();

      return json({
        success: true,
        action: 'FREEZE_DUPLICATE_SEAT',
        apaar_id: apaarId,
        status: 'PFMS_FROZEN',
        message: `PFMS / NSP Scholarship Hold and Seat Freeze persisted in D1 for APAAR ${apaarId}.`,
      });
    }

    return json({ success: false, error: 'Invalid action. Use ISSUE_SHOW_CAUSE or FREEZE_DUPLICATE_SEAT' }, 400);
  } catch (error: any) {
    return json({ success: false, error: error.message || 'Failed to execute AICTE enforcement action' }, 500);
  }
};
