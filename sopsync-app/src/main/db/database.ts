import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Encrypted local database wrapper (SQLCipher via better-sqlite3-multiple-ciphers).
 *
 * `better-sqlite3` is synchronous, which makes transaction-safe writes simple:
 * `tx()` wraps a function in BEGIN/COMMIT with automatic ROLLBACK on throw, so a
 * crash or error mid-write never leaves a session or screenshot half-persisted
 * (spec section 18). The native module is loaded lazily and typed loosely so the
 * pure-logic test suite does not require it to be compiled.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sqlite = any;

export class Database {
  private constructor(private readonly db: Sqlite) {}

  static async open(path: string, key: string): Promise<Database> {
    const mod = await import('better-sqlite3-multiple-ciphers');
    const Ctor = (mod.default ?? mod) as unknown as new (p: string) => Sqlite;
    const db = new Ctor(path);
    // Key the database BEFORE any other statement.
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`key='${key.replace(/'/g, "''")}'`);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    const wrapper = new Database(db);
    wrapper.migrate();
    return wrapper;
  }

  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
    const row = this.db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get() as
      | { value: string }
      | undefined;
    if (!row) {
      this.db
        .prepare(`INSERT INTO schema_meta(key, value) VALUES ('version', ?)`)
        .run(String(SCHEMA_VERSION));
    }
    // Future migrations compare row.value to SCHEMA_VERSION here.
  }

  /** Run `fn` inside a transaction; rolls back automatically if it throws. */
  tx<T>(fn: () => T): T {
    const runner = this.db.transaction(fn);
    return runner();
  }

  prepare(sql: string): Sqlite {
    return this.db.prepare(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Online backup to a file (spec: database backup & restore). */
  backup(destPath: string): Promise<void> {
    return this.db.backup(destPath);
  }

  /** Integrity check used by System Health / diagnostics. */
  integrityOk(): boolean {
    const r = this.db.pragma('integrity_check', { simple: true });
    return r === 'ok';
  }

  close(): void {
    this.db.close();
  }
}
