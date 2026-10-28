-- 0002: real WebAuthn credentials + Ed25519 degree signatures
ALTER TABLE passkey_credentials ADD COLUMN transports TEXT;
ALTER TABLE degrees ADD COLUMN signature TEXT;
ALTER TABLE degrees ADD COLUMN signing_key_id TEXT;
-- Pre-existing demo credentials have fake public keys and can never verify.
UPDATE students SET passkey_credential_id = NULL
  WHERE passkey_credential_id IN (SELECT id FROM passkey_credentials WHERE transports IS NULL);
DELETE FROM passkey_credentials WHERE transports IS NULL;
