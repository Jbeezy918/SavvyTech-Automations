import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CaptureService, type CaptureStore } from '@main/capture/captureService';
import { NullInputBackend, type ScreenBackend } from '@main/capture/backends';
import type { AuditSession, CaptureConfig, CaptureEvent, Screenshot } from '@shared/types';

/** In-memory store that records writes and simulates transactions. */
class FakeStore implements CaptureStore {
  events: CaptureEvent[] = [];
  screenshots: Screenshot[] = [];
  sessionState = 'created';
  screenshotCount = 0;
  txDepth = 0;
  committed = 0;
  tx<T>(fn: () => T): T { this.txDepth++; const r = fn(); this.txDepth--; this.committed++; return r; }
  insertEvent(e: CaptureEvent) { if (this.txDepth === 0) throw new Error('event written outside tx'); this.events.push(e); }
  insertScreenshot(s: Screenshot) { if (this.txDepth === 0) throw new Error('shot written outside tx'); this.screenshots.push(s); }
  updateSessionState(_id: string, state: string, patch: Partial<AuditSession>) {
    this.sessionState = state;
    if (patch.screenshotCount != null) this.screenshotCount = patch.screenshotCount;
  }
  nextScreenshotNumber() { return this.screenshots.length + 1; }
  maxSequence() { return this.events.length; }
}

class FakeScreen implements ScreenBackend {
  captured = 0;
  async capture(_monitor: number, outPath: string) {
    this.captured++;
    // Write a tiny deterministic "PNG" so hashing/reads work.
    await fs.writeFile(outPath, Buffer.from(`PNGDATA-${path.basename(outPath)}`));
  }
  async listMonitors() { return [{ id: 1, label: 'Primary' }]; }
}

const config: CaptureConfig = {
  monitorId: 1, includedApps: [], excludedApps: ['1Password'], excludedUrlPatterns: [],
  timedIntervalMs: null, captureOnClick: true, captureOnAppChange: true, captureOnWindowChange: true,
  captureOnNavKey: true, captureWindowTitles: true,
  redaction: { autoMaskPasswordFields: true, autoDetect: [], autoApplyMask: false },
  duplicateSimilarityThreshold: 0.9,
};

const session: AuditSession = {
  id: 'ses_test', clientId: 'cl', departmentId: 'dp', processId: 'pr', sopVersionId: null,
  participantLabel: 'Participant A', auditorUserId: 'u', state: 'created', config,
  startedAt: null, stoppedAt: null, pausedMs: 0, screenshotCount: 0, createdAt: new Date(0).toISOString(),
};

let dir: string;
let store: FakeStore;
let screen: FakeScreen;
let input: NullInputBackend;
let svc: CaptureService;
let t = 0;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sopsync-'));
  store = new FakeStore();
  screen = new FakeScreen();
  input = new NullInputBackend();
  t = 0;
  svc = new CaptureService(session, {
    store, screen, input, sampler: null, evidenceDir: dir, clock: () => (t += 1000),
  });
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('CaptureService evidence pipeline', () => {
  it('captures a screenshot on a click, numbered sequentially with a hash', async () => {
    await svc.start();
    input.emit({ type: 'mouse_click', app: 'Chrome' });
    input.emit({ type: 'mouse_click', app: 'Chrome' });
    await svc.stop();

    expect(store.screenshots).toHaveLength(2);
    expect(store.screenshots.map((s) => s.number)).toEqual([1, 2]);
    expect(store.screenshots[0]!.originalSha256).toMatch(/^[0-9a-f]{64}$/);
    // Files exist on disk with zero-padded names.
    await expect(fs.access(path.join(dir, '001.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, '002.png'))).resolves.toBeUndefined();
  });

  it('never records raw characters; nav keys keep only the category', async () => {
    await svc.start();
    input.emit({ type: 'nav_key', app: 'Chrome', navKey: 'tab' });
    input.emit({ type: 'key_activity', app: 'Chrome' }); // typing — no screenshot, no chars
    await svc.stop();
    const navEvent = store.events.find((e) => e.type === 'nav_key')!;
    expect(navEvent.navKey).toBe('tab');
    // key_activity never triggers a screenshot
    const keyEvent = store.events.find((e) => e.type === 'key_activity')!;
    expect(keyEvent.screenshotId).toBeNull();
    // No event object contains a character field of any kind.
    for (const e of store.events) expect(Object.keys(e)).not.toContain('char');
  });

  it('suppresses capture on excluded apps and while paused', async () => {
    await svc.start();
    input.emit({ type: 'mouse_click', app: '1Password' }); // excluded
    svc.pause();
    input.emit({ type: 'mouse_click', app: 'Chrome' });     // paused
    svc.resume();
    input.emit({ type: 'mouse_click', app: 'Chrome' });     // captured
    await svc.stop();
    expect(store.screenshots).toHaveLength(1);
  });

  it('writes every event inside a transaction (crash-safe)', async () => {
    await svc.start();
    input.emit({ type: 'mouse_click', app: 'Chrome' });
    await svc.stop();
    // All events were committed via tx(); none written outside a transaction
    // (FakeStore throws if txDepth === 0 on insert).
    expect(store.committed).toBeGreaterThan(0);
    expect(store.events.length).toBeGreaterThan(0);
  });

  it('original files are never overwritten across captures', async () => {
    await svc.start();
    input.emit({ type: 'mouse_click', app: 'Chrome' });
    await svc.idle(); // drain the serialized capture queue before inspecting
    const firstPath = store.screenshots[0]!.originalPath;
    const firstBytes = await fs.readFile(firstPath);
    input.emit({ type: 'mouse_click', app: 'Chrome' });
    await svc.stop();
    const stillFirst = await fs.readFile(firstPath);
    expect(stillFirst.equals(firstBytes)).toBe(true);
    expect(store.screenshots[1]!.originalPath).not.toBe(firstPath);
  });
});
