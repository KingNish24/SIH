import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransport,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { DatabaseAdapter } from './db';

export const RP_NAME = 'VIDYA National Academic Identity System';
const CHALLENGE_TTL_SECONDS = 120;

let cfEnv: any = null;
try {
  // @ts-ignore
  const cfMod = await import('cloudflare:workers');
  if (cfMod?.env) cfEnv = cfMod.env;
} catch {
  // local dev
}

export function getEnv(): Record<string, any> {
  if (cfEnv) return cfEnv;
  return (globalThis as any).process?.env ?? {};
}

interface ChallengeStore {
  put(key: string, value: string, opts: { expirationTtl: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// Dev-only fallback when KV binding is absent (single process).
const mem = new Map<string, { v: string; exp: number }>();
const memStore: ChallengeStore = {
  async put(k, v, { expirationTtl }) { mem.set(k, { v, exp: Date.now() + expirationTtl * 1000 }); },
  async get(k) { const e = mem.get(k); if (!e || e.exp < Date.now()) { mem.delete(k); return null; } return e.v; },
  async delete(k) { mem.delete(k); },
};

function store(): ChallengeStore {
  return (cfEnv?.CHALLENGES as ChallengeStore) ?? memStore;
}

const key = (kind: 'reg' | 'auth', apaar: string) => `webauthn:${kind}:${apaar}`;

async function saveChallenge(kind: 'reg' | 'auth', apaar: string, challenge: string) {
  await store().put(key(kind, apaar), challenge, { expirationTtl: CHALLENGE_TTL_SECONDS });
}

/** Single-use: fetch and delete. */
async function consumeChallenge(kind: 'reg' | 'auth', apaar: string): Promise<string | null> {
  const k = key(kind, apaar);
  const c = await store().get(k);
  if (c) await store().delete(k);
  return c;
}

export function rpFromRequest(request: Request) {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

export interface StoredCredential {
  id: string;
  apaar_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}

async function getCredentials(db: DatabaseAdapter, apaar: string): Promise<StoredCredential[]> {
  const res = await db.prepare('SELECT * FROM passkey_credentials WHERE apaar_id = ?').bind(apaar).all<StoredCredential>();
  return res.results || [];
}

const parseTransports = (t: string | null | undefined): AuthenticatorTransport[] | undefined => {
  if (!t) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
};

export async function startRegistration(db: DatabaseAdapter, request: Request, student: any) {
  const { rpID } = rpFromRequest(request);
  const existing = await getCredentials(db, student.apaar_id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: student.email || `${student.apaar_id}@student.ac.in`,
    userDisplayName: student.full_name || 'Student',
    userID: new TextEncoder().encode(student.apaar_id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  await saveChallenge('reg', student.apaar_id, options.challenge);
  return options;
}

export async function finishRegistration(
  db: DatabaseAdapter,
  request: Request,
  apaar: string,
  response: RegistrationResponseJSON,
  deviceType: string,
) {
  const expectedChallenge = await consumeChallenge('reg', apaar);
  if (!expectedChallenge) throw new Error('Registration challenge expired or already used');
  const { rpID, origin } = rpFromRequest(request);
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!v.verified || !v.registrationInfo) throw new Error('Passkey registration could not be verified');
  const { credential } = v.registrationInfo;
  const transports = JSON.stringify(credential.transports ?? response.response.transports ?? []);
  await db.prepare(
    `INSERT INTO passkey_credentials (id, apaar_id, public_key, counter, device_type, transports)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(credential.id, apaar, isoBase64URL.fromBuffer(credential.publicKey), credential.counter, deviceType, transports).run();
  return credential.id;
}

export async function startAuthentication(db: DatabaseAdapter, request: Request, apaar: string) {
  const { rpID } = rpFromRequest(request);
  const creds = await getCredentials(db, apaar);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    userVerification: 'required',
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  await saveChallenge('auth', apaar, options.challenge);
  return { options, hasRegisteredPasskey: creds.length > 0 };
}

/** Verifies an assertion server-side; throws on failure. Updates the signature counter. */
export async function verifyAssertion(
  db: DatabaseAdapter,
  request: Request,
  apaar: string,
  response: AuthenticationResponseJSON,
) {
  if (!response?.id) throw new Error('Passkey assertion required');
  const expectedChallenge = await consumeChallenge('auth', apaar);
  if (!expectedChallenge) throw new Error('Authentication challenge expired or already used');
  const cred = (await getCredentials(db, apaar)).find((c) => c.id === response.id);
  if (!cred) throw new Error('Credential not registered for this student');
  const { rpID, origin } = rpFromRequest(request);
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: cred.id,
      publicKey: isoBase64URL.toBuffer(cred.public_key),
      counter: Number(cred.counter) || 0,
      transports: parseTransports(cred.transports),
    },
  });
  if (!v.verified) throw new Error('Passkey assertion verification failed');
  await db.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?')
    .bind(v.authenticationInfo.newCounter, cred.id).run();
  return cred.id;
}
