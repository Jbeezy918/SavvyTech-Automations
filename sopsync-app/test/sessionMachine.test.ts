import { describe, it, expect } from 'vitest';
import { SessionMachine, displayNumber } from '@main/capture/sessionMachine';
import type { CaptureConfig } from '@shared/types';

const config = (over: Partial<CaptureConfig> = {}): CaptureConfig => ({
  monitorId: 1, includedApps: [], excludedApps: [], excludedUrlPatterns: [],
  timedIntervalMs: null, captureOnClick: true, captureOnAppChange: true,
  captureOnWindowChange: true, captureOnNavKey: true, captureWindowTitles: false,
  redaction: { autoMaskPasswordFields: true, autoDetect: [], autoApplyMask: false },
  duplicateSimilarityThreshold: 0.9, ...over,
});

describe('capture session state machine', () => {
  it('enforces legal transitions', () => {
    const m = new SessionMachine(config());
    expect(m.state).toBe('created');
    m.start(0);
    expect(m.state).toBe('running');
    expect(() => m.start(1)).toThrow();
    m.pause(1000);
    expect(m.state).toBe('paused');
    expect(() => m.pause(1100)).toThrow();
    m.resume(2000);
    m.stop(3000);
    expect(m.state).toBe('stopped');
    expect(() => m.stop(3100)).toThrow();
  });

  it('excludes paused time from active elapsed', () => {
    const m = new SessionMachine(config());
    m.start(0);
    m.pause(1000);   // 1s active so far
    m.resume(6000);  // paused 5s
    // at t=8000, active should be 8000 - 5000 = 3000
    expect(m.elapsedMs(8000)).toBe(3000);
  });

  it('suppresses all capture while paused', () => {
    const m = new SessionMachine(config());
    m.start(0);
    m.pause(100);
    expect(m.input({ type: 'mouse_click', atMs: 200 })).toBeNull();
  });

  it('never stores navKey except for nav_key events', () => {
    const m = new SessionMachine(config());
    m.start(0);
    const click = m.input({ type: 'mouse_click', atMs: 10, navKey: 'enter' })!;
    expect(click.navKey).toBeNull(); // navKey stripped on non-nav events
    const nav = m.input({ type: 'nav_key', atMs: 20, navKey: 'tab' })!;
    expect(nav.navKey).toBe('tab');
  });

  it('withholds window titles unless authorized', () => {
    const m = new SessionMachine(config({ captureWindowTitles: false }));
    m.start(0);
    const e = m.input({ type: 'window_change', atMs: 5, windowTitle: 'Secret Bank - Login' })!;
    expect(e.windowTitle).toBeNull();

    const m2 = new SessionMachine(config({ captureWindowTitles: true }));
    m2.start(0);
    const e2 = m2.input({ type: 'window_change', atMs: 5, windowTitle: 'Order Form' })!;
    expect(e2.windowTitle).toBe('Order Form');
  });

  it('honors screenshot trigger config and app exclusion', () => {
    const m = new SessionMachine(config({ captureOnClick: false, excludedApps: ['1Password'] }));
    m.start(0);
    expect(m.input({ type: 'mouse_click', atMs: 1 })!.shouldScreenshot).toBe(false);
    expect(m.shouldScreenshot({ type: 'manual', atMs: 2 })).toBe(true);
    expect(m.shouldScreenshot({ type: 'mouse_click', atMs: 3, app: '1Password' })).toBe(false);
  });

  it('recovers state after a simulated crash', () => {
    const m = SessionMachine.recover(config(), {
      startedAtMs: 0, pausedTotalMs: 2000, screenshotCount: 7, lastEventAtMs: 5000,
    });
    expect(m.state).toBe('recovered');
    expect(m.screenshotCount).toBe(7);
    // can resume capturing after recovery
    const e = m.start(6000);
    expect(e.type).toBe('session_start');
    expect(m.state).toBe('running');
  });

  it('formats display numbers zero-padded', () => {
    expect(displayNumber(1)).toBe('001');
    expect(displayNumber(42)).toBe('042');
    expect(displayNumber(123)).toBe('123');
  });
});
