import type { CaptureConfig, CaptureEventType, NavKey, SessionState } from '@shared/types';

/**
 * Capture-session state machine (spec sections 5 & 18).
 *
 * Pure, deterministic, and clock-injected so it is fully unit-testable and so
 * crash recovery can rebuild state from persisted events. It owns:
 *  - legal state transitions (created→running→paused→running→stopped)
 *  - ACTIVE elapsed time that excludes paused intervals
 *  - the trigger decision: given an input event + config, should we screenshot?
 *  - the privacy guard: raw characters are never accepted; only NavKey category.
 */

export interface RawInput {
  type: CaptureEventType;
  atMs: number; // wall-clock ms (injected)
  app?: string | null;
  windowTitle?: string | null;
  navKey?: NavKey | null;
  monitorId?: number | null;
}

export interface MachineEvent {
  type: CaptureEventType;
  atMs: number;
  elapsedMs: number; // active elapsed (excludes paused)
  sincePrevMs: number;
  app: string | null;
  windowTitle: string | null;
  navKey: NavKey | null;
  monitorId: number | null;
  shouldScreenshot: boolean;
}

export class SessionMachine {
  private _state: SessionState = 'created';
  private startedAtMs: number | null = null;
  private pausedTotalMs = 0;
  private pauseStartedMs: number | null = null;
  private lastEventAtMs: number | null = null;
  private lastAppKey: string | null = null;
  private _screenshotCount = 0;

  constructor(private readonly config: CaptureConfig) {}

  get state(): SessionState { return this._state; }
  get screenshotCount(): number { return this._screenshotCount; }

  /** Active elapsed time at wall-clock `atMs`, excluding paused intervals. */
  elapsedMs(atMs: number): number {
    if (this.startedAtMs == null) return 0;
    let paused = this.pausedTotalMs;
    if (this.pauseStartedMs != null) paused += atMs - this.pauseStartedMs;
    return Math.max(0, atMs - this.startedAtMs - paused);
  }

  start(atMs: number): MachineEvent {
    if (this._state !== 'created' && this._state !== 'recovered') {
      throw new Error(`cannot start from state ${this._state}`);
    }
    this._state = 'running';
    this.startedAtMs = atMs;
    this.lastEventAtMs = atMs;
    return this.emit({ type: 'session_start', atMs }, false);
  }

  pause(atMs: number): MachineEvent {
    if (this._state !== 'running') throw new Error(`cannot pause from state ${this._state}`);
    this._state = 'paused';
    this.pauseStartedMs = atMs;
    return this.emit({ type: 'session_pause', atMs }, false);
  }

  resume(atMs: number): MachineEvent {
    if (this._state !== 'paused') throw new Error(`cannot resume from state ${this._state}`);
    if (this.pauseStartedMs != null) {
      this.pausedTotalMs += atMs - this.pauseStartedMs;
      this.pauseStartedMs = null;
    }
    this._state = 'running';
    return this.emit({ type: 'session_resume', atMs }, false);
  }

  stop(atMs: number): MachineEvent {
    if (this._state === 'stopped') throw new Error('already stopped');
    if (this._state === 'paused' && this.pauseStartedMs != null) {
      this.pausedTotalMs += atMs - this.pauseStartedMs;
      this.pauseStartedMs = null;
    }
    this._state = 'stopped';
    return this.emit({ type: 'session_stop', atMs }, false);
  }

  /**
   * Feed an input event. While paused, ALL capture is suppressed (returns null).
   * Raw characters are never part of RawInput by construction — only a NavKey
   * category may be present, and only for nav_key events.
   */
  input(raw: RawInput): MachineEvent | null {
    if (this._state !== 'running') return null;
    // Privacy invariant: navKey may only accompany a nav_key event.
    const navKey = raw.type === 'nav_key' ? (raw.navKey ?? null) : null;
    const shouldShot = this.shouldScreenshot(raw);
    return this.emit({ ...raw, navKey }, shouldShot);
  }

  /** Decide whether an input event triggers a screenshot, per config. */
  shouldScreenshot(raw: RawInput): boolean {
    const app = raw.app ?? null;
    if (app && this.isExcludedApp(app)) return false;
    switch (raw.type) {
      case 'mouse_click': return this.config.captureOnClick;
      case 'nav_key': return this.config.captureOnNavKey;
      case 'key_activity': return false; // key activity alone never shoots
      case 'app_change': return this.config.captureOnAppChange;
      case 'window_change': return this.config.captureOnWindowChange;
      case 'screen_transition': return true;
      case 'manual': return true;
      case 'timed': return this.config.timedIntervalMs != null;
      default: return false;
    }
  }

  isExcludedApp(app: string): boolean {
    const lower = app.toLowerCase();
    if (this.config.excludedApps.some((e) => lower.includes(e.toLowerCase()))) return true;
    if (this.config.includedApps.length > 0) {
      return !this.config.includedApps.some((i) => lower.includes(i.toLowerCase()));
    }
    return false;
  }

  private emit(raw: RawInput & { navKey?: NavKey | null }, shouldScreenshot: boolean): MachineEvent {
    const elapsed = this.elapsedMs(raw.atMs);
    const sincePrev = this.lastEventAtMs == null ? 0 : Math.max(0, raw.atMs - this.lastEventAtMs);
    this.lastEventAtMs = raw.atMs;
    if (shouldScreenshot) this._screenshotCount++;
    const app = raw.app ?? null;
    if (raw.type === 'app_change') this.lastAppKey = app;
    return {
      type: raw.type,
      atMs: raw.atMs,
      elapsedMs: elapsed,
      sincePrevMs: sincePrev,
      app,
      // Window titles are withheld unless the operator authorized capturing them.
      windowTitle: this.config.captureWindowTitles ? (raw.windowTitle ?? null) : null,
      navKey: raw.navKey ?? null,
      monitorId: raw.monitorId ?? this.config.monitorId,
      shouldScreenshot,
    };
  }

  /** Rebuild machine state after a crash from the last persisted snapshot. */
  static recover(config: CaptureConfig, snapshot: {
    startedAtMs: number | null; pausedTotalMs: number; screenshotCount: number; lastEventAtMs: number | null;
  }): SessionMachine {
    const m = new SessionMachine(config);
    m._state = 'recovered';
    m.startedAtMs = snapshot.startedAtMs;
    m.pausedTotalMs = snapshot.pausedTotalMs;
    m._screenshotCount = snapshot.screenshotCount;
    m.lastEventAtMs = snapshot.lastEventAtMs;
    return m;
  }
}

/** Zero-padded display number: 1 → "001". */
export function displayNumber(n: number): string {
  return String(n).padStart(3, '0');
}
