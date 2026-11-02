import { describe, expect, test } from 'bun:test';
import { maskApaar, maskEmail, maskPhone, maskName } from '../../src/lib/types';
import {
  bytesToHex,
  hexToBytes,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
  SESSION_COOKIE_NAME,
} from '../../src/lib/auth';
import {
  EIGHTH_SCHEDULE_LANGUAGES,
  isSupportedLang,
  getLanguageInfo,
  getUIDictionary,
} from '../../src/lib/i18n';
import { getDB } from '../../src/lib/db';
import { ingestRoster, isValidApaar } from '../../src/lib/roster';
import { GET as getRosterSync, POST as postRosterSync } from '../../src/pages/api/roster/sync';

describe('masking (DPDP)', () => {
  test('maskApaar keeps only last 4 digits', () => {
    expect(maskApaar('123456789012')).toBe('XXXX-XXXX-9012');
    expect(maskApaar('123456789012')).not.toContain('1234');
  });
  test('maskEmail hides user and domain', () => {
    const m = maskEmail('rahul.kumar@iitd.ac.in');
    expect(m.startsWith('r***@')).toBe(true);
    expect(m).not.toContain('rahul');
    expect(m).not.toContain('iitd');
  });
  test('maskPhone keeps last 4 digits', () => {
    expect(maskPhone('+91 98765 43210')).toBe('+91 XXXXX X3210');
    expect(maskPhone('9876543210')).not.toContain('98765');
  });
  test('maskName shortens last name', () => {
    expect(maskName('Priya Sharma')).toBe('Priya S.');
    expect(maskName('Priya')).toBe('Priya');
  });
});

describe('auth helpers', () => {
  test('hex round trip', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(bytesToHex(bytes)).toBe('00010f10ff');
    expect(Array.from(hexToBytes('00010f10ff'))).toEqual(Array.from(bytes));
  });

  test('hashPassword + verifyPassword', async () => {
    const { hash, salt } = await hashPassword('S3cret!pass');
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(await verifyPassword('S3cret!pass', hash, salt)).toBe(true);
    expect(await verifyPassword('wrong', hash, salt)).toBe(false);
  });

  test('hashPassword uses random salt', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  test('session tokens are unique and long', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  test('parseCookies', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('a=1; vidya_session=abc%20d; b=x=y')).toEqual({ a: '1', vidya_session: 'abc d', b: 'x=y' });
  });

  test('session cookie flags', () => {
    const c = buildSessionCookie('tok', true);
    expect(c.startsWith(`${SESSION_COOKIE_NAME}=tok`)).toBe(true);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toMatch(/SameSite=(Lax|Strict)/);
    expect(buildClearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('22 Eighth Schedule Indian languages + English (i18n)', () => {
  test('exports all 23 supported language entries', () => {
    expect(EIGHTH_SCHEDULE_LANGUAGES.length).toBe(23);
    const expectedCodes = [
      'en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml',
      'or', 'pa', 'as', 'mai', 'sat', 'ks', 'ne', 'sd', 'kok', 'doi',
      'mni', 'brx', 'sa',
    ];
    for (const code of expectedCodes) {
      expect(isSupportedLang(code)).toBe(true);
      const info = getLanguageInfo(code);
      expect(info.code).toBe(code as any);
      expect(info.nativeName.length).toBeGreaterThan(0);
      const dict = getUIDictionary(code);
      expect(dict.portalTitle.length).toBeGreaterThan(0);
      expect(dict.verifyCta.length).toBeGreaterThan(0);
    }
    expect(getLanguageInfo('ur').dir).toBe('rtl');
    expect(isSupportedLang('xx')).toBe(false);
  });
});

describe('College Roster & Admissions Backend (/api/roster/sync & ingestRoster)', () => {
  test('GET /api/roster/sync returns enriched admissions and enforces tenant isolation', async () => {
    // 1. Unauthorized check
    const unauthRes = await getRosterSync({
      request: new Request('http://localhost/api/roster/sync?institutionId=INST-001'),
      url: new URL('http://localhost/api/roster/sync?institutionId=INST-001'),
      locals: {},
    } as any);
    expect(unauthRes.status).toBe(401);

    // 2. Tenant isolation check (INST-001 admin requesting INST-002)
    const forbiddenRes = await getRosterSync({
      request: new Request('http://localhost/api/roster/sync?institutionId=INST-002'),
      url: new URL('http://localhost/api/roster/sync?institutionId=INST-002'),
      locals: {
        user: { username: 'nodal_tca', role: 'INSTITUTE_ADMIN', institution_id: 'INST-001' },
      },
    } as any);
    expect(forbiddenRes.status).toBe(403);

    // 3. Valid fetch for INST-001
    const okRes = await getRosterSync({
      request: new Request('http://localhost/api/roster/sync?institutionId=INST-001'),
      url: new URL('http://localhost/api/roster/sync?institutionId=INST-001'),
      locals: {
        user: { username: 'nodal_tca', role: 'INSTITUTE_ADMIN', institution_id: 'INST-001' },
      },
    } as any);
    expect(okRes.status).toBe(200);
    const data = await okRes.json();
    expect(data.success).toBe(true);
    expect(data.institution.id).toBe('INST-001');
    expect(Array.isArray(data.admissions)).toBe(true);
    expect(data.admissions.length).toBeGreaterThan(0);
    expect(data.admissions[0]).toHaveProperty('full_name');
    expect(data.admissions[0]).toHaveProperty('email');
    expect(data.admissions[0]).toHaveProperty('phone');
    expect(data.admissions[0]).toHaveProperty('dpdp_consent_status');
  });

  test('POST /api/roster/sync supports normalize_intake, single admission, and cross-campus duplicate flagging', async () => {
    const locals = {
      user: { username: 'nodal_tca', role: 'INSTITUTE_ADMIN', institution_id: 'INST-001' },
    };

    // 1. Normalize intake from 187/180 to 172/180
    const normRes = await postRosterSync({
      request: new Request('http://localhost/api/roster/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId: 'INST-001', action: 'normalize_intake' }),
      }),
      locals,
    } as any);
    expect(normRes.status).toBe(200);
    const normData = await normRes.json();
    expect(normData.success).toBe(true);
    expect(normData.new_enrollment).toBe(172);
    expect(normData.sanctioned_intake).toBe(180);

    // 2. Single-student admission (compliant + cross-campus duplicate check)
    // 819203847561 is already enrolled at INST-002 -> should flag as FLAGGED_DUPLICATE at INST-001
    const singleDupRes = await postRosterSync({
      request: new Request('http://localhost/api/roster/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: 'INST-001',
          mode: 'single',
          students: [
            {
              apaar_id: '819203847561',
              full_name: 'Ananya Sen',
              program: 'B.Tech AI & Data Science',
              batch_year: 2025,
            },
          ],
        }),
      }),
      locals,
    } as any);
    expect(singleDupRes.status).toBe(200);
    const dupData = await singleDupRes.json();
    expect(dupData.success).toBe(true);
    expect(dupData.inserted).toBe(1);
    expect(dupData.duplicates_flagged).toBe(1);
    expect(dupData.new_enrollment).toBe(173);
    expect(dupData.created_admissions.length).toBe(1);
    expect(dupData.created_admissions[0].status).toBe('FLAGGED_DUPLICATE');
    expect(dupData.created_admissions[0].enrollment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 3. Single fresh student admission -> ENROLLED
    const freshRes = await postRosterSync({
      request: new Request('http://localhost/api/roster/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: 'INST-001',
          mode: 'single',
          students: [
            {
              apaar_id: '112233445566',
              full_name: 'Rohan Deshmukh',
              email: 'rohan.d@example.edu.in',
              phone: '+91 98220 11223',
              program: 'B.Tech Computer Science',
              batch_year: 2025,
            },
          ],
        }),
      }),
      locals,
    } as any);
    expect(freshRes.status).toBe(200);
    const freshData = await freshRes.json();
    expect(freshData.success).toBe(true);
    expect(freshData.inserted).toBe(1);
    expect(freshData.duplicates_flagged).toBe(0);
    expect(freshData.new_enrollment).toBe(174);
    expect(freshData.created_admissions[0].status).toBe('ENROLLED');
    expect(freshData.created_admissions[0].full_name).toBe('Rohan Deshmukh');

    // Reset INST-001 back to initial seed state (187 / OVERRUN_RISK) so other tests see original seed
    const db = getDB();
    await db
      .prepare('UPDATE institutions SET current_enrollment = ?, status = ? WHERE id = ?')
      .bind(187, 'OVERRUN_RISK', 'INST-001')
      .run();
  });
});
