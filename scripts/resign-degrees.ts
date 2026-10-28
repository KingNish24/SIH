// Re-signs all existing degrees in remote D1 with DEGREE_SIGNING_KEY from .dev.vars.
// Usage: bun scripts/resign-degrees.ts   (mirrors src/lib/signing.ts logic)
import { $ } from 'bun';

const vars = await Bun.file('.dev.vars').text();
const pkcs8 = vars.match(/DEGREE_SIGNING_KEY=(.+)/)?.[1]?.trim();
if (!pkcs8) throw new Error('DEGREE_SIGNING_KEY missing in .dev.vars');

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
const FIELDS = ['apaar_id', 'cgpa', 'degree_name', 'id', 'institution_id', 'issued_at', 'issuing_authority', 'specialization', 'year_of_passing'];
const canonical = (d: Record<string, unknown>) => {
  const o: Record<string, unknown> = {};
  for (const k of FIELDS) o[k] = k === 'cgpa' || k === 'year_of_passing' ? Number(d[k]) : String(d[k] ?? '');
  return JSON.stringify(o);
};

const priv = await crypto.subtle.importKey('pkcs8', b64ToBytes(pkcs8), { name: 'Ed25519' }, true, ['sign']);
const jwk = (await crypto.subtle.exportKey('jwk', priv)) as JsonWebKey;
const pub = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, true, ['verify']);
const rawPub = bytesToB64((await crypto.subtle.exportKey('raw', pub)) as ArrayBuffer);
const kid = 'ed25519-' + bytesToB64(await crypto.subtle.digest('SHA-256', b64ToBytes(rawPub))).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);

const out = await $`bunx wrangler d1 execute vidya-db --remote --json --command ${'SELECT id, apaar_id, institution_id, degree_name, specialization, cgpa, year_of_passing, issuing_authority, issued_at FROM degrees'}`.text();
const rows = JSON.parse(out)[0].results as Record<string, unknown>[];

const esc = (s: string) => s.replace(/'/g, "''");
const sql: string[] = [];
for (const d of rows) {
  const sig = bytesToB64(await crypto.subtle.sign({ name: 'Ed25519' }, priv, new TextEncoder().encode(canonical(d))));
  sql.push(`UPDATE degrees SET signature='${sig}', signing_key_id='${kid}' WHERE id='${esc(String(d.id))}';`);
}
await Bun.write('db/.resign.sql', sql.join('\n'));
await $`bunx wrangler d1 execute vidya-db --remote -y --file=db/.resign.sql`.quiet();
await $`rm db/.resign.sql`.quiet().nothrow();
console.log(`Re-signed ${rows.length} degrees with ${kid}`);
