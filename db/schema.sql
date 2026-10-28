-- VIDYA D1 SQLite Schema
-- Project: VIDYA (AICTE / SIH Problem Statement SIH26263)

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
