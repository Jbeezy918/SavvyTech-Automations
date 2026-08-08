import crypto from 'node:crypto';

/**
 * Field-level and file-level encryption helpers (AES-256-GCM).
 *
 * The database itself is encrypted at rest with SQLCipher (see db/database.ts);
 * these helpers are for (a) encrypting screenshot/evidence files on disk and
 * (b) any field that must be encrypted independently. The master key is derived
 * from a passphrase stored in the macOS Keychain (see keychain.ts) — never hard
 * coded, never written to disk in plaintext.
 */

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;
const PBKDF2_ITERS = 210_000; // OWASP-recommended floor for PBKDF2-SHA256

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERS, KEY_LEN, 'sha256');
}

export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_LEN);
}

/** Encrypt a buffer; output = salt | iv | authTag | ciphertext. */
export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]);
}

export function decryptBuffer(payload: Buffer, passphrase: string): Buffer {
  const salt = payload.subarray(0, SALT_LEN);
  const iv = payload.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = payload.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + 16);
  const enc = payload.subarray(SALT_LEN + IV_LEN + 16);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Generate a random SQLCipher-compatible hex key (used at DB init). */
export function newDatabaseKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
