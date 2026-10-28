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
