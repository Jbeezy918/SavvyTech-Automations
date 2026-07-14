import React, { useEffect, useState, useCallback } from 'react';
import type { AppStatus, CreateSessionInput } from '@shared/ipc';
import type { Client, Process, Screenshot, CaptureConfig } from '@shared/types';
import { OnboardingWizard } from './views/OnboardingWizard';
import { CaptureView } from './views/CaptureView';
import { ReviewBoard } from './views/ReviewBoard';
import { SystemHealthView } from './views/SystemHealthView';
import { Sidebar, type Section } from './components/Sidebar';
import { RecordingIndicator } from './components/RecordingIndicator';

/**
 * SOPsync dashboard shell. Loads app status; if setup has not been completed it
 * shows the guided first-run wizard (spec section 22). Otherwise it renders the
 * dashboard with a persistent privacy/recording banner.
 */
export function App(): JSX.Element {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [section, setSection] = useState<Section>('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const refreshStatus = useCallback(async () => {
    const s = await window.sopsync.status();
    setStatus(s);
    setCapturing(s.captureState === 'running');
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    if (status?.initialized) void window.sopsync.listClients().then(setClients);
  }, [status?.initialized]);

  if (!status) return <div className="loading">Loading SOPsync…</div>;

  if (!status.initialized) {
    return <OnboardingWizard onDone={() => void refreshStatus()} />;
  }

  return (
    <div className="app">
      <Sidebar section={section} onSelect={setSection} capturing={capturing} />
      <main className="content">
        <RecordingIndicator capturing={capturing} keychainAvailable={status.keychainAvailable} />
        {section === 'dashboard' && <Dashboard clients={clients} />}
        {section === 'capture' && (
          <CaptureView
            clients={clients}
            onSessionActive={(id, isCapturing) => { setActiveSessionId(id); setCapturing(isCapturing); void refreshStatus(); }}
          />
        )}
        {section === 'review' && <ReviewBoard sessionId={activeSessionId} />}
        {section === 'health' && <SystemHealthView />}
        {section === 'about' && <About version={status.version} />}
      </main>
    </div>
  );
}

function Dashboard({ clients }: { clients: Client[] }): JSX.Element {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [clientId, setClientId] = useState<string>('');

  useEffect(() => {
    if (clients[0]) setClientId(clients[0].id);
  }, [clients]);
  useEffect(() => {
    if (clientId) void window.sopsync.listProcesses(clientId).then(setProcesses);
  }, [clientId]);

  return (
    <section>
      <h1>Dashboard</h1>
      <label className="field">
        Client
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <table className="grid">
        <thead>
          <tr>
            <th>Process</th><th>Assigned SOP</th><th>Last audit</th><th>Compliance</th>
            <th>Avg time</th><th>Executions</th><th>Open deviations</th><th>Training</th>
          </tr>
        </thead>
        <tbody>
          {processes.length === 0 && <tr><td colSpan={8} className="muted">No processes yet. Create one after importing a SOP.</td></tr>}
          {processes.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.assignedSopId ? 'Assigned' : '—'}</td>
              <td>{p.lastAuditDate ? new Date(p.lastAuditDate).toLocaleDateString() : '—'}</td>
              <td>{p.complianceScore != null ? `${p.complianceScore}%` : '—'}</td>
              <td>{p.averageCompletionMs != null ? `${Math.round(p.averageCompletionMs / 1000)}s` : '—'}</td>
              <td>{p.observedExecutions}</td>
              <td>{p.unresolvedDeviations}</td>
              <td>{p.trainingStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function About({ version }: { version: string }): JSX.Element {
  return (
    <section>
      <h1>About SOPsync</h1>
      <p>Version {version} · SavvyTech Automations</p>
      <p className="muted">Approved process capture, workflow audit, and training. Not surveillance:
        capture requires authorization, shows a visible recording indicator, and never stores
        keystroke characters, passwords, or clipboard contents.</p>
    </section>
  );
}
