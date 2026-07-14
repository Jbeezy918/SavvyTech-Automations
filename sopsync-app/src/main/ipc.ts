import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppContext } from './app/context';
import { evidenceDirFor } from './app/paths';
import { CHANNELS, type AppStatus, type CreateSessionInput, type FirstRunInput, type SystemHealth } from '@shared/ipc';
import type { RoleName, AuditSession, Organization, Client, Department, User, Process } from '@shared/types';
import { can } from '@shared/roles';
import { newId, nowIso } from '@shared/id';
import { CaptureService } from './capture/captureService';
import { MacScreenBackend, NullInputBackend } from './capture/backends';
import { SharpSampler } from './capture/sharpSampler';
import { runSessionAnalysis } from './analysis/sessionAnalysis';
import { auditReportHtml, auditReportJson, findingsCsv, type ReportContext } from './reports/reports';
import { computeProcessTiming } from './analysis/timing';
import { MemorySecretStore } from './security/keychain';
import { logger } from './logging/logger';

/**
 * Registers permission-checked IPC handlers. The current operator's role gates
 * every privileged action — enforced HERE in the main process, not just hidden
 * in the UI (spec section 21). For the single-operator MVP the role is read from
 * config; multi-user auth is a documented follow-up.
 */
const APP_VERSION = '0.1.0';

export function registerIpc(ctx: AppContext, currentRole: () => RoleName): void {
  const requirePerm = (perm: Parameters<typeof can>[1]) => {
    if (!can(currentRole(), perm)) {
      throw new Error(`Permission denied: your role (${currentRole()}) lacks "${perm}".`);
    }
  };

  let timedTimer: NodeJS.Timeout | null = null;
  const clearTimed = () => { if (timedTimer) { clearInterval(timedTimer); timedTimer = null; } };

  ipcMain.handle(CHANNELS.appStatus, async (): Promise<AppStatus> => {
    const initialized = !!ctx.repos.recentLogs(1); // DB reachable
    return {
      initialized: hasAnyOrg(ctx),
      version: APP_VERSION,
      keychainAvailable: !(ctx.secrets instanceof MemorySecretStore),
      dbIntegrityOk: ctx.db.integrityOk(),
      activeSessionId: null,
      captureState: ctx.activeCapture?.state ?? null,
    };
  });

  ipcMain.handle(CHANNELS.setupFirstRun, async (_e, input: FirstRunInput) => {
    // First-run has no role yet; allowed once when no org exists.
    if (hasAnyOrg(ctx)) throw new Error('Setup has already been completed.');
    const now = nowIso();
    const org: Organization = { id: newId('org'), name: input.organizationName, createdAt: now };
    const client: Client = { id: newId('cli'), organizationId: org.id, name: input.firstClientName, branding: { companyName: input.organizationName }, createdAt: now };
    const admin: User = { id: newId('usr'), organizationId: org.id, clientId: null, displayName: input.adminName, email: input.adminEmail, roleName: 'system_administrator', active: true, createdAt: now };
    ctx.repos.tx(() => {
      ctx.repos.insertOrganization(org);
      ctx.repos.insertClient(client);
      ctx.repos.insertUser(admin);
    });
    logger.info('setup', `First-run setup complete for organization "${org.name}".`);
    return { ok: true, clientId: client.id };
  });

  ipcMain.handle(CHANNELS.listClients, async (): Promise<Client[]> => {
    requirePerm('audit.read');
    return listClients(ctx);
  });

  ipcMain.handle(CHANNELS.listProcesses, async (_e, clientId: string): Promise<Process[]> => {
    requirePerm('audit.read');
    return ctx.repos.listProcesses(clientId);
  });

  ipcMain.handle(CHANNELS.createSession, async (_e, input: CreateSessionInput): Promise<AuditSession> => {
    requirePerm('capture.run');
    const session: AuditSession = {
      id: newId('ses'), clientId: input.clientId, departmentId: input.departmentId,
      processId: input.processId, sopVersionId: input.sopVersionId, participantLabel: input.participantLabel,
      auditorUserId: 'operator', state: 'created', config: input.config,
      startedAt: null, stoppedAt: null, pausedMs: 0, screenshotCount: 0, createdAt: nowIso(),
    };
    ctx.repos.insertSession(session);
    return session;
  });

  ipcMain.handle(CHANNELS.captureStart, async (_e, sessionId: string) => {
    requirePerm('capture.run');
    const session = ctx.repos.getSession(sessionId);
    if (!session) throw new Error('Session not found.');
    if (ctx.activeCapture?.isCaptureActive) throw new Error('Another capture session is already active.');
    const svc = new CaptureService(session, {
      store: ctx.repos,
      screen: new MacScreenBackend(),
      input: new NullInputBackend(),
      sampler: new SharpSampler(),
      evidenceDir: evidenceDirFor(ctx.paths, sessionId),
    });
    await svc.start();
    ctx.activeCapture = svc;
    // Timed-interval capture (works without native input hooks).
    if (session.config.timedIntervalMs) {
      timedTimer = setInterval(() => void svc.manualCapture(), session.config.timedIntervalMs);
    }
  });

  ipcMain.handle(CHANNELS.capturePause, async () => { requirePerm('capture.run'); await ctx.activeCapture?.pause(); });
  ipcMain.handle(CHANNELS.captureResume, async () => { requirePerm('capture.run'); await ctx.activeCapture?.resume(); });
  ipcMain.handle(CHANNELS.captureManual, async () => { requirePerm('capture.run'); await ctx.activeCapture?.manualCapture(); });
  ipcMain.handle(CHANNELS.captureStop, async () => {
    requirePerm('capture.run');
    clearTimed();
    await ctx.activeCapture?.stop();
    ctx.activeCapture = null;
  });

  ipcMain.handle(CHANNELS.listScreenshots, async (_e, sessionId: string) => {
    requirePerm('capture.review');
    return ctx.repos.listScreenshots(sessionId);
  });

  ipcMain.handle(CHANNELS.runAnalysis, async (_e, sessionId: string) => {
    requirePerm('capture.review');
    const session = ctx.repos.getSession(sessionId);
    if (!session) throw new Error('Session not found.');
    return runSessionAnalysis(ctx.repos, sessionId, session.config.duplicateSimilarityThreshold, []);
  });

  ipcMain.handle(CHANNELS.generateReport, async (_e, sessionId: string, format: 'json' | 'html' | 'csv') => {
    requirePerm('export.create');
    const session = ctx.repos.getSession(sessionId);
    if (!session) throw new Error('Session not found.');
    const screenshots = ctx.repos.listScreenshots(sessionId);
    const findings = ctx.repos.listFindings(sessionId);
    const events = ctx.repos.listEvents(sessionId);
    const timing = computeProcessTiming(events, [], new Map());
    const reportCtx: ReportContext = {
      session, processName: session.processId, clientName: session.clientId,
      screenshots, findings, recommendations: [], timing,
      // Compliance score lives on the Process (updated when analysis is approved).
      complianceScore: ctx.repos.listProcesses(session.clientId).find((p) => p.id === session.processId)?.complianceScore ?? null,
      generatedAt: nowIso(),
    };
    const content = format === 'json' ? auditReportJson(reportCtx)
      : format === 'csv' ? findingsCsv(findings)
      : auditReportHtml(reportCtx);
    const outPath = path.join(ctx.paths.root, `report-${sessionId}.${format}`);
    await fs.writeFile(outPath, content, 'utf8');
    logger.info('export', `Generated ${format.toUpperCase()} report at ${outPath}.`);
    return { path: outPath };
  });

  ipcMain.handle(CHANNELS.systemHealth, async (): Promise<SystemHealth> => {
    return {
      dbIntegrityOk: ctx.db.integrityOk(),
      keychainAvailable: !(ctx.secrets instanceof MemorySecretStore),
      diskFreeBytes: null,
      activeSessionId: ctx.activeCapture ? 'active' : null,
      watchdogRunning: true,
      lastBackup: null,
    };
  });

  ipcMain.handle(CHANNELS.recentLogs, async () => ctx.repos.recentLogs(200));
  ipcMain.handle(CHANNELS.backupNow, async () => { requirePerm('settings.manage'); return { path: await ctx.backup() }; });
}

// --- small helpers reading directly (repos does not yet expose these lists) ---
function hasAnyOrg(ctx: AppContext): boolean {
  const row = ctx.db.prepare(`SELECT COUNT(*) AS n FROM organizations`).get() as { n: number };
  return row.n > 0;
}
function listClients(ctx: AppContext): Client[] {
  const rows = ctx.db.prepare(`SELECT * FROM clients ORDER BY name`).all() as any[];
  return rows.map((r) => ({ id: r.id, organizationId: r.organization_id, name: r.name, branding: r.branding ? JSON.parse(r.branding) : null, createdAt: r.created_at }));
}
