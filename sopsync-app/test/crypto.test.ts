import { describe, it, expect } from 'vitest';
import { encryptBuffer, decryptBuffer, sha256, newDatabaseKey } from '@main/security/crypto';

describe('encryption', () => {
  it('round-trips an encrypted buffer', () => {
    const secret = Buffer.from('sensitive screenshot bytes');
    const enc = encryptBuffer(secret, 'correct horse battery staple');
    expect(enc.equals(secret)).toBe(false);
    const dec = decryptBuffer(enc, 'correct horse battery staple');
    expect(dec.equals(secret)).toBe(true);
  });

  it('fails to decrypt with the wrong passphrase', () => {
    const enc = encryptBuffer(Buffer.from('x'), 'right');
    expect(() => decryptBuffer(enc, 'wrong')).toThrow();
  });

  it('produces stable sha256 for evidence hashing', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('generates a 64-char hex database key', () => {
    expect(newDatabaseKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});
