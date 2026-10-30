import en from '../locales/en.json';
import hi from '../locales/hi.json';
import bn from '../locales/bn.json';
import te from '../locales/te.json';
import mr from '../locales/mr.json';
import ta from '../locales/ta.json';
import ur from '../locales/ur.json';
import gu from '../locales/gu.json';
import kn from '../locales/kn.json';
import ml from '../locales/ml.json';
import or from '../locales/or.json';
import pa from '../locales/pa.json';
import as from '../locales/as.json';
import mai from '../locales/mai.json';
import sat from '../locales/sat.json';
import ks from '../locales/ks.json';
import ne from '../locales/ne.json';
import sd from '../locales/sd.json';
import kok from '../locales/kok.json';
import doi from '../locales/doi.json';
import mni from '../locales/mni.json';
import brx from '../locales/brx.json';
import sa from '../locales/sa.json';

export type LangCode =
  | 'en'
  | 'hi'
  | 'bn'
  | 'te'
  | 'mr'
  | 'ta'
  | 'ur'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'or'
  | 'pa'
  | 'as'
  | 'mai'
  | 'sat'
  | 'ks'
  | 'ne'
  | 'sd'
  | 'kok'
  | 'doi'
  | 'mni'
  | 'brx'
  | 'sa';

export interface LanguageInfo {
  code: LangCode;
  nameEn: string;
  nativeName: string;
  script: string;
  dir?: 'ltr' | 'rtl';
}

export const EIGHTH_SCHEDULE_LANGUAGES: LanguageInfo[] = [
  { code: 'en', nameEn: 'English', nativeName: 'English', script: 'Latin', dir: 'ltr' },
  { code: 'hi', nameEn: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', dir: 'ltr' },
  { code: 'bn', nameEn: 'Bengali', nativeName: 'বাংলা', script: 'Bengali', dir: 'ltr' },
  { code: 'te', nameEn: 'Telugu', nativeName: 'తెలుగు', script: 'Telugu', dir: 'ltr' },
  { code: 'mr', nameEn: 'Marathi', nativeName: 'मराठी', script: 'Devanagari', dir: 'ltr' },
  { code: 'ta', nameEn: 'Tamil', nativeName: 'தமிழ்', script: 'Tamil', dir: 'ltr' },
  { code: 'ur', nameEn: 'Urdu', nativeName: 'اردو', script: 'Perso-Arabic', dir: 'rtl' },
  { code: 'gu', nameEn: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', dir: 'ltr' },
  { code: 'kn', nameEn: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'Kannada', dir: 'ltr' },
  { code: 'ml', nameEn: 'Malayalam', nativeName: 'മലയാളം', script: 'Malayalam', dir: 'ltr' },
  { code: 'or', nameEn: 'Odia', nativeName: 'ଓଡ଼ିଆ', script: 'Odia', dir: 'ltr' },
  { code: 'pa', nameEn: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', dir: 'ltr' },
  { code: 'as', nameEn: 'Assamese', nativeName: 'অসমীয়া', script: 'Assamese', dir: 'ltr' },
  { code: 'mai', nameEn: 'Maithili', nativeName: 'मैथिली', script: 'Devanagari', dir: 'ltr' },
  { code: 'sat', nameEn: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Ol Chiki', dir: 'ltr' },
  { code: 'ks', nameEn: 'Kashmiri', nativeName: 'कॉशुर', script: 'Devanagari', dir: 'ltr' },
  { code: 'ne', nameEn: 'Nepali', nativeName: 'नेपाली', script: 'Devanagari', dir: 'ltr' },
  { code: 'sd', nameEn: 'Sindhi', nativeName: 'सिन्धी', script: 'Devanagari', dir: 'ltr' },
  { code: 'kok', nameEn: 'Konkani', nativeName: 'कोंकणी', script: 'Devanagari', dir: 'ltr' },
  { code: 'doi', nameEn: 'Dogri', nativeName: 'डोगरी', script: 'Devanagari', dir: 'ltr' },
  { code: 'mni', nameEn: 'Manipuri (Meitei)', nativeName: 'মৈতৈলোন্', script: 'Meitei / Bengali', dir: 'ltr' },
  { code: 'brx', nameEn: 'Bodo', nativeName: 'बड़ो', script: 'Devanagari', dir: 'ltr' },
  { code: 'sa', nameEn: 'Sanskrit', nativeName: 'संस्कृतम्', script: 'Devanagari', dir: 'ltr' },
];

export const LANGUAGE_CODES = new Set<string>(EIGHTH_SCHEDULE_LANGUAGES.map((l) => l.code));

export function isSupportedLang(code: string | undefined): code is LangCode {
  return !!code && LANGUAGE_CODES.has(code);
}

export function getLanguageInfo(code: string | undefined): LanguageInfo {
  return EIGHTH_SCHEDULE_LANGUAGES.find((l) => l.code === code) || EIGHTH_SCHEDULE_LANGUAGES[0];
}

export type UIDictionary = typeof en;

export const TRANSLATIONS: Record<LangCode, UIDictionary> = {
  en,
  hi,
  bn,
  te,
  mr,
  ta,
  ur,
  gu,
  kn,
  ml,
  or,
  pa,
  as,
  mai,
  sat,
  ks,
  ne,
  sd,
  kok,
  doi,
  mni,
  brx,
  sa,
};

export function getUIDictionary(code: string | undefined): UIDictionary {
  if (code && code in TRANSLATIONS) {
    return TRANSLATIONS[code as LangCode];
  }
  return en;
}

export function t(code: string | undefined, key: keyof UIDictionary | string, fallback?: string): string {
  const dict = getUIDictionary(code) as Record<string, string>;
  return dict[key] ?? (en as Record<string, string>)[key] ?? fallback ?? String(key);
}
