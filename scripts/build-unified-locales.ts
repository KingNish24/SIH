import fs from 'node:fs';
import path from 'node:path';
import { TRANSLATIONS, EIGHTH_SCHEDULE_LANGUAGES, type LangCode } from '../src/lib/i18n';

const LOCALES_DIR = path.resolve(process.cwd(), 'src/locales');
const TOUR_DIR = path.resolve(process.cwd(), 'src/lib/tour-i18n');

if (!fs.existsSync(LOCALES_DIR)) {
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
}

// Module & Page specific English translations
const PAGE_EN = {
  // Navigation & General
  nav_overview: 'Overview',
  nav_institution: 'Institution Portal',
  nav_aicte: 'Regulatory Council',
  nav_university: 'Affiliating University',
  nav_student: 'Student Vault (DPDP)',
  nav_verifier: 'Public Verification',
  nav_mandate: 'AICTE Mandate',
  nav_sign_in: 'Officer Sign In',
  nav_sign_out: 'Sign Out',
  nav_demo_mode: 'Demo Mode: signed in as',

  // Breadcrumbs
  crumb_overview: 'National Overview & Institution Directory',
  crumb_institution: 'Approved Institution Roster Portal (INST-01)',
  crumb_aicte: 'AICTE National Surveillance & Audit Dashboard (REG-02)',
  crumb_university: 'Affiliating University Degree Ledger (UNIV-03)',
  crumb_student: 'Student Consent Authority & DPDP Vault (STU-04)',
  crumb_verifier: 'Public Credential Verification Terminal (VRF-05)',
  crumb_login: 'Single Sign-On (Parichay Officer Gateway)',
  crumb_policy: 'Statutory Policy & Official Guidelines',

  // Institution Portal
  inst_page_title: 'Approved Technical Institution Portal',
  inst_subtitle: 'Statutory student roster submission channel with in-browser client-side memory triage (zero PII leakage) and dynamic intake cap enforcement (60 / 120 / 180 / 240 seats).',
  inst_select_label: 'Select Institution / Tenant:',
  inst_tenant_locked: 'Tenant Locked (Institutional Role: INST-001)',
  inst_statutory_badge: 'AICTE APH 2024–2027 Statutory Compliance Active',
  inst_kpi_sanctioned: 'Approved Sanctioned Intake',
  inst_kpi_actual: 'Actual Monitored Enrolment',
  inst_kpi_utilization: 'Intake Capacity Utilization',
  inst_kpi_status: 'AICTE Statutory Status',
  inst_status_compliant: 'Intake Compliant (Within Cap)',
  inst_status_overrun: 'Quota Overrun Flagged (Non-Compliant)',
  inst_cat_heading: 'AICTE Sanctioned Dynamic Category Breakdown (APH 2024–2027 Norms)',
  inst_cat_supernumerary: 'Supernumerary (15% TFW/EWS)',
  inst_cat_nri: 'NRI Quota (5%)',
  inst_cat_oci: 'OCI Status (2%)',
  inst_cat_fn: 'Foreign National (3%)',
  inst_upload_heading: 'Client-Side In-Browser Roster Upload & Memory Triage',
  inst_upload_sub: 'Zero PII Cloud Leakage: Student identification and APAAR compliance are checked inside local browser memory before encrypted transmission.',
  inst_upload_dropzone: 'Drop student roster CSV file here, or click to browse',
  inst_upload_demo_btn: 'Load Demo Overrun Roster (187 Students / 180 Cap)',
  inst_triage_heading: 'Instant In-Browser Memory Triage Results',
  inst_triage_valid: 'Valid APAAR Records',
  inst_triage_missing: 'Missing APAAR Identifier',
  inst_triage_malformed: 'Malformed / Invalid APAAR',
  inst_sync_btn: 'Commit & Synchronize Valid Roster to AICTE D1 Ledger',
  inst_api_tab_title: 'Automated API Integration (MIS / ERP Sync)',
  inst_api_tab_sub: 'Connect campus ERP / Student Information Systems via AICTE Roster Ingestion API v1.',

  // AICTE Regulatory Oversight
  aicte_page_title: 'AICTE National Surveillance & Audit Dashboard',
  aicte_subtitle: 'National regulatory surveillance flagging technical institutions exceeding approved program intake limits and identifying concurrent cross-campus duplicate enrollments.',
  aicte_kpi_total_colleges: 'Monitored Technical Institutions',
  aicte_kpi_compliance_index: 'National Compliance Index',
  aicte_kpi_total_enrollment: 'Total Monitored Enrolment',
  aicte_kpi_total_sanctioned: 'Sanctioned Approved Intake',
  aicte_kpi_overrun_count: 'Institutions Over Sanctioned Cap',
  aicte_surveillance_heading: 'Live Institutional Intake Surveillance & Quota Audit',
  aicte_search_placeholder: 'Search by institution name, AICTE code, district, or state...',
  aicte_all_states: 'All States / Union Territories',
  aicte_all_statuses: 'All Statuses',
  aicte_col_inst: 'Institution / College',
  aicte_col_code: 'AICTE Code',
  aicte_col_state: 'State & District',
  aicte_col_sanctioned: 'Approved Cap',
  aicte_col_actual: 'Actual Intake',
  aicte_col_utilization: 'Utilization %',
  aicte_col_status: 'Regulatory Status',
  aicte_duplicate_heading: 'Cross-Campus Concurrent Duplicate Enrollment Alerts',
  aicte_duplicate_sub: 'Algorithmic detection of identical 12-digit APAAR IDs actively enrolled in multiple institutions simultaneously.',
  aicte_export_btn: 'Export National Audit Surveillance Report (CSV)',

  // Affiliating University Portal
  univ_page_title: 'Affiliating University Degree Ledger',
  univ_subtitle: 'State and central affiliating universities verify affiliated college rosters, issue tamper-evident Ed25519 cryptographically signed degrees, and maintain an immutable revocation ledger.',
  univ_issue_heading: 'Issue Cryptographically Signed Academic Degree',
  univ_issue_sub: 'Digital degrees are cryptographically anchored to candidate APAAR IDs using state university Ed25519 private keys.',
  univ_student_name: 'Student Full Name',
  univ_apaar_id: '12-Digit APAAR ID',
  univ_institution: 'Affiliated Technical Institution',
  univ_degree_name: 'Degree Title / Qualification',
  univ_specialization: 'Branch / Specialization',
  univ_year: 'Year of Passing',
  univ_cgpa: 'Cumulative GPA / Grade',
  univ_sign_btn: 'Sign & Issue Degree (Ed25519 Cryptographic Attestation)',
  univ_batch_sign_btn: 'Batch Sign All Eligible Verified Rosters',
  univ_ledger_heading: 'University Issued Academic Degree Ledger',
  univ_revocation_heading: 'Cryptographic Credential Revocation Ledger',
  univ_revocation_sub: 'Transparent public ledger recording invalid, canceled, or suspended degree credentials.',

  // Student DPDP Consent Vault
  student_page_title: 'Student Consent Authority & DPDP Vault',
  student_subtitle: 'Statutory student consent vault compliant with Section 6 of the Digital Personal Data Protection (DPDP) Act, 2023. Manage verifier disclosures and FIDO2 passkeys.',
  student_vault_heading: 'APAAR Identity & Sovereign DPDP Consent Status',
  student_consent_label: 'Current Statutory Consent State (DPDP Sec. 6)',
  student_consent_active: 'Consent Active: Public verifiers and employers may view verified academic degrees.',
  student_consent_revoked: 'Consent Revoked: Verification requests will encounter privacy masking.',
  student_grant_btn: 'Grant Verification Consent',
  student_revoke_btn: 'Revoke Verification Consent (Enforce Selective Masking)',
  student_passkey_heading: 'Hardware-Bound Biometric Passkey (W3C WebAuthn)',
  student_passkey_sub: 'Protect your educational identity with phishing-resistant FIDO2 hardware credentials (FaceID / TouchID / YubiKey).',
  student_passkey_active: 'Hardware Passkey Bound & Active',
  student_register_passkey_btn: 'Register New FIDO2 Passkey',
  student_access_logs: 'Statutory Credential Disclosure & Verification Logs',
  student_log_requester: 'Requesting Authority / Verifier',
  student_log_purpose: 'Verification Mandate',
  student_log_date: 'Attestation Timestamp',
  student_log_status: 'Consent Validation',

  // Public Verifier Portal
  verifier_page_title: 'Instant Academic Credential & Admission Verification',
  verifier_subtitle: 'Authorized public verification gateway for recruitment commissions (UPSC/SSC), corporate background verifiers, and higher education admissions.',
  verifier_apaar_label: 'Candidate 12-Digit APAAR ID *',
  verifier_apaar_placeholder: 'Enter 12-digit student APAAR ID (e.g. 412398471029)',
  verifier_org_label: 'Verifying Entity / Purpose',
  verifier_btn: 'Verify Academic Record',
  verifier_scan_qr_btn: 'Scan Physical Degree QR Code',
  verifier_qr_modal_title: 'Camera Scanner: Digital Degree QR Code',
  verifier_tamper_verified: 'Cryptographically Verified by Affiliating University (Ed25519)',
  verifier_tamper_failed: 'Signature Invalid, Forged, or Revoked',
  verifier_print_btn: 'Print Official Attestation Certificate',

  // Officer Single Sign-On (Login)
  login_page_title: 'National Single Sign-On (Parichay / MeriPehchaan Gateway)',
  login_subtitle: 'Unified Access Gateway for Technical Education Regulators, Universities, Institutions, and Students',
  login_quick_roles: 'Instant Role Switch (Reviewer & Evaluator Fast Track)',
  login_officer_id: 'Officer Username / Official National ID',
  login_password: 'Password / Security Credential',
  login_btn: 'Sign In via Parichay Gateway',
  login_security_notice: 'Official Government of India System. Unauthorized access or credential tampering is punishable under the Information Technology Act 2000.',
};

// Module & Page specific Hindi translations
const PAGE_HI = {
  nav_overview: 'मुख्य पृष्ठ',
  nav_institution: 'संस्थान पोर्टल',
  nav_aicte: 'नियामक परिषद',
  nav_university: 'संबद्धता विश्वविद्यालय',
  nav_student: 'छात्र सहमति (डीपीडीपी)',
  nav_verifier: 'सार्वजनिक सत्यापन',
  nav_mandate: 'एआईसीटीई अधिदेश',
  nav_sign_in: 'अधिकारी लॉगिन',
  nav_sign_out: 'लॉग आउट',
  nav_demo_mode: 'डेमो मोड: लॉगिन खाता',

  crumb_overview: 'राष्ट्रीय अवलोकन एवं संस्थान निर्देशिका',
  crumb_institution: 'स्वीकृत संस्थान रोस्टर पोर्टल (INST-01)',
  crumb_aicte: 'एआईसीटीई राष्ट्रीय निगरानी एवं ऑडिट डैशबोर्ड (REG-02)',
  crumb_university: 'संबद्धता विश्वविद्यालय डिग्री लेजर (UNIV-03)',
  crumb_student: 'छात्र सहमति प्राधिकरण एवं डीपीडीपी वॉल्ट (STU-04)',
  crumb_verifier: 'सार्वजनिक प्रमाणपत्र सत्यापन टर्मिनल (VRF-05)',
  crumb_login: 'अधिकारी एकल साइन-ऑन (परिचय गेटवे)',
  crumb_policy: 'वैधानिक नीति एवं दिशानिर्देश',

  inst_page_title: 'अनुमोदित तकनीकी संस्थान पोर्टल',
  inst_subtitle: 'ब्राउज़र में डेटा सत्यापन (शून्य पीआईआई रिसाव) और गतिशील प्रवेश सीमा (60 / 120 / 180 / 240 सीटें) के साथ वैधानिक छात्र रोस्टर प्रस्तुत करने का आधिकारिक माध्यम।',
  inst_select_label: 'संस्थान चुनें:',
  inst_tenant_locked: 'संस्थान आरक्षित (भूमिका: INST-001)',
  inst_statutory_badge: 'एआईसीटीई APH 2024–2027 वैधानिक अनुपालन सक्रिय',
  inst_kpi_sanctioned: 'स्वीकृत प्रवेश क्षमता',
  inst_kpi_actual: 'वास्तविक दर्ज नामांकन',
  inst_kpi_utilization: 'प्रवेश क्षमता उपयोग %',
  inst_kpi_status: 'एआईसीटीई वैधानिक स्थिति',
  inst_status_compliant: 'प्रवेश सीमा अनुकूल (मान्य)',
  inst_status_overrun: 'प्रवेश सीमा से अधिक (अनियमितता चिह्नित)',
  inst_cat_heading: 'एआईसीटीई स्वीकृत गतिशील श्रेणी विभाजन (APH 2024–2027 मानक)',
  inst_cat_supernumerary: 'अतिरिक्त सीटें (15% TFW/EWS)',
  inst_cat_nri: 'एनआरआई कोटा (5%)',
  inst_cat_oci: 'ओसीआई श्रेणी (2%)',
  inst_cat_fn: 'विदेशी छात्र (3%)',
  inst_upload_heading: 'ब्राउज़र-आधारित रोस्टर अपलोड एवं मेमोरी जाँच',
  inst_upload_sub: 'शून्य क्लाउड रिसाव: डेटा सर्वर पर भेजने से पहले ब्राउज़र मेमोरी में ही 12-अंकीय अपार आईडी की वैधता जाँची जाती है।',
  inst_upload_dropzone: 'छात्र रोस्टर CSV फ़ाइल यहाँ खींचें या फ़ाइल चुनें',
  inst_upload_demo_btn: 'डेमो रोस्टर लोड करें (187 छात्र / 180 स्वीकृत सीटें)',
  inst_triage_heading: 'त्वरित मेमोरी जाँच परिणाम',
  inst_triage_valid: 'वैध अपार रिकॉर्ड',
  inst_triage_missing: 'अनुपस्थित अपार आईडी',
  inst_triage_malformed: 'अमान्य / विकृत अपार आईडी',
  inst_sync_btn: 'वैध रिकॉर्ड एआईसीटीई लेजर में सुरक्षित करें',
  inst_api_tab_title: 'स्वचालित एपीआई एकीकरण (MIS / ERP सिंक)',
  inst_api_tab_sub: 'एआईसीटीई नेशनल रोस्टर स्कीमा के माध्यम से कॉलेज ईआरपी को सीधे जोड़ें।',

  aicte_page_title: 'एआईसीटीई राष्ट्रीय निगरानी एवं ऑडिट डैशबोर्ड',
  aicte_subtitle: 'स्वीकृत प्रवेश क्षमता से अधिक नामांकन और राज्यों के मध्य दोहरे नामांकन की वास्तविक समय पर राष्ट्रीय निगरानी।',
  aicte_kpi_total_colleges: 'निगरानी अधीन तकनीकी संस्थान',
  aicte_kpi_compliance_index: 'राष्ट्रीय अनुपालन सूचकांक',
  aicte_kpi_total_enrollment: 'कुल दर्ज नामांकन',
  aicte_kpi_total_sanctioned: 'स्वीकृत वार्षिक प्रवेश क्षमता',
  aicte_kpi_overrun_count: 'सीमा से अधिक नामांकन वाले संस्थान',
  aicte_surveillance_heading: 'संस्थान नामांकन निगरानी एवं कोटा ऑडिट',
  aicte_search_placeholder: 'संस्थान का नाम, कोड, जिला या राज्य खोजें...',
  aicte_all_states: 'सभी राज्य / केंद्र शासित प्रदेश',
  aicte_all_statuses: 'सभी अनुपालन स्थितियाँ',
  aicte_col_inst: 'संस्थान / महाविद्यालय',
  aicte_col_code: 'एआईसीटीई कोड',
  aicte_col_state: 'राज्य एवं जिला',
  aicte_col_sanctioned: 'स्वीकृत सीमा',
  aicte_col_actual: 'वास्तविक नामांकन',
  aicte_col_utilization: 'उपयोग %',
  aicte_col_status: 'वैधानिक स्थिति',
  aicte_duplicate_heading: 'दोहरे परिसर नामांकन चेतावनी',
  aicte_duplicate_sub: 'एक साथ एक से अधिक परिसरों में सक्रिय रूप से नामांकित समान अपार आईडी की स्वचालित पहचान।',
  aicte_export_btn: 'राष्ट्रीय ऑडिट रिपोर्ट डाउनलोड करें (CSV)',

  univ_page_title: 'संबद्धता विश्वविद्यालय डिग्री लेजर',
  univ_subtitle: 'संबद्ध कॉलेजों के छात्रों को Ed25519 क्रिप्टोग्राफ़िक डिजिटल हस्ताक्षर के साथ छेड़छाड़-रहित डिग्री जारी करें एवं निरस्तीकरण लेजर प्रबंधित करें।',
  univ_issue_heading: 'क्रिप्टोग्राफ़िक रूप से हस्ताक्षरित डिग्री जारी करें',
  univ_issue_sub: 'विश्वविद्यालय की Ed25519 निजी कुंजी से सुरक्षित डिजिटल डिग्री सीधे छात्र के 12-अंकीय अपार आईडी से जुड़ी होती है।',
  univ_student_name: 'छात्र का पूरा नाम',
  univ_apaar_id: '12-अंकीय अपार (APAAR) आईडी',
  univ_institution: 'संबद्ध तकनीकी संस्थान',
  univ_degree_name: 'डिग्री / उपाधि का नाम',
  univ_specialization: 'शाखा / विशेषज्ञता',
  univ_year: 'उत्तीर्ण वर्ष',
  univ_cgpa: 'सीजीपीए / श्रेणी',
  univ_sign_btn: 'Ed25519 डिजिटल हस्ताक्षर द्वारा डिग्री जारी करें',
  univ_batch_sign_btn: 'सभी पात्र विद्यार्थियों के लिए एकमुश्त डिग्री हस्ताक्षर',
  univ_ledger_heading: 'विश्वविद्यालय द्वारा जारी डिग्री लेजर',
  univ_revocation_heading: 'प्रमाणपत्र निरस्तीकरण लेजर',
  univ_revocation_sub: 'रद्द या निलंबित की गई डिग्रियों का अपरिवर्तनीय सार्वजनिक रिकॉर्ड।',

  student_page_title: 'छात्र सहमति प्राधिकरण एवं डीपीडीपी वॉल्ट',
  student_subtitle: 'डिजिटल व्यक्तिगत डेटा संरक्षण (डीपीडीपी) अधिनियम, 2023 की धारा 6 के अनुरूप छात्र सहमति वॉल्ट। अपने डेटा अधिकार नियंत्रित करें और पासकी प्रबंधित करें।',
  student_vault_heading: 'अपार पहचान एवं वैधानिक डीपीडीपी सहमति स्थिति',
  student_consent_label: 'वर्तमान सहमति स्थिति (डीपीडीपी धारा 6)',
  student_consent_active: 'सहमति सक्रिय: सत्यापनकर्ता और नियोक्ता आपके शैक्षणिक रिकॉर्ड देख सकते हैं।',
  student_consent_revoked: 'सहमति वापस ली गई: डेटा सुरक्षा के तहत रिकॉर्ड आंशिक रूप से छिपाए जाएँगे।',
  student_grant_btn: 'सत्यापन सहमति प्रदान करें',
  student_revoke_btn: 'सहमति वापस लें (डेटा गोपनीयता सक्रिय करें)',
  student_passkey_heading: 'बायोमेट्रिक हार्डवेयर पासकी (W3C WebAuthn)',
  student_passkey_sub: 'फिशिंग-मुक्त FIDO2 पासकी (FaceID / फिंगरप्रिंट / YubiKey) से अपने रिकॉर्ड सुरक्षित रखें।',
  student_passkey_active: 'हार्डवेयर पासकी पंजीकृत एवं सक्रिय',
  student_register_passkey_btn: 'नई FIDO2 पासकी पंजीकृत करें',
  student_access_logs: 'वैधानिक डेटा प्रकटीकरण एवं सत्यापन लॉग',
  student_log_requester: 'अनुरोधकर्ता संस्था / सत्यापनकर्ता',
  student_log_purpose: 'सत्यापन का उद्देश्य',
  student_log_date: 'सत्यापन समय',
  student_log_status: 'सहमति स्थिति',

  verifier_page_title: 'शैक्षणिक प्रमाणपत्र एवं प्रवेश सत्यापन गेटवे',
  verifier_subtitle: 'भर्ती आयोगों (UPSC/SSC), कंपनियों एवं विश्वविद्यालयों के लिए खुला सार्वजनिक 12-अंकीय अपार सत्यापन पोर्टल।',
  verifier_apaar_label: 'विद्यार्थी की 12-अंकीय अपार (APAAR) आईडी *',
  verifier_apaar_placeholder: '12-अंकीय अपार आईडी दर्ज करें (उदा. 412398471029)',
  verifier_org_label: 'सत्यापनकर्ता संगठन / उद्देश्य',
  verifier_btn: 'शैक्षणिक रिकॉर्ड सत्यापित करें',
  verifier_scan_qr_btn: 'डिग्री पर मुद्रित क्यूआर कोड स्कैन करें',
  verifier_qr_modal_title: 'कैमरा स्कैनर: डिग्री क्यूआर कोड',
  verifier_tamper_verified: 'संबद्धता विश्वविद्यालय कुंजी द्वारा प्रमाणित (Ed25519)',
  verifier_tamper_failed: 'हस्ताक्षर अमान्य, जाली या निरस्त',
  verifier_print_btn: 'सत्यापन प्रमाणपत्र प्रिंट करें',

  login_page_title: 'राष्ट्रीय एकल साइन-ऑन (परिचय / मेरी पहचान गेटवे)',
  login_subtitle: 'तकनीकी शिक्षा नियामकों, विश्वविद्यालयों, संस्थानों और छात्रों के लिए एकीकृत प्रमाणीकरण गेटवे',
  login_quick_roles: 'त्वरित भूमिका चयन (मूल्यांकनकर्ता डेमो मोड)',
  login_officer_id: 'अधिकारी यूज़रनेम / राष्ट्रीय पहचान',
  login_password: 'पासवर्ड / क्रेडेंशियल',
  login_btn: 'परिचय गेटवे द्वारा साइन इन करें',
  login_security_notice: 'भारत सरकार की आधिकारिक प्रणाली। अनधिकृत पहुँच सूचना प्रौद्योगिकी अधिनियम, 2000 के तहत दंडनीय है।',
};

// Generate for all 23 languages
for (const lang of EIGHTH_SCHEDULE_LANGUAGES) {
  const code = lang.code;
  const uiDict = TRANSLATIONS[code] || TRANSLATIONS.en;
  
  // Load tour translations if exists
  let tourDict: Record<string, string> = {};
  const tourFile = path.join(TOUR_DIR, `${code}.json`);
  if (fs.existsSync(tourFile)) {
    try {
      tourDict = JSON.parse(fs.readFileSync(tourFile, 'utf8'));
    } catch (e) {
      console.error(`Error reading ${tourFile}`, e);
    }
  }

  // Base page translations: use Hindi for hi, English for others with Indic fallback
  let pageDict = PAGE_EN;
  if (code === 'hi') {
    pageDict = PAGE_HI;
  } else if (code !== 'en') {
    // For other Indic languages, fallback to PAGE_HI where available or PAGE_EN
    pageDict = { ...PAGE_EN, ...PAGE_HI };
  }

  // Combine UI + Tour + Page into ONE single dictionary
  const unified = {
    ...uiDict,
    ...tourDict,
    ...pageDict,
  };

  const targetFile = path.join(LOCALES_DIR, `${code}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(unified, null, 2) + '\n', 'utf8');
  console.log(`Generated ${targetFile} with ${Object.keys(unified).length} keys.`);
}

console.log('Successfully generated unified locales for all 23 languages!');
