import type { APIRoute } from 'astro';
import { getSigningKeys } from '../../../lib/signing';

export const GET: APIRoute = async () => {
  const keys = await getSigningKeys();
  if (!keys) {
    return new Response(JSON.stringify({ success: false, error: 'Signing key not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const jwk = (await crypto.subtle.exportKey('jwk', keys.pub)) as JsonWebKey;
  return new Response(JSON.stringify({
    success: true,
    alg: 'Ed25519',
    kid: keys.kid,
    publicKeyRaw: keys.rawPub,
    jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, kid: keys.kid, use: 'sig' },
    canonicalization: 'JSON with sorted keys: apaar_id,cgpa,degree_name,id,institution_id,issued_at,issuing_authority,specialization,year_of_passing',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
};
