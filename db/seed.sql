-- VIDYA Seed Data
-- AICTE SIH Problem Statement SIH26263 Demo Scenario

-- 1. Institutions
INSERT INTO institutions (id, name, code, sanctioned_intake, current_enrollment, status, risk_score, state, district)
VALUES 
  ('INST-001', 'Technical College A (Apex Institute of Engineering)', 'TCA-1049', 180, 187, 'OVERRUN_RISK', 94.2, 'Maharashtra', 'Pune'),
  ('INST-002', 'Technical College B (Metro Polytechnic & College)', 'TCB-2081', 120, 115, 'NORMAL', 12.5, 'Karnataka', 'Bengaluru'),
  ('INST-003', 'State University College of Engineering', 'SUC-3302', 240, 238, 'WARNING', 48.0, 'Delhi', 'New Delhi');

-- 2. Students
INSERT INTO students (apaar_id, full_name, dob, gender, email, phone, dpdp_consent_status, passkey_credential_id)
VALUES
  ('739284019283', 'Rahul Sharma', '2003-05-14', 'Male', 'rahul.sharma@example.edu.in', '+91 98765 43210', 'GRANTED', 'cred_webauthn_739284'),
  ('582910384729', 'Priya Verma', '2003-11-20', 'Female', 'priya.v@example.edu.in', '+91 98111 22334', 'GRANTED', 'cred_webauthn_582910'),
  ('901238471920', 'Aaditya Patel', '2004-02-08', 'Male', 'aaditya.p@example.edu.in', '+91 97234 56789', 'PENDING', NULL),
  ('412398471029', 'Sneha Sundaram', '2002-09-17', 'Female', 'sneha.s@example.edu.in', '+91 94440 12345', 'GRANTED', 'cred_webauthn_412398'),
  ('601928374819', 'Vikram Malhotra', '2001-12-03', 'Male', 'vikram.m@example.edu.in', '+91 98990 87654', 'REVOKED', 'cred_webauthn_601928'),
  ('819203847561', 'Ananya Sen', '2003-07-25', 'Female', 'ananya.sen@example.edu.in', '+91 98300 54321', 'GRANTED', 'cred_webauthn_819203');

-- 3. Admissions (Cross-College Duplicates & Overrun)
INSERT INTO admissions (id, apaar_id, institution_id, program, batch_year, enrollment_date, status, is_duplicate)
VALUES
  -- Rahul Sharma enrolled in BOTH College A and College B
  ('ADM-2024-001', '739284019283', 'INST-001', 'B.Tech Computer Science', 2024, '2024-07-15', 'FLAGGED_DUPLICATE', 1),
  ('ADM-2024-002', '739284019283', 'INST-002', 'B.Tech Information Technology', 2024, '2024-07-28', 'FLAGGED_DUPLICATE', 1),
  
  -- Priya Verma enrolled in BOTH College A and State University College
  ('ADM-2024-003', '582910384729', 'INST-001', 'B.Tech Computer Science', 2024, '2024-07-12', 'FLAGGED_DUPLICATE', 1),
  ('ADM-2024-004', '582910384729', 'INST-003', 'B.Tech Electronics & Comm.', 2024, '2024-08-01', 'FLAGGED_DUPLICATE', 1),

  -- Aaditya Patel in College A (Legitimate)
  ('ADM-2024-005', '901238471920', 'INST-001', 'B.Tech Mechanical Engg', 2024, '2024-07-20', 'ENROLLED', 0),

  -- Sneha Sundaram in College A (Alumni)
  ('ADM-2020-006', '412398471029', 'INST-001', 'B.Tech Computer Science', 2020, '2020-08-10', 'ENROLLED', 0),

  -- Vikram Malhotra in College B (Graduated with Revoked degree)
  ('ADM-2020-007', '601928374819', 'INST-002', 'B.Tech Civil Engg', 2020, '2020-08-15', 'ENROLLED', 0),

  -- Ananya Sen in College B
  ('ADM-2024-008', '819203847561', 'INST-002', 'B.Tech Data Science', 2024, '2024-07-22', 'ENROLLED', 0);

-- 4. Degrees (For University Degree Verification & Revocation Portal)
INSERT INTO degrees (id, apaar_id, institution_id, degree_name, specialization, cgpa, year_of_passing, status, issuing_authority, issued_at, revoked_at, revocation_reason, digital_signature_hash)
VALUES
  ('DEG-2024-8841', '412398471029', 'INST-001', 'Bachelor of Technology', 'Computer Science & Engineering', 9.42, 2024, 'ISSUED', 'Apex State Technological University', '2024-06-25 10:30:00', NULL, NULL, 'SHA256:8f4c2e17a3b9092419efacbc093129487cfa9082'),
  ('DEG-2024-3910', '601928374819', 'INST-002', 'Bachelor of Technology', 'Civil Engineering', 7.15, 2024, 'REVOKED', 'Metro Affiliating University', '2024-06-20 11:00:00', '2024-09-12 14:15:00', 'Academic Integrity Violation: Fraudulent lateral entry credit transfer detected during AICTE audit.', 'SHA256:1e7d9904ba81f5c391024849acff90192834bba7'),
  ('DEG-2024-9921', '819203847561', 'INST-002', 'Bachelor of Technology', 'Data Science & Artificial Intelligence', 8.89, 2024, 'ISSUED', 'Metro Affiliating University', '2024-06-28 16:45:00', NULL, NULL, 'SHA256:7c9e0182ba00392f4918acde492049182390fade');

-- 5. Verification Requests (Verifier Portal)
INSERT INTO verification_requests (id, apaar_id, verifier_name, purpose, consent_status, verified_at, response_time_ms)
VALUES
  ('REQ-9011', '412398471029', 'Tata Consultancy Services Ltd', 'Background Verification - Systems Engineer', 'GRANTED', '2024-10-24 14:22:10', 1240),
  ('REQ-9012', '601928374819', 'Larsen & Toubro Construction', 'Pre-employment Credential Verification', 'GRANTED', '2024-10-25 09:15:42', 980),
  ('REQ-9013', '739284019283', 'National Informatics Centre (NIC)', 'Public Fellowship Eligibility Check', 'PENDING_BIOMETRIC', NULL, 0);

-- 6. Passkeys (W3C WebAuthn biometric credentials)
INSERT INTO passkey_credentials (id, apaar_id, public_key, counter, device_type)
VALUES
  ('cred_webauthn_739284', '739284019283', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz81...demo_pubkey_rahul', 4, 'Windows Hello Fingerprint Sensor'),
  ('cred_webauthn_412398', '412398471029', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz92...demo_pubkey_sneha', 12, 'Apple Touch ID Biometric Sensor'),
  ('cred_webauthn_582910', '582910384729', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz93...demo_pubkey_priya', 2, 'Android FIDO2 Biometric Key'),
  ('cred_webauthn_601928', '601928374819', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz94...demo_pubkey_vikram', 1, 'YubiKey 5C NFC FIDO2');

-- 7. Scoped Consent Tokens (DPDP Section 6 Single-Use / Time-Bound Passes)
INSERT INTO scoped_consent_tokens (token_id, apaar_id, verifier_org, purpose, disclosed_fields, ttl_label, single_use, status, created_at, expires_at, signature_digest)
VALUES
  ('VIDYA-DPDP-8492-A19F', '739284019283', 'UPSC Civil Services Board', 'Degree & Eligibility Verification', '["degree_status","cgpa_threshold","abc_credits"]', '24 Hours (Single-Use)', 1, 'ACTIVE', '2026-10-31T10:00:00.000Z', '2027-10-31T10:00:00.000Z', 'SHA256:9f41c80b2a73e19d4401bc8a772e9012f3451d0a8b76c5e1290a4f8b3c12e771'),
  ('VIDYA-DPDP-3104-C72B', '739284019283', 'TCS Background Verification', 'Zero-Knowledge CGPA >= 7.5 Check', '["degree_status","cgpa_threshold"]', '1 Hour (Single-Use)', 1, 'ACTIVE', '2026-10-31T10:00:00.000Z', '2027-10-31T11:00:00.000Z', 'SHA256:4a82d19f0e55b62c8910fa32817465bc9012e4f8a1b2c3d4e5f60718293a4b5c'),
  ('VIDYA-DPDP-6291-E08D', '412398471029', 'GATE Admissions Committee (IIT Roorkee)', 'B.Tech Honours & ABC 160-Credit Audit', '["degree_status","cgpa_threshold","abc_credits"]', '24 Hours (Single-Use)', 1, 'ACTIVE', '2026-10-31T10:00:00.000Z', '2027-10-31T10:00:00.000Z', 'SHA256:7d12e84a90b3c4f12839045a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8'),
  ('VIDYA-DPDP-5510-F94A', '582910384729', 'DRDO Scientist Entry Recruitment Board', 'Degree & Eligibility Verification', '["degree_status","cgpa_threshold"]', '24 Hours (Single-Use)', 1, 'ACTIVE', '2026-10-31T10:00:00.000Z', '2027-10-31T10:00:00.000Z', 'SHA256:3c91a04f82e1b7d6543210fedcba9876543210abcdef0123456789abcdef0123');

-- 8. Academic Bank of Credits (Semester Credits & Lateral Entry Provenance)
INSERT INTO semester_credits (apaar_id, program, accumulated_credits, max_credits, nep_exit_stage, semester_breakdown, is_lateral_entry, entry_mode, prior_diploma_board, transferred_credits, lateral_status, lateral_note)
VALUES
  ('739284019283', 'B.Tech Computer Science & Engineering', 120, 160, '120 Credits — 3-Year Bachelor''s Degree Eligible (Semester 6 Completed)', '[20,20,20,20,20,20,0,0]', 1, '2nd-Year Lateral Entry (Sem 3 Direct)', 'MSBTE State Polytechnic Diploma (Computer Engg — 80 Credits)', 80, 'VERIFIED_ANCHORED', 'Prior 3-Year Polytechnic Diploma (80 ABC Credits) cryptographically verified via DigiLocker & MSBTE ledger before 2nd-Year B.Tech Lateral Entry.'),
  ('412398471029', 'B.Tech Computer Science & Engineering', 160, 160, '160 Credits — 4-Year B.Tech Honours / Research Degree Conferred', '[20,20,20,20,20,20,20,20]', 0, '1st-Year Regular (10+2 PCM)', 'Direct 1st-Year Regular Admission (10+2 PCM Qualifying)', 0, 'STANDARD_ENTRY', 'All 8 semesters (160 Credits) earned continuously at AICTE-approved parent institution.'),
  ('582910384729', 'B.Tech Electronics & Comm.', 80, 160, '80 Credits — UG Diploma / Lateral Entry Eligible (Exit Year 2)', '[20,20,20,20,0,0,0,0]', 1, '2nd-Year Lateral Entry (Sem 3 Direct)', 'DTE Karnataka Polytechnic Diploma (Electronics — 80 Credits)', 80, 'VERIFIED_ANCHORED', 'Verified 80-credit UG Diploma anchored to 12-digit APAAR ID; eligible for NEP 2020 2nd-Year Lateral Entry.'),
  ('901238471920', 'B.Tech Mechanical Engineering', 40, 160, '40 Credits — UG Certificate Threshold Reached (Exit Year 1)', '[20,20,0,0,0,0,0,0]', 0, '1st-Year Regular (10+2 PCM)', 'Direct 1st-Year Regular Admission (10+2 Qualifying)', 0, 'STANDARD_ENTRY', 'Completed Year 1 (40 Credits); qualifies for NEP 2020 UG Certificate if exiting early.'),
  ('601928374819', 'B.Tech Civil Engineering', 120, 160, 'REVOKED — Unverified Lateral Entry Credit Transfer Blocked', '[0,0,20,20,20,20,20,20]', 1, '2nd-Year Lateral Entry (Disputed)', 'Unverified Private Polytechnic Certificate (No ABC / APAAR Anchor)', 80, 'DISCREPANCY_FLAGGED', 'ALERT: Claimed 80 lateral-entry diploma credits lacked cryptographic APAAR/ABC provenance. Degree revoked during AICTE audit.'),
  ('819203847561', 'B.Tech Data Science & AI', 160, 160, '160 Credits — 4-Year B.Tech Honours / Research Degree Conferred', '[20,20,20,20,20,20,20,20]', 0, '1st-Year Regular (10+2 PCM)', 'Direct 1st-Year Regular Admission (10+2 Qualifying)', 0, 'STANDARD_ENTRY', 'Full 160-credit B.Tech curriculum verified and anchored on National Academic Bank of Credits.');

-- 9. Default Verified Credential Accounts (PBKDF2 SHA-256 with 100k iterations)
INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, institution_id, apaar_id)
VALUES
  ('usr_aicte_001', 'aicte.officer', '824e730d989e0352cfb0a1673d07a2791e30717a9b6d5fec437ae261088f5750', 'c5d4d9749769e7571454fd79b79d2ad7', 'Dr. S. K. Mahajan (AICTE Chief Regulatory Officer)', 'AICTE_ADMIN', NULL, NULL),
  ('usr_inst_001', 'principal.pune', '5ce6651ef4d90f081964a610390d72bd6c21684076d552c40fcf52c134ec367b', 'e8c17281c34c78ce820a1124e9066700', 'Dr. Ramesh Joshi (Principal, Technical College A)', 'INSTITUTE_ADMIN', 'INST-001', NULL),
  ('usr_univ_001', 'registrar.univ', '301b2c4bb975359a21844de3943e2055ede072ecc7f886ea0d82c75de0cbfea8', '002d37270c2f723012aca513ff600724', 'Prof. K. Venkatesh (Registrar, State Affiliating University)', 'UNIVERSITY_ADMIN', NULL, NULL),
  ('usr_student_001', 'student.rahul', '61a1c0df9dbfb018cc68b2dd46cb88d40225f39203fb2fa0b9e9c20db79f8fe8', '1a2784398d44ba4056557f678ed2b7e8', 'Rahul Sharma', 'STUDENT', 'INST-001', '739284019283'),
  ('usr_verifier_001', 'verifier.gov', '02ebdecc9c7fbc3fcca1fcc4648d647833d70405b16992cba0a9cc5f7ffa3b92', 'f2ab869161bb2a63630f857ccd0c3d6e', 'Vikramaditya Rao (Chief Verification Officer, National Gateway)', 'VERIFIER', NULL, NULL);
