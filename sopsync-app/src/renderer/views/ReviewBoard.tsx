import React, { useEffect, useState } from 'react';
import type { Screenshot } from '@shared/types';
import type { AnalysisResult } from '@shared/ipc';

/**
 * Screenshot review board (spec section 7). Displays numbered screenshots in
 * chronological order with adjustable thumbnail size, duplicate grouping, and a
 * one-click AI organization pass whose findings require human approval.
 */
export function ReviewBoard({ sessionId }: { sessionId: string | null }): JSX.Element {
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [size, setSize] = useState(160);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!sessionId) return;
    setShots(await window.sopsync.listScreenshots(sessionId));
  };
  useEffect(() => { void load(); }, [sessionId]);

  if (!sessionId) return <section><h1>Review Board</h1><p className="muted">Start and stop a capture session, then return here to review its screenshots.</p></section>;

  const runAnalysis = async () => {
    setBusy(true); setError(null);
    try {
      setAnalysis(await window.sopsync.runAnalysis(sessionId));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const report = async (format: 'json' | 'html' | 'csv') => {
    setError(null);
    try {
      const { path } = await window.sopsync.generateReport(sessionId, format);
      alert(`Report written to:\n${path}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section>
      <h1>Review Board</h1>
      <div className="toolbar">
        <label>Thumbnail size <input type="range" min={80} max={320} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <button className="primary" onClick={runAnalysis} disabled={busy}>{busy ? 'Analyzing…' : '✨ Propose workflow & find deviations'}</button>
        <button onClick={() => report('html')}>Export HTML report</button>
        <button onClick={() => report('json')}>Export JSON</button>
        <button onClick={() => report('csv')}>Export findings CSV</button>
      </div>

      {analysis && (
        <div className="analysis-summary">
          <strong>Analysis:</strong> {analysis.proposedSteps} proposed steps · {analysis.clusters} duplicate clusters ·
          {' '}{analysis.findings.length} findings · {analysis.recommendations} recommendations ·
          total {Math.round(analysis.totalMs / 1000)}s
          {analysis.complianceScore != null && <> · compliance {analysis.complianceScore}%</>}
          <div className="muted">Proposed steps and findings require your approval before they become official.</div>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="board">
        {shots.length === 0 && <p className="muted">No screenshots captured for this session.</p>}
        {shots.map((s) => (
          <figure key={s.id} className={`shot ${s.hidden ? 'hidden' : ''}`} style={{ width: size }}>
            <div className="shot-num">{String(s.number).padStart(3, '0')}</div>
            <div className="shot-thumb" style={{ height: size * 0.62 }}>
              {/* Original file lives on disk under the encrypted app data dir. */}
              <span className="thumb-placeholder">{s.triggerType}</span>
            </div>
            <figcaption>
              <div>{s.activeApp ?? 'app'} · +{Math.round(s.elapsedMs / 1000)}s</div>
              {s.detectedSensitive.length > 0 && <div className="sensitive">⚠ {s.detectedSensitive.join(', ')}</div>}
              {s.duplicateSimilarity != null && s.duplicateSimilarity > 0.9 && <div className="dup">near-duplicate</div>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
