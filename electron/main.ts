import { app, BrowserWindow, shell, session } from 'electron';
import { auraWindowManager } from './window-manager';
import { isTrustedRendererUrl, secureHandle, setTrustedRendererUrl } from './ipc/trust';
import path from 'path';
import os from 'os';
import { existsSync, mkdtempSync } from 'fs';
import { copyFile, cp } from 'fs/promises';
import { pathToFileURL } from 'url';
import { registerIpcHandlers, isWindows11, markAcrylicWindowReady } from './ipc';
import { initUpdater } from './updater';
import { cleanupWindowStreams } from './ipc/ai-handlers';
import { setMainWindowRef, clearMainWindowRef } from './ipc/window-ref';
import { sessionQuerySearch } from './fts';
import { seedAuthorizedProjectRoots } from './ipc/project-access';
import { buildConnectSrc, buildFrameSrc } from './network-policy';
import { applyWindows11RoundedCorners } from './window-corners';
import { errorText } from './errors';
import type { CliArgs } from './cli-args';

let mainWindow: BrowserWindow | null = null;

function createWindow(useAcrylic = false) {
  const win = auraWindowManager.createExpandedWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    title: 'Blablabla',
    ...(useAcrylic
      ? {
          transparent: true,
          backgroundColor: '#00000000',
          backgroundMaterial: 'acrylic' as const,
          show: false,
        }
      : {
          transparent: true,
          backgroundColor: '#00000000',
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
    ...(process.platform === 'darwin' && { titleBarStyle: 'hidden' as const }),
  });

  mainWindow = win;
  setMainWindowRef(mainWindow);

  if (isWindows11()) applyWindows11RoundedCorners(mainWindow);

  if (useAcrylic) {
    markAcrylicWindowReady();
    const showTimer = setTimeout(() => mainWindow?.show(), 5000);
    mainWindow.once('ready-to-show', () => {
      clearTimeout(showTimer);
      mainWindow?.show();
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      // invalid URL
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    clearMainWindowRef();
    cleanupWindowStreams();
  });
}
