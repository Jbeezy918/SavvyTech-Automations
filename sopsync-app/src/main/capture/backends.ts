import { spawn } from 'node:child_process';
import type { NavKey } from '@shared/types';

/**
 * Platform capture backends behind narrow interfaces so the orchestration logic
 * is testable and the OS-specific bits are swappable.
 *
 * IMPORTANT (privacy): InputBackend emits only event *types* and a coarse NavKey
 * category. It has no API to report the character a user typed — that is
 * impossible by construction, satisfying the "no keylogger" requirement.
 */

export interface ScreenBackend {
  /** Capture the given monitor to a PNG file at `outPath`. */
  capture(monitorId: number, outPath: string): Promise<void>;
  listMonitors(): Promise<{ id: number; label: string }[]>;
}

export interface InputSignal {
  type: 'mouse_click' | 'key_activity' | 'nav_key' | 'app_change' | 'window_change' | 'idle_start' | 'idle_end';
  app?: string | null;
  windowTitle?: string | null;
  navKey?: NavKey | null;
}

export interface InputBackend {
  start(onSignal: (s: InputSignal) => void): void;
  stop(): void;
}

/**
 * macOS screen capture using the built-in `screencapture` tool. `-x` silences the
 * shutter sound; `-D <n>` selects the display. Requires Screen Recording
 * permission (TCC), which the app requests on first capture.
 */
export class MacScreenBackend implements ScreenBackend {
  capture(monitorId: number, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('screencapture', ['-x', '-D', String(monitorId), outPath]);
      proc.on('error', reject);
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`screencapture exited ${code}`))));
    });
  }
  async listMonitors(): Promise<{ id: number; label: string }[]> {
    // Electron's screen.getAllDisplays() is the real source in main.ts; this
    // fallback returns the primary display so headless tooling still works.
    return [{ id: 1, label: 'Primary Display' }];
  }
}

/**
 * Global input backend. In production this is backed by a native global-hook
 * module (e.g. uiohook-napi) configured to report ONLY event categories, never
 * key characters. Provided here as an injectable interface; the concrete native
 * wiring is documented in docs/KNOWN_LIMITATIONS.md as requiring a Mac to verify.
 */
export class NullInputBackend implements InputBackend {
  private handle: ((s: InputSignal) => void) | null = null;
  start(onSignal: (s: InputSignal) => void): void { this.handle = onSignal; }
  stop(): void { this.handle = null; }
  /** Test/dev hook to inject a signal. */
  emit(s: InputSignal): void { this.handle?.(s); }
}
