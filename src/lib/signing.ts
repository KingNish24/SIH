import { getEnv } from './webauthn';

/** Fields covered by the degree signature, in canonical order. */
export interface SignableDegree {
  id: string;
  apaar_id: string;
  institution_id: string;
  degree_name: string;
  specialization: string;
  cgpa: number;
  year_of_passing: number;
  issuing_authority: string;
  issued_at: string;
}

const FIELDS: (keyof SignableDegree)[] = [
  'apaar_id', 'cgpa', 'degree_name', 'id', 'institution_id',
  'issued_at', 'issuing_authority', 'specialization', 'year_of_passing',
];

/** Canonical JSON: sorted keys, numbers normalised, no whitespace. */
export function canonicalDegree(d: SignableDegree): string {
  const o: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const v = d[k];
    o[k] = k === 'cgpa' || k === 'year_of_passing' ? Number(v) : String(v ?? '');
  }
  return JSON.stringify(o);
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};

let cached: { priv: CryptoKey; pub: CryptoKey; rawPub: string; kid: string } | null = null;

/** Loads Ed25519 keypair from DEGREE_SIGNING_KEY (PKCS8 base64). Returns null if unset. */
export async function getSigningKeys() {
  if (cached) return cached;
  const pkcs8 = getEnv().DEGREE_SIGNING_KEY as string | undefined;
  if (!pkcs8) return null;
  const priv = await crypto.subtle.importKey('pkcs8', b64ToBytes(pkcs8.trim()), { name: 'Ed25519' }, true, ['sign']);
  const jwk = (await crypto.subtle.exportKey('jwk', priv)) as JsonWebKey;
  const pubJwk: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
  const pub = await crypto.subtle.importKey('jwk', pubJwk, { name: 'Ed25519' }, true, ['verify']);
  const rawPub = bytesToB64(await crypto.subtle.exportKey('raw', pub) as ArrayBuffer);
  const digest = await crypto.subtle.digest('SHA-256', b64ToBytes(rawPub));
  const kid = 'ed25519-' + bytesToB64(digest).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  cached = { priv, pub, rawPub, kid };
  return cached;
}

export async function signDegree(d: SignableDegree): Promise<{ signature: string; keyId: string }> {
  const keys = await getSigningKeys();
  if (!keys) throw new Error('DEGREE_SIGNING_KEY secret is not configured');
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, keys.priv, new TextEncoder().encode(canonicalDegree(d)));
  return { signature: bytesToB64(sig), keyId: keys.kid };
}

export async function verifyDegree(d: SignableDegree, signature: string | null | undefined, keyId: string | null | undefined): Promise<boolean> {
  if (!signature || !keyId) return false;
  const keys = await getSigningKeys();
  if (!keys || keys.kid !== keyId) return false;
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, keys.pub, b64ToBytes(signature), new TextEncoder().encode(canonicalDegree(d)));
  } catch {
    return false;
  }
}
