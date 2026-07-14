import path from 'node:path';
import os from 'node:os';

/**
 * Secure project folder structure (spec section 3). All data lives under a
 * single app-data root so backup/retention/uninstall operate on one tree.
 *
 *   <root>/
 *     sopsync.db            encrypted SQLCipher database
 *     evidence/<sessionId>/ immutable original screenshots (001.png ...)
 *     derived/<sessionId>/  redacted/cropped/annotated derived images
 *     backups/              database backups
 *     logs/                 rotating plain-text logs
 *     config.json           non-secret config (secrets live in Keychain)
 */
export interface AppPaths {
  root: string;
  db: string;
  evidence: string;
  derived: string;
  backups: string;
  logs: string;
  config: string;
}

export function resolveAppPaths(userDataDir?: string): AppPaths {
  const root = userDataDir ?? path.join(os.homedir(), 'Library', 'Application Support', 'SOPsync');
  return {
    root,
    db: path.join(root, 'sopsync.db'),
    evidence: path.join(root, 'evidence'),
    derived: path.join(root, 'derived'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs'),
    config: path.join(root, 'config.json'),
  };
}

export function evidenceDirFor(paths: AppPaths, sessionId: string): string {
  return path.join(paths.evidence, sessionId);
}
