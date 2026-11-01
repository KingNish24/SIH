-- VIDYA D1 SQLite Schema
-- Project: VIDYA (AICTE / SIH Problem Statement SIH26263)

DROP TABLE IF EXISTS scoped_consent_tokens;
DROP TABLE IF EXISTS semester_credits;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS passkey_credentials;
DROP TABLE IF EXISTS verification_requests;
DROP TABLE IF EXISTS degrees;
DROP TABLE IF EXISTS admissions;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS institutions;

CREATE TABLE institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  sanctioned_intake INTEGER NOT NULL,
  current_enrollment INTEGER DEFAULT 0,
  status TEXT DEFAULT 'NORMAL',
  risk_score REAL DEFAULT 0.0,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  apaar_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  email TEXT,
  phone TEXT,
  dpdp_consent_status TEXT DEFAULT 'PENDING',
  passkey_credential_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admissions (
  id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  program TEXT NOT NULL,
  batch_year INTEGER NOT NULL,
  enrollment_date TEXT,
  status TEXT DEFAULT 'ENROLLED',
  is_duplicate INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id),
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE degrees (
  id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  degree_name TEXT NOT NULL,
  specialization TEXT,
  cgpa REAL,
  year_of_passing INTEGER,
  status TEXT DEFAULT 'ISSUED',
  issuing_authority TEXT NOT NULL,
  issued_at TEXT,
  revoked_at TEXT,
  revocation_reason TEXT,
  digital_signature_hash TEXT,
  signature TEXT,
  signing_key_id TEXT,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id),
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE verification_requests (
  id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  verifier_name TEXT NOT NULL,
  purpose TEXT,
  consent_status TEXT DEFAULT 'PENDING_BIOMETRIC',
  verified_at TEXT,
  response_time_ms INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id)
);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  device_type TEXT DEFAULT 'Windows Hello / Biometric',
  transports TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id)
);

CREATE TABLE scoped_consent_tokens (
  token_id TEXT PRIMARY KEY,
  apaar_id TEXT NOT NULL,
  verifier_org TEXT NOT NULL,
  purpose TEXT NOT NULL,
  disclosed_fields TEXT NOT NULL,
  ttl_label TEXT NOT NULL,
  single_use INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signature_digest TEXT NOT NULL,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id)
);

CREATE TABLE semester_credits (
  apaar_id TEXT PRIMARY KEY,
  program TEXT NOT NULL,
  accumulated_credits INTEGER NOT NULL,
  max_credits INTEGER DEFAULT 160,
  nep_exit_stage TEXT NOT NULL,
  semester_breakdown TEXT NOT NULL,
  is_lateral_entry INTEGER DEFAULT 0,
  entry_mode TEXT NOT NULL,
  prior_diploma_board TEXT NOT NULL,
  transferred_credits INTEGER DEFAULT 0,
  lateral_status TEXT DEFAULT 'STANDARD_ENTRY',
  lateral_note TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  institution_id TEXT,
  apaar_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (apaar_id) REFERENCES students(apaar_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  institution_id TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
