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
