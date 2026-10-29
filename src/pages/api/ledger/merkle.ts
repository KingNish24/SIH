import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { Institution, Admission, Degree } from '../../../lib/types';

export interface LedgerBlock {
  index: number;
  block_type: 'GENESIS' | 'INSTITUTION' | 'ADMISSION' | 'DEGREE';
  record_id: string;
  summary: string;
  canonical_payload: string;
  prev_hash: string;
  block_hash: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeMerkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) {
    return sha256Hex('VIDYA-EMPTY-LEDGER');
  }
  let level = [...hashes];
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      const combined = await sha256Hex(`${left}:${right}`);
      nextLevel.push(combined);
    }
    level = nextLevel;
  }
  return level[0];
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = getDB(locals);

    const instRes = await db.prepare('SELECT * FROM institutions').bind().all<Institution>();
    const institutions = [...(instRes.results || [])].sort((a, b) => a.id.localeCompare(b.id));

    const admRes = await db.prepare('SELECT * FROM admissions').bind().all<Admission>();
    const admissions = [...(admRes.results || [])].sort((a, b) => a.id.localeCompare(b.id));

    const degRes = await db.prepare('SELECT * FROM degrees').bind().all<Degree>();
    const degrees = [...(degRes.results || [])].sort((a, b) => a.id.localeCompare(b.id));

    const blocks: LedgerBlock[] = [];
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Block 0: Genesis Statutory Anchor
    const genesisPayload = JSON.stringify({
      authority: 'AICTE-MoE-NDEAR-Registry',
      mandate: 'APH-2024-2027-BSA-Section-63',
      type: 'GENESIS',
      version: '2026.1',
    });
    const genesisHash = await sha256Hex(`${prevHash}:${genesisPayload}`);
    blocks.push({
      index: 0,
      block_type: 'GENESIS',
      record_id: 'GENESIS-BLOCK-000',
      summary: 'AICTE & MoE Statutory Genesis Anchor (Section 63 Bharatiya Sakshya Adhiniyam 2023)',
      canonical_payload: genesisPayload,
      prev_hash: prevHash,
      block_hash: genesisHash,
    });
    prevHash = genesisHash;

    // Institution Blocks
    for (const inst of institutions) {
      const payload = JSON.stringify({
        code: inst.code,
        current_enrollment: Number(inst.current_enrollment),
        id: inst.id,
        sanctioned_intake: Number(inst.sanctioned_intake),
        state: inst.state,
        status: inst.status,
        type: 'INSTITUTION',
      });
      const blockHash = await sha256Hex(`${prevHash}:${payload}`);
      blocks.push({
        index: blocks.length,
        block_type: 'INSTITUTION',
        record_id: inst.id,
        summary: `Institution ${inst.code} (${inst.current_enrollment}/${inst.sanctioned_intake} seats) [${inst.status}]`,
        canonical_payload: payload,
        prev_hash: prevHash,
        block_hash: blockHash,
      });
      prevHash = blockHash;
    }

    // Admission Blocks
    for (const adm of admissions) {
      const maskedApaar = `XXXX-XXXX-${String(adm.apaar_id || '').slice(-4)}`;
      const payload = JSON.stringify({
        apaar_suffix: String(adm.apaar_id || '').slice(-4),
        batch_year: Number(adm.batch_year),
        id: adm.id,
        institution_id: adm.institution_id,
        is_duplicate: Number(adm.is_duplicate),
        program: adm.program,
        status: adm.status,
        type: 'ADMISSION',
      });
      const blockHash = await sha256Hex(`${prevHash}:${payload}`);
      blocks.push({
        index: blocks.length,
        block_type: 'ADMISSION',
        record_id: adm.id,
        summary: `Admission ${adm.id} | APAAR ${maskedApaar} | ${adm.institution_id} (${adm.status})`,
        canonical_payload: payload,
        prev_hash: prevHash,
        block_hash: blockHash,
      });
      prevHash = blockHash;
    }

    // Degree Blocks
    for (const deg of degrees) {
      const maskedApaar = `XXXX-XXXX-${String(deg.apaar_id || '').slice(-4)}`;
      const payload = JSON.stringify({
        apaar_suffix: String(deg.apaar_id || '').slice(-4),
        cgpa: Number(deg.cgpa),
        degree_name: deg.degree_name,
        digital_signature_hash: deg.digital_signature_hash,
        id: deg.id,
        institution_id: deg.institution_id,
        specialization: deg.specialization,
        status: deg.status,
        type: 'DEGREE',
        year_of_passing: Number(deg.year_of_passing),
      });
      const blockHash = await sha256Hex(`${prevHash}:${payload}`);
      blocks.push({
        index: blocks.length,
        block_type: 'DEGREE',
        record_id: deg.id,
        summary: `Degree ${deg.id} | APAAR ${maskedApaar} | CGPA ${deg.cgpa} [${deg.status}]`,
        canonical_payload: payload,
        prev_hash: prevHash,
        block_hash: blockHash,
      });
      prevHash = blockHash;
    }

    const blockHashes = blocks.map((b) => b.block_hash);
    const merkleRoot = await computeMerkleRoot(blockHashes);

    return new Response(
      JSON.stringify({
        success: true,
        statutory_standard: 'Section 63, Bharatiya Sakshya Adhiniyam (BSA) 2023 — Electronic Evidence Certificate',
        hash_algorithm: 'SHA-256 (FIPS 180-4) Deterministic Hash-Chain & Binary Merkle Tree',
        total_blocks: blocks.length,
        counts: {
          institutions: institutions.length,
          admissions: admissions.length,
          degrees: degrees.length,
        },
        genesis_prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        chain_tip_hash: prevHash,
        merkle_root: merkleRoot,
        generated_at: new Date().toISOString(),
        blocks,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Failed to compute Merkle hash-chain audit ledger',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
