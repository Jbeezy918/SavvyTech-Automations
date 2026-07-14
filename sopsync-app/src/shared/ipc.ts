import type {
  AuditSession, Screenshot, Finding, Process, Client, SystemLog, CaptureConfig,
} from './types';
import type { RawFinding } from '../main/analysis/comparison';

/** IPC channel names shared by preload and main. */
export const CHANNELS = {
  appStatus: 'app:status',
  setupFirstRun: 'setup:firstRun',
  listClients: 'client:list',
  createClient: 'client:create',
  listProcesses: 'process:list',
  createSession: 'session:create',
  captureStart: 'capture:start',
  capturePause: 'capture:pause',
  captureResume: 'capture:resume',
  captureStop: 'capture:stop',
  captureManual: 'capture:manual',
  captureStatus: 'capture:status',
  listScreenshots: 'screenshot:list',
  redactScreenshot: 'screenshot:redact',
  runAnalysis: 'analysis:run',
  generateReport: 'report:generate',
  systemHealth: 'system:health',
  recentLogs: 'system:logs',
  backupNow: 'system:backup',
} as const;

export interface AppStatus {
  initialized: boolean;
  version: string;
  keychainAvailable: boolean;
  dbIntegrityOk: boolean;
  activeSessionId: string | null;
  captureState: string | null;
}

export interface FirstRunInput {
  organizationName: string;
  adminName: string;
  adminEmail: string;
  storageDir: string | null;
  aiProvider: 'none' | 'local' | 'openai' | 'anthropic';
  voiceEnabled: boolean;
  firstClientName: string;
}

export interface CreateSessionInput {
  clientId: string;
  departmentId: string;
  processId: string;
  participantLabel: string;
  sopVersionId: string | null;
  config: CaptureConfig;
}

export interface AnalysisResult {
  clusters: number;
  proposedSteps: number;
  findings: RawFinding[];
  complianceScore: number | null;
  totalMs: number;
  recommendations: number;
}

export interface SystemHealth {
  dbIntegrityOk: boolean;
  keychainAvailable: boolean;
  diskFreeBytes: number | null;
  activeSessionId: string | null;
  watchdogRunning: boolean;
  lastBackup: string | null;
}

/** The surface exposed on window.sopsync by the preload bridge. */
export interface SopsyncApi {
  status(): Promise<AppStatus>;
  setupFirstRun(input: FirstRunInput): Promise<{ ok: boolean; clientId: string }>;
  listClients(): Promise<Client[]>;
  listProcesses(clientId: string): Promise<Process[]>;
  createSession(input: CreateSessionInput): Promise<AuditSession>;
  captureStart(sessionId: string): Promise<void>;
  capturePause(): Promise<void>;
  captureResume(): Promise<void>;
  captureStop(): Promise<void>;
  captureManual(): Promise<void>;
  listScreenshots(sessionId: string): Promise<Screenshot[]>;
  runAnalysis(sessionId: string): Promise<AnalysisResult>;
  generateReport(sessionId: string, format: 'json' | 'html' | 'csv'): Promise<{ path: string }>;
  systemHealth(): Promise<SystemHealth>;
  recentLogs(): Promise<SystemLog[]>;
  backupNow(): Promise<{ path: string }>;
}
