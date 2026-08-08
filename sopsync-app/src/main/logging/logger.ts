import type { LogLevel, SystemLog } from '@shared/types';
import { newId, nowIso } from '@shared/id';

/**
 * Structured, plain-language logging (spec section 18: "Logs that explain errors
 * in plain language"). Every log is both written to the console (dev) and, when a
 * sink is attached, persisted to the encrypted DB so System Health can show them.
 */
export interface LogSink {
  insertLog(log: SystemLog): void;
}

export class Logger {
  private sink: LogSink | null = null;

  attach(sink: LogSink): void {
    this.sink = sink;
  }

  log(level: LogLevel, category: string, message: string, detail?: unknown): void {
    const entry: SystemLog = {
      id: newId('log'),
      level,
      category,
      message,
      detail: detail == null ? null : typeof detail === 'string' ? detail : safeStringify(detail),
      createdAt: nowIso(),
    };
    const line = `[${entry.createdAt}] ${level.toUpperCase()} ${category}: ${message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    try {
      this.sink?.insertLog(entry);
    } catch {
      // Never let logging failures crash the app.
    }
  }

  debug(c: string, m: string, d?: unknown) { this.log('debug', c, m, d); }
  info(c: string, m: string, d?: unknown) { this.log('info', c, m, d); }
  warn(c: string, m: string, d?: unknown) { this.log('warn', c, m, d); }
  error(c: string, m: string, d?: unknown) { this.log('error', c, m, d); }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const logger = new Logger();
