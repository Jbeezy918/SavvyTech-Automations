import { promises as fs } from 'node:fs';
import { Database } from '../db/database';
import { Repositories } from '../db/repositories';
import { resolveAppPaths, type AppPaths } from './paths';
import { createSecretStore, KEYCHAIN_ACCOUNTS, type SecretStore } from '../security/keychain';
import { newDatabaseKey } from '../security/crypto';
import { logger } from '../logging/logger';
import { Watchdog } from '../watchdog';
import type { CaptureService } from '../capture/captureService';

/**
 * Central application context: owns the encrypted DB, repositories, secret
 * store, watchdog, and the single active capture session (if any). Created once
 * at boot; performs crash recovery of interrupted sessions.
 */
export class AppContext {
  activeCapture: CaptureService | null = null;

  private constructor(
    readonly paths: AppPaths,
    readonly db: Database,
    readonly repos: Repositories,
    readonly secrets: SecretStore,
    readonly watchdog: Watchdog,
  ) {}

  static async boot(userDataDir?: string): Promise<AppContext> {
    const paths = resolveAppPaths(userDataDir);
    for (const dir of [paths.root, paths.evidence, paths.derived, paths.backups, paths.logs]) {
      await fs.mkdir(dir, { recursive: true });
    }

    const secrets = await createSecretStore();
    // Obtain (or create) the database key from the Keychain — never on disk.
    let dbKey = await secrets.get(KEYCHAIN_ACCOUNTS.dbPassphrase);
    if (!dbKey) {
      dbKey = newDatabaseKey();
      await secrets.set(KEYCHAIN_ACCOUNTS.dbPassphrase, dbKey);
      logger.info('boot', 'Generated a new encrypted-database key and stored it in the Keychain.');
    }

    const db = await Database.open(paths.db, dbKey);
    const repos = new Repositories(db);
    logger.attach(repos);

    const watchdog: Watchdog = new Watchdog(5_000, () => ctx.activeCapture?.isCaptureActive ?? false);
    const ctx: AppContext = new AppContext(paths, db, repos, secrets, watchdog);
    ctx.recoverInterruptedSessions();
    watchdog.register({
      name: 'database',
      captureCritical: true,
      isHealthy: () => db.integrityOk(),
      restart: async () => { /* DB is synchronous & local; integrity failures are logged for the operator. */ },
    });
    watchdog.start();
    return ctx;
  }

  /**
   * Crash recovery (spec section 18): any session left in running/paused state
   * is marked "recovered" so the operator can resume or finalize it. Captured
   * evidence is intact because every event/screenshot was committed in its own
   * transaction.
   */
  private recoverInterruptedSessions(): void {
    const interrupted = this.repos.findInterruptedSessions();
    for (const s of interrupted) {
      this.repos.updateSessionState(s.id, 'recovered', {});
      logger.warn('recovery',
        `Session ${s.id} ("${s.participantLabel}") was interrupted and has been recovered. ` +
        `${s.screenshotCount} screenshots are preserved. You can resume or finalize it.`);
    }
  }

  async backup(): Promise<string> {
    const dest = `${this.paths.backups}/sopsync-${Date.now()}.db`;
    await this.db.backup(dest);
    logger.info('backup', `Database backed up to ${dest}.`);
    return dest;
  }

  async shutdown(): Promise<void> {
    this.watchdog.stop();
    if (this.activeCapture?.isCaptureActive) {
      logger.warn('shutdown', 'Stopping active capture session cleanly before exit.');
      await this.activeCapture.stop();
    }
    this.db.close();
  }
}
