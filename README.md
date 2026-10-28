# VIDYA: National Academic Student Registry & Fraud Detection System

> **Smart India Hackathon (SIH 2026)** &bull; **Problem Statement SIH26263**  
> **Team:** `DataNovaX014`  
> **Mandatory Runtime:** `bun` (No `npm` used)  
> **Target:** Cloudflare Workers with D1 Database (SQLite) + Client-side DuckDB-Wasm + W3C WebAuthn Passkeys

---

## 🌟 Executive Summary

**VIDYA** (Verifiable Integrated Digital Yield for Academics) is an enterprise-grade academic lifecycle integrity platform built for the **All India Council for Technical Education (AICTE)** and affiliating universities.

Traditional academic enrollment systems suffer from three critical vulnerabilities:
1. **Unsanctioned Seat Overruns:** Technical institutions admitting students in excess of approved intake quotas (e.g. admitting 187 students into a sanctioned 180-seat quota).
2. **Cross-Campus Duplicate Enrollments:** "Ghost students" simultaneously enrolled in multiple institutions to claim dual state subsidies or misreport faculty-to-student ratios.
3. **Severe PII Exposure:** Traditional portals require colleges to upload raw student rosters directly to central servers before validation, risking leaks of unvetted student personal data.

VIDYA solves these challenges with a **Privacy-First Architecture**:
- **DuckDB-Wasm In-Browser Triage:** CSV rosters are parsed directly inside the client's WebAssembly sandbox. Invalid and missing 12-digit APAAR IDs are quarantined in-browser with **0 PII leaked to the server**.
- **Cloudflare D1 ACID Quota Enforcement:** Strict database-level seat validation halts or flags unsanctioned admissions (+7 excess flagged).
- **DPDP Act 2023 Section 6 Biometric Passkeys:** W3C WebAuthn Passkeys (Windows Hello, Apple Touch ID, FIDO2) give students sovereign biometric control over third-party background verification requests.

---

## 🏛️ The 5 Stakeholder Portals

| Portal Route | Stakeholder | Key Features & Pre-Seeded Scenario |
| :--- | :--- | :--- |
| **`/`** | **Overview Hub** | Unified landing terminal, team badges, real-time macro statistics, and 1-click role switcher. |
| **`/institution`** | **College / Institution** | CSV roster upload with client-side DuckDB-Wasm triage, 180-seat cap live meter (+7 excess warning for College A), Cloudflare D1 ACID sync. |
| **`/aicte`** | **AICTE Regulator** | AICTE surveillance radar, priority inspection queue ranked by Risk %, seat overrun alerts (187 vs 180), cross-campus duplicate student graphs (Rahul Sharma, Priya Verma). |
| **`/university`** | **Affiliating University** | Affiliated college roster audit, degree minting with SHA-256 digital provenance, immediate degree revocation engine with Senate orders. |
| **`/student`** | **Student DPDP Vault** | Unified APAAR profile, enrolled programs, third-party verification log, W3C WebAuthn biometric Passkey consent manager. |
| **`/verifier`** | **3rd-Party Verifier** | High-speed verification terminal (<5s latency guarantee) for employers (TCS, Infosys) & UPSC. DPDP consent guard with cryptographic proof checks. |

---

## 📊 Pre-Seeded AICTE Demo Data

- **Technical College A (Apex Institute of Engineering):** Sanctioned cap: **180 seats**. Enrolled: **187 students** (**+7 excess seats**, Risk Score: **94.2%**, Inspection Priority: **HIGH**).
- **Technical College B (Metro Polytechnic & College):** Sanctioned cap: **120 seats**. Enrolled: **115 students** (Normal operation).
- **State University College of Engineering:** Sanctioned cap: **240 seats**. Enrolled: **238 students** (Near capacity).
- **Cross-Campus Duplicate Students:**
  - `739284019283` &mdash; **Rahul Sharma** (Enrolled in College A B.Tech CS **and** College B B.Tech IT simultaneously).
  - `582910384729` &mdash; **Priya Verma** (Enrolled in College A B.Tech CS **and** State University College simultaneously).
- **Degree Provenance Scenarios:**
  - `412398471029` &mdash; **Sneha Sundaram** (B.Tech CSE, 9.42 CGPA, Status: `ISSUED`).
  - `601928374819` &mdash; **Vikram Malhotra** (B.Tech Civil, Status: `REVOKED` &mdash; Reason: *"Academic Integrity Violation: Fraudulent lateral entry credit transfer detected during AICTE audit"*).

---

## 🚀 Quickstart & Verification Commands

All commands strictly use `bun`.

### 1. Install Dependencies
```bash
cd D:\SIH
bun install
```

### 2. Initialize and Seed Cloudflare D1 Database (Local)
```bash
bun run db:init
bun run db:seed
```

### 3. Run Development Server (with Live Hot-Reloading)
```bash
bun run dev
```
Open **[http://localhost:4321](http://localhost:4321)** in your browser.

### 4. Build for Production / Cloudflare Workers
```bash
bun run build
```
Or for Cloudflare Worker deployment bundle:
```bash
bun run build:cf
```

---

## 🧪 Testing the 5 Stakeholder Flows

1. **Institution Portal (`/institution`):**
   - Click *"Mixed Batch (Valid + Missing + Fake)"* demo button.
   - Observe DuckDB-Wasm isolating 4 valid 12-digit APAARs, 1 malformed (10-digit), and 1 missing APAAR in tabs.
   - Click *"Commit Valid Records to Cloudflare D1"* to test ACID enrollment sync.
   - Observe the 180-Seat Cap Live Meter warning of regulatory overruns (+7 excess).

2. **AICTE Regulator Portal (`/aicte`):**
   - Observe Technical College A flagged at the top with **94.2% Risk Score** and **+7 Overrun Alert**.
   - Review the *Cross-Campus Duplicate Graph* showing Rahul Sharma and Priya Verma enrolled simultaneously across multiple colleges.
   - Click *"Run Live Audit Scan"* and *"Dispatch Show-Cause Notices"*.

3. **Affiliating University Portal (`/university`):**
   - Review the degree ledger with active status badges and SHA-256 digital stamps.
   - Test revoking an issued degree with Senate order reason.
   - Fill the *"Issue and Digitally Sign Academic Degree"* form to mint a degree anchored to a student's APAAR.

4. **Student Portal (`/student`):**
   - Select student **Rahul Sharma** or **Sneha Sundaram**.
   - Click *"Authorize with Passkey"* to trigger W3C WebAuthn challenge (with automatic hardware biometric sensor / simulated key fallback).
   - Toggle *"Revoke All Third-Party Access"* to test real-time DPDP PII masking.

5. **Verifier Portal (`/verifier`):**
   - Click the test button for **Sneha Sundaram (`412398471029`)**: Observe verified degree and <5s response latency (typically ~1ms).
   - Click the test button for **Vikram Malhotra (`601928374819`)**: Observe DPDP masked PII (`V*** M***`) and the exact Senate revocation order.
