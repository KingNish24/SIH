-- VIDYA Auth & RBAC Schema
-- Users & Sessions for Role-Based Access Control

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  institution_id TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Seed Default Verified Credential Accounts (PBKDF2 SHA-256 with 100k iterations)
-- AICTE: username aicte.officer / password Aicte@2026!
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES ('usr_aicte_001', 'aicte.officer', '824e730d989e0352cfb0a1673d07a2791e30717a9b6d5fec437ae261088f5750', 'c5d4d9749769e7571454fd79b79d2ad7', 'Dr. S. K. Mahajan (AICTE Chief Regulatory Officer)', 'AICTE_ADMIN', NULL, NULL);

-- Institute: username principal.pune / password Pune@2026! (institution_id: INST-001)
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES ('usr_inst_001', 'principal.pune', '5ce6651ef4d90f081964a610390d72bd6c21684076d552c40fcf52c134ec367b', 'e8c17281c34c78ce820a1124e9066700', 'Dr. Ramesh Joshi (Principal, Technical College A)', 'INSTITUTE_ADMIN', 'INST-001', NULL);

-- University: username registrar.univ / password Univ@2026!
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES ('usr_univ_001', 'registrar.univ', '301b2c4bb975359a21844de3943e2055ede072ecc7f886ea0d82c75de0cbfea8', '002d37270c2f723012aca513ff600724', 'Prof. K. Venkatesh (Registrar, State Affiliating University)', 'UNIVERSITY_ADMIN', NULL, NULL);

-- Student: username student.rahul / password Rahul@2026! (apaar_id: 739284019283)
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES ('usr_student_001', 'student.rahul', '61a1c0df9dbfb018cc68b2dd46cb88d40225f39203fb2fa0b9e9c20db79f8fe8', '1a2784398d44ba4056557f678ed2b7e8', 'Rahul Sharma', 'STUDENT', 'INST-001', '739284019283');

-- Verifier: username verifier.gov / password Verify@2026!
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES ('usr_verifier_001', 'verifier.gov', '02ebdecc9c7fbc3fcca1fcc4648d647833d70405b16992cba0a9cc5f7ffa3b92', 'f2ab869161bb2a63630f857ccd0c3d6e', 'Vikramaditya Rao (Chief Verification Officer, National Gateway)', 'VERIFIER', NULL, NULL);
