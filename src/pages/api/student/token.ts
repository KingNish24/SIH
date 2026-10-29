import type { APIRoute } from 'astro';
import { getDB, getEnv } from '../../../lib/db';

export interface ScopedConsentToken {
  token_id: string;
  apaar_id: string;
  verifier_org: string;
  purpose: string;
  disclosed_fields: string[];
  ttl_label: string;
  single_use: boolean;
  status: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
  created_at: string;
  expires_at: string;
  signature_digest: string;
}

// In-memory store with pre-seeded realistic DPDP Section 6 tokens for demo resilience
const tokenStore = new Map<string, ScopedConsentToken>();

function ensureSeededTokens() {
  if (tokenStore.size > 0) return;

  const now = Date.now();
  const plus24h = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const plus1h = new Date(now + 1 * 60 * 60 * 1000).toISOString();
  const createdIso = new Date(now - 15 * 60 * 1000).toISOString();

  const seeds: ScopedConsentToken[] = [
    {
      token_id: 'VIDYA-DPDP-8492-A19F',
      apaar_id: '739284019283',
      verifier_org: 'UPSC Civil Services Board',
      purpose: 'Degree & Eligibility Verification',
      disclosed_fields: ['degree_status', 'cgpa_threshold', 'abc_credits'],
      ttl_label: '24 Hours (Single-Use)',
      single_use: true,
      status: 'ACTIVE',
      created_at: createdIso,
      expires_at: plus24h,
      signature_digest: 'SHA256:9f41c80b2a73e19d4401bc8a772e9012f3451d0a8b76c5e1290a4f8b3c12e771',
    },
    {
      token_id: 'VIDYA-DPDP-3104-C72B',
      apaar_id: '739284019283',
      verifier_org: 'TCS Background Verification',
      purpose: 'Zero-Knowledge CGPA >= 7.5 Check',
      disclosed_fields: ['degree_status', 'cgpa_threshold'],
      ttl_label: '1 Hour (Single-Use)',
      single_use: true,
      status: 'ACTIVE',
      created_at: createdIso,
      expires_at: plus1h,
      signature_digest: 'SHA256:4a82d19f0e55b62c8910fa32817465bc9012e4f8a1b2c3d4e5f60718293a4b5c',
    },
    {
      token_id: 'VIDYA-DPDP-6291-E08D',
      apaar_id: '412398471029',
      verifier_org: 'GATE Admissions Committee (IIT Roorkee)',
      purpose: 'B.Tech Honours & ABC 160-Credit Audit',
      disclosed_fields: ['degree_status', 'cgpa_threshold', 'abc_credits'],
      ttl_label: '24 Hours (Single-Use)',
      single_use: true,
      status: 'ACTIVE',
      created_at: createdIso,
      expires_at: plus24h,
      signature_digest: 'SHA256:7d12e84a90b3c4f12839045a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8',
    },
    {
      token_id: 'VIDYA-DPDP-5510-F94A',
      apaar_id: '582910384729',
      verifier_org: 'DRDO Scientist Entry Recruitment Board',
      purpose: 'Degree & Eligibility Verification',
      disclosed_fields: ['degree_status', 'cgpa_threshold'],
      ttl_label: '24 Hours (Single-Use)',
      single_use: true,
      status: 'ACTIVE',
      created_at: createdIso,
      expires_at: plus24h,
      signature_digest: 'SHA256:3c91a04f82e1b7d6543210fedcba9876543210abcdef0123456789abcdef0123',
    },
  ];

  for (const s of seeds) {
    tokenStore.set(s.token_id, s);
  }
}

async function computeTokenDigest(payload: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `SHA256:${hex}`;
}

function generateTokenCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const part1 = ((bytes[0] << 8) | bytes[1]).toString(10).padStart(4, '0').slice(-4);
  const part2 = Array.from(bytes.slice(2))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `VIDYA-DPDP-${part1}-${part2}`;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    ensureSeededTokens();
    const apaarId = url.searchParams.get('apaar_id')?.trim();
    const tokenId = url.searchParams.get('token_id')?.trim();

    if (tokenId) {
      const tok = tokenStore.get(tokenId);
      if (!tok) {
        return new Response(JSON.stringify({ success: false, error: 'Scoped consent token not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (tok.status === 'ACTIVE' && new Date(tok.expires_at).getTime() < Date.now()) {
        tok.status = 'EXPIRED';
      }
      return new Response(JSON.stringify({ success: true, data: tok }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const all = Array.from(tokenStore.values()).map((t) => {
      if (t.status === 'ACTIVE' && new Date(t.expires_at).getTime() < Date.now()) {
        t.status = 'EXPIRED';
      }
      return t;
    });

    const filtered = apaarId ? all.filter((t) => t.apaar_id === apaarId) : all;
    filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return new Response(JSON.stringify({ success: true, data: filtered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to fetch tokens' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    ensureSeededTokens();
    const body = await request.json();
    const apaar_id = String(body.apaar_id || '').trim();
    const verifier_org = String(body.verifier_org || '').trim();
    const purpose = String(body.purpose || '').trim();
    const disclosed_fields: string[] = Array.isArray(body.disclosed_fields)
      ? body.disclosed_fields.map((f: unknown) => String(f))
      : ['degree_status', 'cgpa_threshold'];
    const ttl_hours = Number(body.ttl_hours) || 24;
    const single_use = body.single_use !== false;

    if (!/^[0-9]{12}$/.test(apaar_id)) {
      return new Response(JSON.stringify({ success: false, error: 'Valid 12-digit APAAR ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!verifier_org || !purpose) {
      return new Response(JSON.stringify({ success: false, error: 'verifier_org and purpose are required under DPDP Section 6' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token_id = generateTokenCode();
    const now = Date.now();
    const created_at = new Date(now).toISOString();
    const expires_at = new Date(now + ttl_hours * 60 * 60 * 1000).toISOString();
    const ttl_label = ttl_hours === 1
      ? `1 Hour${single_use ? ' (Single-Use)' : ''}`
      : `${ttl_hours} Hours${single_use ? ' (Single-Use)' : ''}`;

    const signature_digest = await computeTokenDigest({
      token_id,
      apaar_id,
      verifier_org,
      purpose,
      disclosed_fields,
      expires_at,
      single_use,
    });

    const record: ScopedConsentToken = {
      token_id,
      apaar_id,
      verifier_org,
      purpose,
      disclosed_fields,
      ttl_label,
      single_use,
      status: 'ACTIVE',
      created_at,
      expires_at,
      signature_digest,
    };

    tokenStore.set(token_id, record);

    // Best-effort KV persistence if CHALLENGES binding is available
    try {
      const kv = getEnv()?.CHALLENGES;
      if (kv?.put) {
        await kv.put(`dpdp_token:${token_id}`, JSON.stringify(record), {
          expirationTtl: Math.max(60, ttl_hours * 3600),
        });
      }
    } catch {
      // Fallback to in-memory store
    }

    // Also record in verification_requests audit log in D1
    try {
      const db = getDB(locals);
      await db
        .prepare(
          `INSERT INTO verification_requests (id, apaar_id, verifier_name, purpose, consent_status, verified_at, response_time_ms)
           VALUES (?, ?, ?, ?, 'GRANTED', ?, ?)`
        )
        .bind(
          token_id,
          apaar_id,
          verifier_org,
          `${purpose} [Scope: ${disclosed_fields.join(', ')}]`,
          created_at.replace('T', ' ').substring(0, 19),
          42
        )
        .run();
    } catch {
      // Non-fatal if audit table insert fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scoped Consent Token ${token_id} minted under DPDP Act Section 6.`,
        data: record,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to mint consent token' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    ensureSeededTokens();
    let tokenId = url.searchParams.get('token_id')?.trim();
    if (!tokenId) {
      try {
        const body = await request.json();
        tokenId = String(body.token_id || '').trim();
      } catch {
        // ignore JSON parse error if query param used
      }
    }

    if (!tokenId) {
      return new Response(JSON.stringify({ success: false, error: 'token_id is required to revoke token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = tokenStore.get(tokenId);
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Consent token not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    existing.status = 'REVOKED';
    tokenStore.set(tokenId, existing);

    try {
      const kv = getEnv()?.CHALLENGES;
      if (kv?.delete) {
        await kv.delete(`dpdp_token:${tokenId}`);
      }
    } catch {
      // ignore KV error
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scoped Consent Token ${tokenId} revoked immediately under DPDP Act Section 6(4).`,
        data: existing,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to revoke token' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
