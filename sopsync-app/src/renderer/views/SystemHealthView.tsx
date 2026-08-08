import React, { useEffect, useState } from 'react';
import type { SystemHealth } from '@shared/ipc';
import type { SystemLog } from '@shared/types';

/** System health + diagnostics + plain-language logs (spec sections 4 & 18). */
export function SystemHealthView(): JSX.Element {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);

  const refresh = async () => {
    setHealth(await window.sopsync.systemHealth());
    setLogs(await window.sopsync.recentLogs());
  };
  useEffect(() => { void refresh(); }, []);

  const backup = async () => {
    const { path } = await window.sopsync.backupNow();
    alert(`Backup written to:\n${path}`);
    void refresh();
  };

  return (
    <section>
      <h1>System Health</h1>
      {health && (
        <div className="health-grid">
          <HealthTile label="Database integrity" ok={health.dbIntegrityOk} />
          <HealthTile label="Keychain (secure storage)" ok={health.keychainAvailable} />
          <HealthTile label="Watchdog" ok={health.watchdogRunning} />
          <HealthTile label="Active capture" ok={health.activeSessionId != null} okLabel="Active" badLabel="Idle" neutral />
        </div>
      )}
      <div className="toolbar"><button className="primary" onClick={backup}>Back up database now</button>
        <button onClick={refresh}>Refresh</button></div>

      <h2>Recent activity (plain language)</h2>
      <table className="grid logs">
        <thead><tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className={`log-${l.level}`}>
              <td>{new Date(l.createdAt).toLocaleTimeString()}</td>
              <td>{l.level}</td><td>{l.category}</td><td>{l.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HealthTile({ label, ok, okLabel = 'OK', badLabel = 'Attention', neutral = false }: {
  label: string; ok: boolean; okLabel?: string; badLabel?: string; neutral?: boolean;
}): JSX.Element {
  return (
    <div className={`health-tile ${ok ? 'ok' : neutral ? 'neutral' : 'bad'}`}>
      <div className="health-label">{label}</div>
      <div className="health-value">{ok ? okLabel : badLabel}</div>
    </div>
  );
}
