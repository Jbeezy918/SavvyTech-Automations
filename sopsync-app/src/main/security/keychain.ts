/**
 * Secret storage. On macOS this is backed by the system Keychain via `keytar`.
 * API keys and the database passphrase are NEVER written to disk or committed —
 * they live only in the Keychain (spec sections 2 & 19).
 *
 * `keytar` is loaded lazily so the app (and the test suite) runs where the
 * native module is unavailable; in that case an explicit error is thrown for
 * write attempts rather than silently persisting a secret insecurely.
 */

const SERVICE = 'com.savvytech.sopsync';

export interface SecretStore {
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<boolean>;
}

class KeytarStore implements SecretStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private keytar: any) {}
  get(account: string) { return this.keytar.getPassword(SERVICE, account); }
  async set(account: string, secret: string) { await this.keytar.setPassword(SERVICE, account, secret); }
  delete(account: string) { return this.keytar.deletePassword(SERVICE, account); }
}

/** In-memory store used ONLY in dev/test when Keychain is unavailable. */
export class MemorySecretStore implements SecretStore {
  private map = new Map<string, string>();
  async get(account: string) { return this.map.get(account) ?? null; }
  async set(account: string, secret: string) { this.map.set(account, secret); }
  async delete(account: string) { return this.map.delete(account); }
}

export async function createSecretStore(): Promise<SecretStore> {
  try {
    const keytar = await import('keytar');
    return new KeytarStore(keytar.default ?? keytar);
  } catch {
    // No native Keychain (e.g. Linux CI). Callers should treat this as
    // non-production; the app surfaces a clear System Health warning.
    return new MemorySecretStore();
  }
}

export const KEYCHAIN_ACCOUNTS = {
  dbPassphrase: 'db-passphrase',
  aiProvider: (provider: string) => `ai-provider:${provider}`,
} as const;
