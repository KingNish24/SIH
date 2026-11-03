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
import { ingestRoster, isValidApaar, computeInstitutionSeatTelemetry } from '../../src/lib/roster';
import { GET as getRosterSync, POST as postRosterSync, DELETE as deleteRosterSync } from '../../src/pages/api/roster/sync';
import { GET as getRosterLookup } from '../../src/pages/api/roster/lookup';
import { generateQrSvg, rsEncode, computeFormatBits } from '../../src/lib/qr';
import { verifyCredential } from '../../src/lib/attestation';

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
    expect(data.institution.name).toBe('Apex Institute of Engineering, Pune');
    expect(Array.isArray(data.admissions)).toBe(true);
    expect(data.admissions.length).toBeGreaterThanOrEqual(12);
    expect(data.admissions[0]).toHaveProperty('full_name');
    expect(data.admissions[0]).toHaveProperty('email');
    expect(data.admissions[0]).toHaveProperty('phone');
    expect(data.admissions[0]).toHaveProperty('dpdp_consent_status');
    expect(data.telemetry).toBeDefined();
    expect(data.telemetry.total_admitted).toBe(data.admissions.length);
    expect(data.telemetry.branch_matrix.length).toBe(3);
    expect(data.telemetry.quota_counts.APPROVED_INTAKE).toBeGreaterThan(0);
    expect(data.telemetry.quota_counts.SUPERNUMERARY).toBeGreaterThan(0);
  });

  test('computeInstitutionSeatTelemetry aggregates branch and quota rows accurately', async () => {
    const db = getDB();
    const admRes = await db.prepare('SELECT * FROM admissions WHERE institution_id = ?').bind('INST-001').all();
    const telemetry = computeInstitutionSeatTelemetry(admRes.results as any, 180);
    expect(telemetry.total_admitted).toBe(admRes.results.length);
    expect(telemetry.branch_matrix.map((b) => b.code)).toEqual(['CSE', 'ECE', 'ME']);
    const branchSum = telemetry.branch_matrix.reduce((acc, b) => acc + b.admitted, 0);
    expect(branchSum).toBe(telemetry.total_admitted);
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

    // 3. Single fresh student admission -> ENROLLED with quota, allotment_ref & roll_number
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
              admission_quota: 'SUPERNUMERARY',
              allotment_ref: 'TFWS-2025-MH-9091',
              roll_number: 'TCA25CS099',
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
    expect(freshData.created_admissions[0].admission_quota).toBe('SUPERNUMERARY');
    expect(freshData.created_admissions[0].allotment_ref).toBe('TFWS-2025-MH-9091');
    expect(freshData.created_admissions[0].roll_number).toBe('TCA25CS099');

    // 3b. Re-admitting same student in SAME institution returns 409 ALREADY_ENROLLED_IN_INSTITUTION
    const sameInstDupRes = await postRosterSync({
      request: new Request('http://localhost/api/roster/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: 'INST-001',
          mode: 'single',
          apaar_id: '112233445566',
          full_name: 'Rohan Deshmukh',
          program: 'B.Tech Computer Science',
        }),
      }),
      locals,
    } as any);
    expect(sameInstDupRes.status).toBe(409);
    const sameInstDupData = await sameInstDupRes.json();
    expect(sameInstDupData.error).toContain('ALREADY_ENROLLED_IN_INSTITUTION');

    // 4. Lookup existing student & fresh 12-digit APAAR via GET /api/roster/lookup
    const badLookup = await getRosterLookup({
      url: new URL('http://localhost/api/roster/lookup?apaar_id=12345'),
      locals,
    } as any);
    expect(badLookup.status).toBe(400);

    const existingLookup = await getRosterLookup({
      url: new URL('http://localhost/api/roster/lookup?apaar_id=739284019283&institution_id=INST-001'),
      locals,
    } as any);
    expect(existingLookup.status).toBe(200);
    const existingLookupData = await existingLookup.json();
    expect(existingLookupData.success).toBe(true);
    expect(existingLookupData.found_in_registry).toBe(true);
    expect(existingLookupData.student.full_name).toBe('Rahul Sharma');
    expect(existingLookupData.has_concurrent_admission).toBe(true);

    const synthLookup = await getRosterLookup({
      url: new URL('http://localhost/api/roster/lookup?apaar_id=998877665544&institution_id=INST-001'),
      locals,
    } as any);
    expect(synthLookup.status).toBe(200);
    const synthLookupData = await synthLookup.json();
    expect(synthLookupData.success).toBe(true);
    expect(synthLookupData.found_in_registry).toBe(true);
    expect(synthLookupData.is_new_candidate).toBe(true);
    expect(synthLookupData.student.apaar_id).toBe('998877665544');
    expect(synthLookupData.student.dpdp_consent_status).toBe('GRANTED');
    expect(synthLookupData.has_concurrent_admission).toBe(false);

    // 5. Withdraw the newly created admission via DELETE /api/roster/sync
    const createdId = freshData.created_admissions[0].id;
    const delRes = await deleteRosterSync({
      request: new Request('http://localhost/api/roster/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: 'INST-001',
          admissionId: createdId,
          apaar_id: '112233445566',
        }),
      }),
      url: new URL('http://localhost/api/roster/sync'),
      locals,
    } as any);
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
    expect(delData.withdrawn_id).toBe(createdId);
    expect(delData.new_enrollment).toBe(173);

    // Reset INST-001 back to initial seed state (187 / OVERRUN_RISK) so other tests see original seed
    const db = getDB();
    await db
      .prepare('UPDATE institutions SET current_enrollment = ?, status = ? WHERE id = ?')
      .bind(187, 'OVERRUN_RISK', 'INST-001')
      .run();
  });
});

describe('ISO/IEC 18004 QR Code Encoder & Decoder Verification (src/lib/qr.ts)', () => {
  test('generates a 100% standards-compliant, scannable QR code and decodes the exact verification URL', async () => {
    const targetUrl = 'http://localhost:4321/verifier?apaar=412398471029&id=DEG-2024-8841';
    const svg = generateQrSvg(targetUrl);

    // 1. Parse viewBox & margin (Version 4 = 33x33, default margin = 4 => viewBox 0 0 41 41)
    const vbMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(vbMatch).not.toBeNull();
    const totalDim = Number(vbMatch![1]);
    const margin = 4;
    const N = totalDim - margin * 2;
    expect(N).toBe(33); // Version 4 (33x33) for 66-byte URL

    // 2. Parse <path d="..."> modules into a 2D N x N grid
    const grid: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
    const pathRegex = /M(\d+),(\d+)h1v1h-1z/g;
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(svg)) !== null) {
      const col = Number(match[1]) - margin;
      const row = Number(match[2]) - margin;
      if (row >= 0 && row < N && col >= 0 && col < N) {
        grid[row][col] = 1;
      }
    }

    // 3. Verify the 3 Finder Patterns (7x7 at (0,0), (0, N-7), (N-7, 0))
    const checkFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const expected =
            r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
              ? 1
              : 0;
          expect(grid[r0 + r][c0 + c]).toBe(expected);
        }
      }
    };
    checkFinder(0, 0);
    checkFinder(0, N - 7);
    checkFinder(N - 7, 0);

    // 4. Verify Timing Patterns (row 6 and col 6) & Dark Module at (4*4 + 9, 8) = (25, 8)
    for (let i = 8; i < N - 8; i++) {
      expect(grid[6][i]).toBe(i % 2 === 0 ? 1 : 0);
      expect(grid[i][6]).toBe(i % 2 === 0 ? 1 : 0);
    }
    expect(grid[25][8]).toBe(1);

    // 5. Verify both 15-bit BCH Format Information copies equal 0x77C4 (ECC Level L = 01, Mask 0 = 000)
    expect(computeFormatBits(0b01, 0)).toBe(0x77c4);
    const formatCoords1: Array<[number, number]> = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
      [8, 7], [8, 8], [7, 8],
      [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    const formatCoords2: Array<[number, number]> = [
      [N - 1, 8], [N - 2, 8], [N - 3, 8], [N - 4, 8], [N - 5, 8], [N - 6, 8], [N - 7, 8],
      [8, N - 8], [8, N - 7], [8, N - 6], [8, N - 5], [8, N - 4], [8, N - 3], [8, N - 2], [8, N - 1],
    ];
    let readFormat1 = 0;
    let readFormat2 = 0;
    for (let i = 0; i < 15; i++) {
      readFormat1 = (readFormat1 << 1) | grid[formatCoords1[i][0]][formatCoords1[i][1]];
      readFormat2 = (readFormat2 << 1) | grid[formatCoords2[i][0]][formatCoords2[i][1]];
    }
    expect(readFormat1).toBe(0x77c4);
    expect(readFormat2).toBe(0x77c4);

    // 6. Build reserved mask for Version 4 (alignment centers [6, 26] -> non-overlapping at (26, 26))
    const reserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
    const markFinderReserved = (row: number, col: number) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r;
          const cc = col + c;
          if (rr >= 0 && rr < N && cc >= 0 && cc < N) reserved[rr][cc] = true;
        }
      }
    };
    markFinderReserved(0, 0);
    markFinderReserved(0, N - 7);
    markFinderReserved(N - 7, 0);
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        reserved[26 + r][26 + c] = true;
      }
    }
    for (let i = 8; i < N - 8; i++) {
      reserved[6][i] = true;
      reserved[i][6] = true;
    }
    reserved[25][8] = true;
    for (const [r, c] of formatCoords1) reserved[r][c] = true;
    for (const [r, c] of formatCoords2) reserved[r][c] = true;

    // 7. Read & unmask data modules in standard 2-column upward/downward zigzag
    const unmaskedBits: number[] = [];
    let up = true;
    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) {
        const r = up ? N - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!reserved[r][c]) {
            const unmasked = grid[r][c] ^ ((r + c) % 2 === 0 ? 1 : 0);
            unmaskedBits.push(unmasked);
          }
        }
      }
      up = !up;
    }

    // Reconstruct the 100 codewords (80 data + 20 EC for Version 4-L)
    const codewords = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | unmaskedBits[i * 8 + j];
      }
      codewords[i] = b;
    }

    const dataCodewords = codewords.slice(0, 80);
    const ecCodewords = codewords.slice(80, 100);

    // Verify Reed-Solomon ECC bytes match rsEncode(dataCodewords, 20)
    const expectedEc = rsEncode(dataCodewords, 20);
    expect(Array.from(ecCodewords)).toEqual(Array.from(expectedEc));

    // 8. Decode Byte Mode (0100) bit stream + 8-bit character count + UTF-8 payload
    const readBits = (startBit: number, len: number): number => {
      let val = 0;
      for (let i = 0; i < len; i++) {
        val = (val << 1) | unmaskedBits[startBit + i];
      }
      return val;
    };

    const modeIndicator = readBits(0, 4);
    expect(modeIndicator).toBe(0b0100); // Byte Mode

    const charCount = readBits(4, 8);
    expect(charCount).toBe(targetUrl.length);

    const payloadBytes = new Uint8Array(charCount);
    for (let i = 0; i < charCount; i++) {
      payloadBytes[i] = readBits(12 + i * 8, 8);
    }
    const decodedUrl = new TextDecoder().decode(payloadBytes);
    expect(decodedUrl).toBe(targetUrl);

    // 9. Verify verifyCredential encodes a scannable verification URL in deg.qrSvg while keeping deg.offlineQrPayload intact
    const db = getDB();
    const credResult = await verifyCredential({
      apaar_id: '412398471029',
      origin: 'http://localhost:4321',
      db,
    });
    expect(credResult.success).toBe(true);
    expect(credResult.degrees.length).toBeGreaterThan(0);
    const primaryDeg = credResult.degrees[0] as any;
    const expectedWithLabel = generateQrSvg(targetUrl, {
      size: 176,
      margin: 4,
      darkColor: '#0F2942',
      lightColor: '#FFFFFF',
      label: `W3C Verifiable Credential QR for ${primaryDeg.id}`,
    });
    expect(primaryDeg.qrSvg).toBe(expectedWithLabel);
    expect(primaryDeg.offlineQrPayload).toBeDefined();
    expect(primaryDeg.offlineQrPayload.apaar_id).toBe('412398471029');
    expect(primaryDeg.offlineQrPayload.sig.length).toBeGreaterThan(10);
  });
});

