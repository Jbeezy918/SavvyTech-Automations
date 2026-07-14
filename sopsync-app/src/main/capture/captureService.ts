import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuditSession, CaptureEvent, Screenshot } from '@shared/types';
import { newId, nowIso } from '@shared/id';
import { sha256 } from '../security/crypto';
import { SessionMachine, type MachineEvent } from './sessionMachine';
import type { ScreenBackend, InputBackend, InputSignal } from './backends';
import { dHash, similarity, type GrayscaleSampler } from '../analysis/duplicates';
import { logger } from '../logging/logger';

/**
 * Orchestrates a live capture session: turns raw input signals into persisted,
 * evidence-integral events and screenshots. Every screenshot original is written
 * once and hashed; the DB row references that immutable file. Event + screenshot
 * writes are wrapped in a single transaction by the caller-provided `tx`.
 */

export interface CaptureStore {
  tx<T>(fn: () => T): T;
  insertEvent(e: CaptureEvent): void;
  insertScreenshot(s: Screenshot): void;
  updateSessionState(id: string, state: string, patch: Partial<AuditSession>): void;
  nextScreenshotNumber(sessionId: string): number;
  maxSequence(sessionId: string): number;
}

export interface CaptureServiceDeps {
  store: CaptureStore;
  screen: ScreenBackend;
  input: InputBackend;
  sampler: GrayscaleSampler | null; // null → skip perceptual hashing (still stores original)
  evidenceDir: string; // per-session directory for original PNGs
  clock?: () => number;
}

export class CaptureService {
  private machine: SessionMachine;
  private seq: number;
  private lastKeptHash: string | null = null;
  private running = false;
  private readonly clock: () => number;
  /**
   * All state-changing work (input signals, pause/resume/stop) is serialized
   * through this promise chain. This preserves the exact chronological order of
   * events relative to control actions and guarantees no input is lost to a race
   * even under rapid clicks (spec section 5: "Preserve the original sequence").
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly session: AuditSession, private readonly deps: CaptureServiceDeps) {
    this.machine = new SessionMachine(session.config);
    this.seq = deps.store.maxSequence(session.id);
    this.clock = deps.clock ?? (() => Date.now());
  }

  get state() { return this.machine.state; }
  get isCaptureActive() { return this.running && this.machine.state === 'running'; }

  private enqueue(work: () => void | Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch((err) => {
      logger.error('capture', 'A capture operation failed but the session continues.', err);
    });
    return this.queue;
  }

  /** Await all queued work — used before stopping and by tests. */
  idle(): Promise<void> {
    return this.queue;
  }

  async start(): Promise<void> {
    await fs.mkdir(this.deps.evidenceDir, { recursive: true });
    await this.enqueue(() => {
      const ev = this.machine.start(this.clock());
      this.persistEvent(ev, null);
      this.deps.store.updateSessionState(this.session.id, 'running', { startedAt: nowIso() });
      this.running = true;
    });
    this.deps.input.start((s) => void this.enqueue(() => this.onSignal(s)));
    logger.info('capture', `Capture session ${this.session.id} started for "${this.session.participantLabel}".`);
  }

  pause(): Promise<void> {
    logger.info('capture', 'Capture paused.');
    return this.enqueue(() => {
      const ev = this.machine.pause(this.clock());
      this.persistEvent(ev, null);
      this.deps.store.updateSessionState(this.session.id, 'paused', {});
    });
  }

  resume(): Promise<void> {
    logger.info('capture', 'Capture resumed.');
    return this.enqueue(() => {
      const ev = this.machine.resume(this.clock());
      this.persistEvent(ev, null);
      this.deps.store.updateSessionState(this.session.id, 'running', {});
    });
  }

  async stop(): Promise<void> {
    this.deps.input.stop(); // no new signals accepted
    await this.enqueue(() => {
      const ev = this.machine.stop(this.clock());
      this.persistEvent(ev, null);
      this.deps.store.updateSessionState(this.session.id, 'stopped', { stoppedAt: nowIso() });
      this.running = false;
    });
    logger.info('capture', `Capture session ${this.session.id} stopped. ${this.machine.screenshotCount} screenshots captured.`);
  }

  /** Manual capture button. */
  manualCapture(): Promise<void> {
    return this.enqueue(() => this.onSignal({ type: 'app_change', app: null } as InputSignal, 'manual'));
  }

  private async onSignal(signal: InputSignal, forceType?: 'manual'): Promise<void> {
    const type = forceType ?? signal.type;
    const ev = this.machine.input({
      type: type as MachineEvent['type'],
      atMs: this.clock(),
      app: signal.app ?? null,
      windowTitle: signal.windowTitle ?? null,
      navKey: signal.navKey ?? null,
    });
    if (!ev) return; // suppressed (paused / excluded)

    let screenshot: Screenshot | null = null;
    if (ev.shouldScreenshot) {
      try {
        screenshot = await this.captureScreenshot(ev);
      } catch (err) {
        logger.error('capture', 'Screenshot capture failed; event still recorded.', err);
      }
    }
    this.persistEvent(ev, screenshot);
  }

  private async captureScreenshot(ev: MachineEvent): Promise<Screenshot> {
    const number = this.deps.store.nextScreenshotNumber(this.session.id);
    const fileName = `${String(number).padStart(3, '0')}.png`;
    const outPath = path.join(this.deps.evidenceDir, fileName);
    await this.deps.screen.capture(ev.monitorId ?? this.session.config.monitorId, outPath);

    const bytes = await fs.readFile(outPath);
    const hash = sha256(bytes);

    let phash: string | null = null;
    let dupSim: number | null = null;
    if (this.deps.sampler) {
      try {
        const sample = await this.deps.sampler.sample(outPath, 9); // 9x9 → 8x8 dHash bits
        phash = dHash(sample);
        dupSim = this.lastKeptHash ? similarity(this.lastKeptHash, phash) : 0;
        this.lastKeptHash = phash;
      } catch (err) {
        logger.warn('capture', 'Perceptual hashing failed; screenshot stored without dedup score.', err);
      }
    }

    return {
      id: newId('shot'),
      sessionId: this.session.id,
      number,
      timestamp: nowIso(),
      elapsedMs: ev.elapsedMs,
      sincePrevMs: ev.sincePrevMs,
      triggerType: ev.type,
      activeApp: ev.app,
      windowTitle: ev.windowTitle,
      monitorId: ev.monitorId,
      screenState: 'unknown',
      originalPath: outPath,
      originalSha256: hash,
      perceptualHash: phash,
      duplicateSimilarity: dupSim,
      clusterId: null,
      redactionStatus: 'none',
      detectedSensitive: [],
      derived: [],
      hidden: false,
      workflowStepId: null,
      auditorNote: null,
    };
  }

  /** Transaction-safe append of an event (and its screenshot, if any). */
  private persistEvent(ev: MachineEvent, screenshot: Screenshot | null): void {
    this.seq += 1;
    const event: CaptureEvent = {
      id: newId('evt'),
      sessionId: this.session.id,
      sequence: this.seq,
      type: ev.type,
      timestamp: nowIso(),
      elapsedMs: ev.elapsedMs,
      sincePrevMs: ev.sincePrevMs,
      activeApp: ev.app,
      windowTitle: ev.windowTitle,
      monitorId: ev.monitorId,
      navKey: ev.navKey,
      screenshotId: screenshot?.id ?? null,
    };
    this.deps.store.tx(() => {
      if (screenshot) this.deps.store.insertScreenshot(screenshot);
      this.deps.store.insertEvent(event);
      this.deps.store.updateSessionState(this.session.id, this.machine.state, {
        screenshotCount: this.machine.screenshotCount,
      });
    });
  }
}
