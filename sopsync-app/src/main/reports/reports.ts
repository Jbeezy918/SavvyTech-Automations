import type { AuditSession, Finding, Recommendation, Screenshot, BrandingConfig } from '@shared/types';
import type { ProcessTiming } from '../analysis/timing';

/**
 * Report generation (spec section 16). Produces JSON/CSV/HTML deterministically
 * from persisted data. PDF/DOCX/XLSX are generated on macOS by rendering the HTML
 * (documented in KNOWN_LIMITATIONS); JSON/CSV/HTML are fully implemented here and
 * unit-tested. Every figure traces to stored evidence — nothing is invented.
 */

export interface ReportContext {
  session: AuditSession;
  processName: string;
  clientName: string;
  screenshots: Screenshot[];
  findings: Finding[];
  recommendations: Recommendation[];
  timing: ProcessTiming | null;
  complianceScore: number | null;
  branding?: BrandingConfig | null;
  generatedAt: string;
}

const fmtMs = (ms: number | null | undefined): string => {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function auditReportJson(ctx: ReportContext): string {
  return JSON.stringify(
    {
      report: 'audit',
      generatedAt: ctx.generatedAt,
      client: ctx.clientName,
      process: ctx.processName,
      session: {
        id: ctx.session.id,
        participant: ctx.session.participantLabel,
        startedAt: ctx.session.startedAt,
        stoppedAt: ctx.session.stoppedAt,
        screenshotCount: ctx.session.screenshotCount,
      },
      complianceScore: ctx.complianceScore,
      timing: ctx.timing,
      findings: ctx.findings,
      recommendations: ctx.recommendations,
      evidence: ctx.screenshots.map((s) => ({
        number: s.number, sha256: s.originalSha256, trigger: s.triggerType,
        redaction: s.redactionStatus, sensitive: s.detectedSensitive,
      })),
    },
    null, 2,
  );
}

export function findingsCsv(findings: Finding[]): string {
  const header = ['id', 'kind', 'severity', 'evidence_numbers', 'confidence', 'review_status', 'explanation', 'recommended_action'];
  const rows = findings.map((f) => [
    f.id, f.kind, f.severity, `"${f.evidenceScreenshotNumbers.join(' ')}"`,
    String(f.confidence), f.reviewStatus, csvCell(f.explanation), csvCell(f.recommendedAction),
  ].join(','));
  return [header.join(','), ...rows].join('\n');
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export function auditReportHtml(ctx: ReportContext): string {
  const brandName = ctx.branding?.companyName ?? 'SavvyTech Automations';
  const color = ctx.branding?.primaryColor ?? '#0b5cad';
  const findingRows = ctx.findings.map((f) => `
    <tr>
      <td>${esc(f.kind)}</td><td class="sev sev-${esc(f.severity)}">${esc(f.severity)}</td>
      <td>${f.evidenceScreenshotNumbers.map((n) => String(n).padStart(3, '0')).join(', ') || '—'}</td>
      <td>${esc(f.explanation)}</td><td>${(f.confidence * 100).toFixed(0)}%</td>
      <td>${esc(f.recommendedAction)}</td>
    </tr>`).join('');
  const recRows = ctx.recommendations.map((r) => `
    <tr>
      <td>${esc(r.title)}</td><td>${esc(r.problem)}</td>
      <td>${fmtMs(r.currentImpactMs)}</td>
      <td>${r.estimatedTimeSavingsMs != null ? fmtMs(r.estimatedTimeSavingsMs) + ' <em>(est.)</em>' : '—'}</td>
      <td>${esc(r.implementationDifficulty)} / ${esc(r.risk)}</td>
    </tr>`).join('');
  const timingRows = (ctx.timing?.steps ?? []).map((s) => `
    <tr><td>${esc(s.title)}</td><td>${fmtMs(s.durationMs)}</td><td>${fmtMs(s.activeMs)}</td>
    <td>${fmtMs(s.idleMs)}</td><td>${ctx.timing?.bottleneckStepIds.includes(s.stepId) ? '⚠️ bottleneck' : ''}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>SOPsync Audit Report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:40px;line-height:1.5}
  h1,h2{color:${color}} header{border-bottom:3px solid ${color};padding-bottom:12px;margin-bottom:24px}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
  th{background:${color};color:#fff}
  .sev-critical,.sev-high{color:#b00020;font-weight:600}.sev-medium{color:#b26a00}
  .meta{color:#555;font-size:13px}.note{background:#fff8e1;border:1px solid #ffe082;padding:10px;border-radius:6px;font-size:13px}
</style></head><body>
<header>
  <h1>Process Audit Report</h1>
  <div class="meta">${esc(brandName)} &middot; Client: ${esc(ctx.clientName)} &middot; Process: ${esc(ctx.processName)}<br>
  Session ${esc(ctx.session.id)} &middot; Participant: ${esc(ctx.session.participantLabel)} &middot; Generated ${esc(ctx.generatedAt)}</div>
</header>
<h2>Summary</h2>
<ul>
  <li><strong>Compliance score:</strong> ${ctx.complianceScore != null ? ctx.complianceScore + ' / 100' : '—'}</li>
  <li><strong>Total time:</strong> ${fmtMs(ctx.timing?.totalMs)} (active ${fmtMs(ctx.timing?.activeMs)}, idle ${fmtMs(ctx.timing?.idleMs)})</li>
  <li><strong>Screenshots captured:</strong> ${ctx.session.screenshotCount}</li>
  <li><strong>Findings:</strong> ${ctx.findings.length} &middot; <strong>Recommendations:</strong> ${ctx.recommendations.length}</li>
</ul>
<p class="note">All savings figures are <strong>estimates</strong> derived from measured time and observed evidence. They require human validation before use in business decisions.</p>
<h2>Timing by step</h2>
<table><thead><tr><th>Step</th><th>Duration</th><th>Active</th><th>Idle</th><th>Flag</th></tr></thead><tbody>${timingRows || '<tr><td colspan=5>No timing data.</td></tr>'}</tbody></table>
<h2>Findings</h2>
<table><thead><tr><th>Type</th><th>Severity</th><th>Evidence</th><th>Explanation</th><th>Confidence</th><th>Recommended action</th></tr></thead><tbody>${findingRows || '<tr><td colspan=6>No deviations found.</td></tr>'}</tbody></table>
<h2>Recommendations</h2>
<table><thead><tr><th>Recommendation</th><th>Problem</th><th>Current impact</th><th>Est. savings</th><th>Difficulty / Risk</th></tr></thead><tbody>${recRows || '<tr><td colspan=5>No recommendations.</td></tr>'}</tbody></table>
</body></html>`;
}
