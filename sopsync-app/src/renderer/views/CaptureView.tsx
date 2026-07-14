import React, { useEffect, useState } from 'react';
import type { Client, Process, CaptureConfig } from '@shared/types';

/**
 * Create and control an authorized capture session (spec section 5). Exposes
 * Start / Pause / Resume / Stop with a visible state, and the privacy-relevant
 * config (excluded apps, window-title authorization, timed interval).
 */
const defaultConfig = (): CaptureConfig => ({
  monitorId: 1, includedApps: [], excludedApps: ['1Password', 'Keychain Access'], excludedUrlPatterns: [],
  timedIntervalMs: 5000, captureOnClick: true, captureOnAppChange: true, captureOnWindowChange: true,
  captureOnNavKey: true, captureWindowTitles: false,
  redaction: { autoMaskPasswordFields: true, autoDetect: ['password', 'ssn', 'card', 'email'], autoApplyMask: false },
  duplicateSimilarityThreshold: 0.9,
});

export function CaptureView({ clients, onSessionActive }: {
  clients: Client[]; onSessionActive: (sessionId: string, capturing: boolean) => void;
}): JSX.Element {
  const [clientId, setClientId] = useState('');
  const [processes, setProcesses] = useState<Process[]>([]);
  const [processId, setProcessId] = useState('');
  const [participant, setParticipant] = useState('');
  const [config, setConfig] = useState<CaptureConfig>(defaultConfig());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'paused' | 'stopped'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (clients[0]) setClientId(clients[0].id); }, [clients]);
  useEffect(() => { if (clientId) void window.sopsync.listProcesses(clientId).then(setProcesses); }, [clientId]);

  const wrap = (fn: () => Promise<void>) => async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const create = wrap(async () => {
    const client = clients.find((c) => c.id === clientId);
    const proc = processes.find((p) => p.id === processId);
    if (!client || !proc) throw new Error('Select a client and process first.');
    const session = await window.sopsync.createSession({
      clientId, departmentId: proc.departmentId, processId, participantLabel: participant || 'Anonymous participant',
      sopVersionId: proc.assignedSopId, config,
    });
    setSessionId(session.id);
    setState('idle');
  });

  const start = wrap(async () => {
    if (!sessionId) throw new Error('Create a session first.');
    await window.sopsync.captureStart(sessionId);
    setState('running');
    onSessionActive(sessionId, true);
  });
  const pause = wrap(async () => { await window.sopsync.capturePause(); setState('paused'); onSessionActive(sessionId!, false); });
  const resume = wrap(async () => { await window.sopsync.captureResume(); setState('running'); onSessionActive(sessionId!, true); });
  const manual = wrap(async () => { await window.sopsync.captureManual(); });
  const stop = wrap(async () => { await window.sopsync.captureStop(); setState('stopped'); onSessionActive(sessionId!, false); });

  return (
    <section>
      <h1>Capture session</h1>
      {!sessionId && (
        <div className="card">
          <label className="field">Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Process
            <select value={processId} onChange={(e) => setProcessId(e.target.value)}>
              <option value="">Select…</option>
              {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Participant (name or anonymous ID)
            <input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="Anonymous participant" />
          </label>
          <label className="field">Excluded applications (comma-separated)
            <input value={config.excludedApps.join(', ')}
              onChange={(e) => setConfig({ ...config, excludedApps: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </label>
          <label className="field checkbox">
            <input type="checkbox" checked={config.captureWindowTitles}
              onChange={(e) => setConfig({ ...config, captureWindowTitles: e.target.checked })} />
            Authorize capturing window titles
          </label>
          <label className="field">Timed capture interval (seconds, 0 = off)
            <input type="number" min={0} value={(config.timedIntervalMs ?? 0) / 1000}
              onChange={(e) => setConfig({ ...config, timedIntervalMs: Number(e.target.value) > 0 ? Number(e.target.value) * 1000 : null })} />
          </label>
          <button className="primary" onClick={create}>Create session</button>
        </div>
      )}

      {sessionId && (
        <div className="card">
          <div className={`capture-state ${state}`}>
            Session <code>{sessionId}</code> — <strong>{state.toUpperCase()}</strong>
          </div>
          <div className="capture-controls">
            <button className="primary" onClick={start} disabled={state === 'running' || state === 'stopped'}>▶ Start</button>
            <button onClick={pause} disabled={state !== 'running'}>⏸ Pause</button>
            <button onClick={resume} disabled={state !== 'paused'}>⏵ Resume</button>
            <button onClick={manual} disabled={state !== 'running'}>◉ Manual capture</button>
            <button className="danger" onClick={stop} disabled={state === 'idle' || state === 'stopped'}>■ Stop</button>
          </div>
          {state === 'stopped' && <p className="muted">Session stopped. Open the Review Board to analyze the captured evidence.</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
