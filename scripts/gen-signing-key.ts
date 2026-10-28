// Usage: bun scripts/gen-signing-key.ts
// Prints an Ed25519 keypair. Store the private key with:
//   bunx wrangler secret put DEGREE_SIGNING_KEY
const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
const b64 = (b: ArrayBuffer) => Buffer.from(b).toString('base64');
console.log('DEGREE_SIGNING_KEY (PKCS8 base64, secret):');
console.log(b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey)));
console.log('\nPublic key (raw base64):');
console.log(b64(await crypto.subtle.exportKey('raw', kp.publicKey)));
export {};
