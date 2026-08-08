import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } from 'electron';
import path from 'node:path';
import { AppContext } from './app/context';
import { registerIpc } from './ipc';
import { logger } from './logging/logger';
import type { RoleName } from '@shared/types';

/**
 * SOPsync main process. Owns the app lifecycle, the dashboard window, the
 * always-visible menu-bar status icon (spec section 3), and global crash
 * handling. The window loads the Vite-built renderer in production or the dev
 * server in development.
 */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let ctx: AppContext | null = null;

// Single operator role for the MVP (system administrator after first-run).
let operatorRole: RoleName = 'system_administrator';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'SOPsync',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.SOPSYNC_DEV_SERVER;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray(): void {
  // A simple template image; replaced by a real asset in build/.
  const icon = nativeImage.createFromNamedImage?.('NSStatusAvailable', [0, 0, 0]) ?? nativeImage.createEmpty();
  tray = new Tray(icon);
  const refresh = () => {
    const capturing = ctx?.activeCapture?.isCaptureActive ?? false;
    tray?.setToolTip(capturing ? 'SOPsync — ● Recording' : 'SOPsync — idle');
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: capturing ? '● Recording in progress' : 'Idle', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => { if (!mainWindow) createWindow(); else mainWindow.show(); } },
      { label: 'Pause Capture', enabled: capturing, click: () => void ctx?.activeCapture?.pause() },
      { label: 'Resume Capture', enabled: (ctx?.activeCapture?.state === 'paused'), click: () => void ctx?.activeCapture?.resume() },
      { type: 'separator' },
      { label: 'Quit SOPsync', click: () => app.quit() },
    ]));
  };
  refresh();
  setInterval(refresh, 2000);
}

app.whenReady().then(async () => {
  try {
    ctx = await AppContext.boot();
    registerIpc(ctx, () => operatorRole);
    ipcMain.handle('operator:setRole', (_e, role: RoleName) => { operatorRole = role; });

    // Populate real monitor list for capture config.
    ipcMain.handle('system:monitors', () =>
      screen.getAllDisplays().map((d, i) => ({ id: i + 1, label: d.label || `Display ${i + 1}`, primary: d.id === screen.getPrimaryDisplay().id })));

    createWindow();
    createTray();
    logger.info('boot', 'SOPsync started.');
  } catch (err) {
    logger.error('boot', 'SOPsync failed to start.', err);
    throw err;
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar during an active capture; otherwise quit on macOS convention.
  if (ctx?.activeCapture?.isCaptureActive) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (ctx) {
    e.preventDefault();
    await ctx.shutdown();
    ctx = null;
    app.quit();
  }
});

process.on('uncaughtException', (err) => logger.error('uncaught', 'Uncaught exception — capture data is preserved on disk.', err));
process.on('unhandledRejection', (err) => logger.error('unhandled', 'Unhandled promise rejection.', err));
