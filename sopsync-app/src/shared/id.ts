import crypto from 'node:crypto';

/** Prefixed, collision-resistant IDs, e.g. "ses_3f2a...". */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export const nowIso = (): string => new Date().toISOString();
