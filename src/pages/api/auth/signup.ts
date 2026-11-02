import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import {
  hashPassword,
  createSession,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '../../../lib/auth';
import { isSupportedLang, type LangCode } from '../../../lib/i18n';
import type { User } from '../../../lib/types';

function resolveSignupLang(request: Request, locals: App.Locals, cookies: any): LangCode {
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const firstSeg = refUrl.pathname.split('/').filter(Boolean)[0];
      if (isSupportedLang(firstSeg)) {
        return firstSeg;
      }
    } catch {}
  }
  const cookieLang = cookies?.get?.('gov_preferred_lang')?.value;
  if (isSupportedLang(cookieLang)) {
    return cookieLang;
  }
  if (isSupportedLang(locals?.lang)) {
    return locals.lang;
  }
  return 'en';
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  try {
    const lang = resolveSignupLang(request, locals, cookies);
    const langPrefix = lang === 'en' ? '' : `/${lang}`;
    const studentLoginPath = `${langPrefix}/login/student`;

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let full_name = '';
    let apaar_id = '';
    let username = '';
    let email = '';
    let phone = '';
    let dob = '2004-05-15';
    let gender = 'Male';
    let institution_id = 'INST-001';
    let program = 'B.Tech Computer Science & Engineering';
    let password = '';

    if (isJson) {
      const body = await request.json().catch(() => ({}));
      full_name = String(body.full_name || '').trim();
      apaar_id = String(body.apaar_id || '').replace(/\D/g, '').trim();
      username = String(body.username || '').trim().toLowerCase();
      email = String(body.email || '').trim();
      phone = String(body.phone || '').trim();
      dob = String(body.dob || '2004-05-15').trim();
      gender = String(body.gender || 'Male').trim();
      institution_id = String(body.institution_id || 'INST-001').trim();
      program = String(body.program || 'B.Tech Computer Science & Engineering').trim();
      password = String(body.password || '');
    } else {
      const formData = await request.formData().catch(() => new FormData());
      full_name = String(formData.get('full_name') || '').trim();
      apaar_id = String(formData.get('apaar_id') || '').replace(/\D/g, '').trim();
      username = String(formData.get('username') || '').trim().toLowerCase();
      email = String(formData.get('email') || '').trim();
      phone = String(formData.get('phone') || '').trim();
      dob = String(formData.get('dob') || '2004-05-15').trim();
      gender = String(formData.get('gender') || 'Male').trim();
      institution_id = String(formData.get('institution_id') || 'INST-001').trim();
      program = String(formData.get('program') || 'B.Tech Computer Science & Engineering').trim();
      password = String(formData.get('password') || '');
    }

    // Auto-derive username from name + APAAR suffix if omitted
    if (!username && full_name && apaar_id.length === 12) {
      const cleanFirst = full_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 12);
      username = `student.${cleanFirst || 'user'}${apaar_id.slice(-4)}`;
    }

    // Validate required fields
    if (!full_name || full_name.length < 2) {
      const error = 'Full name (as per Aadhaar / APAAR) is required.';
      if (isJson) return new Response(JSON.stringify({ success: false, error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect(`${studentLoginPath}?tab=signup&error=${encodeURIComponent(error)}`, 302);
    }

    if (!/^\d{12}$/.test(apaar_id)) {
      const error = 'APAAR / ABC ID must be an exact 12-digit numeric identifier.';
      if (isJson) return new Response(JSON.stringify({ success: false, error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect(`${studentLoginPath}?tab=signup&error=${encodeURIComponent(error)}`, 302);
    }

    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      const error = 'Username must be 3–30 characters (letters, numbers, dots, or underscores).';
      if (isJson) return new Response(JSON.stringify({ success: false, error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect(`${studentLoginPath}?tab=signup&error=${encodeURIComponent(error)}`, 302);
    }

    if (!password || password.length < 6) {
      const error = 'Password must be at least 6 characters long.';
      if (isJson) return new Response(JSON.stringify({ success: false, error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect(`${studentLoginPath}?tab=signup&error=${encodeURIComponent(error)}`, 302);
    }

    const db = getDB(locals);

    // Check if username or apaar_id already exists in student_accounts
    const existingAccount = await db
      .prepare('SELECT * FROM student_accounts WHERE LOWER(username) = ? OR apaar_id = ?')
      .bind(username.toLowerCase(), apaar_id)
      .first<User>();

    if (existingAccount) {
      const error = 'An account with this APAAR ID or username already exists in the Student Portal.';
      if (isJson) {
        return new Response(JSON.stringify({ success: false, error }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`${studentLoginPath}?tab=signup&error=${encodeURIComponent(error)}`, 302);
    }

    // Hash password with PBKDF2-SHA256
    const { hash, salt } = await hashPassword(password);
    const resolvedEmail = email || `${username}@example.edu.in`;
    const resolvedPhone = phone || '+91 98000 12345';

    // Ensure student record exists in `students` table with DPDP consent GRANTED
    const existingStudent = await db
      .prepare('SELECT * FROM students WHERE apaar_id = ?')
      .bind(apaar_id)
      .first<any>();

    if (!existingStudent) {
      await db
        .prepare(
          'INSERT INTO students (apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status, passkey_credential_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(apaar_id, full_name, dob, gender, resolvedEmail, resolvedPhone, 'GRANTED', null)
        .run();
    }

    // Create student account in isolated `student_accounts` table
    const accountId = `stu_acc_${Date.now().toString(36)}_${apaar_id.slice(-4)}`;
    await db
      .prepare(
        'INSERT INTO student_accounts (id, username, apaar_id, password_hash, salt, full_name, email, phone, institution_id, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        accountId,
        username,
        apaar_id,
        hash,
        salt,
        full_name,
        resolvedEmail,
        resolvedPhone,
        institution_id,
        'STUDENT'
      )
      .run();

    // Ensure initial admission row exists so the Student Portal dashboard renders rich data immediately
    const existingAdmissions = await db
      .prepare('SELECT * FROM admissions WHERE apaar_id = ?')
      .bind(apaar_id)
      .all<any>();

    if (!existingAdmissions.results || existingAdmissions.results.length === 0) {
      const admId = `ADM-2026-${apaar_id.slice(-4)}`;
      const todayIso = new Date().toISOString().split('T')[0];
      await db
        .prepare(
          'INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(admId, apaar_id, institution_id, program, 2026, todayIso, 'ENROLLED', 0)
        .run();
    }

    // Ensure initial Academic Bank of Credits (semester_credits) record exists
    const existingCredits = await db
      .prepare('SELECT * FROM semester_credits WHERE apaar_id = ?')
      .bind(apaar_id)
      .first<any>();

    if (!existingCredits) {
      await db
        .prepare(
          'INSERT OR REPLACE INTO semester_credits (apaar_id, program, accumulated_credits, max_credits, nep_exit_stage, semester_breakdown, is_lateral_entry, entry_mode, prior_diploma_board, transferred_credits, lateral_status, lateral_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          apaar_id,
          program,
          40,
          160,
          '40 Credits — UG Certificate Threshold Reached (Year 1 Anchored on ABC)',
          JSON.stringify([20, 20, 0, 0, 0, 0, 0, 0]),
          0,
          '1st-Year Regular (10+2 PCM)',
          'Direct 1st-Year Regular Admission (APAAR Verified)',
          0,
          'STANDARD_ENTRY',
          'Newly registered APAAR / ABC student account with verified DPDP Act 2023 consent.'
        )
        .run();
    }

    const newUser: User = {
      id: accountId,
      username,
      password_hash: hash,
      salt,
      full_name,
      role: 'STUDENT',
      account_space: 'student_accounts',
      institution_id,
      apaar_id,
      email: resolvedEmail,
      phone: resolvedPhone,
    };

    const session = await createSession(db, newUser, 'student_accounts');
    const destination = `${langPrefix}/student`;
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.BUILD_CF || !!process.env.CF_PAGES;
    const cookieHeader = buildSessionCookie(session.id, isProd);

    cookies.set(SESSION_COOKIE_NAME, session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: isProd,
    });

    if (isJson) {
      return new Response(
        JSON.stringify({
          success: true,
          redirect: destination,
          portal: 'student',
          account_space: 'student_accounts',
          user: {
            id: newUser.id,
            username: newUser.username,
            full_name: newUser.full_name,
            role: newUser.role,
            account_space: 'student_accounts',
            institution_id: newUser.institution_id,
            apaar_id: newUser.apaar_id,
            email: newUser.email,
            phone: newUser.phone,
          },
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
          },
        }
      );
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: destination,
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (error: any) {
    console.error('Student signup error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
