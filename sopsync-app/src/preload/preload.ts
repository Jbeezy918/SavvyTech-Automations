import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type SopsyncApi } from '../shared/ipc';

/**
 * Secure preload bridge. The renderer has NO direct Node/Electron access
 * (contextIsolation on, nodeIntegration off); it can only call the explicit,
 * typed methods below, each of which round-trips to a permission-checked main
 * handler. This is the security boundary required by spec sections 2 & 19.
 */
const api: SopsyncApi = {
  status: () => ipcRenderer.invoke(CHANNELS.appStatus),
  setupFirstRun: (input) => ipcRenderer.invoke(CHANNELS.setupFirstRun, input),
  listClients: () => ipcRenderer.invoke(CHANNELS.listClients),
  listProcesses: (clientId) => ipcRenderer.invoke(CHANNELS.listProcesses, clientId),
  createSession: (input) => ipcRenderer.invoke(CHANNELS.createSession, input),
  captureStart: (sessionId) => ipcRenderer.invoke(CHANNELS.captureStart, sessionId),
  capturePause: () => ipcRenderer.invoke(CHANNELS.capturePause),
  captureResume: () => ipcRenderer.invoke(CHANNELS.captureResume),
  captureStop: () => ipcRenderer.invoke(CHANNELS.captureStop),
  captureManual: () => ipcRenderer.invoke(CHANNELS.captureManual),
  listScreenshots: (sessionId) => ipcRenderer.invoke(CHANNELS.listScreenshots, sessionId),
  runAnalysis: (sessionId) => ipcRenderer.invoke(CHANNELS.runAnalysis, sessionId),
  generateReport: (sessionId, format) => ipcRenderer.invoke(CHANNELS.generateReport, sessionId, format),
  systemHealth: () => ipcRenderer.invoke(CHANNELS.systemHealth),
  recentLogs: () => ipcRenderer.invoke(CHANNELS.recentLogs),
  backupNow: () => ipcRenderer.invoke(CHANNELS.backupNow),
};

contextBridge.exposeInMainWorld('sopsync', api);
