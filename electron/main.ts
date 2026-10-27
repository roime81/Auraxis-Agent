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

// AURAXIS_FORCE_PRODUCTION=1 lets an unpackaged build load the local dist/
// renderer (used by the Playwright smoke test and local production preview).
const isDev = !app.isPackaged && process.env.AURAXIS_FORCE_PRODUCTION !== '1';

const headlessMode =
  process.argv.includes('--run') ||
  process.argv.includes('--sdk') ||
  process.argv.includes('--acp') ||
  process.env.AURAXIS_SDK === '1' ||
  process.env.AURAXIS_ACP === '1';

if (process.env.AURAXIS_USER_DATA_DIR) {
  app.setPath('userData', process.env.AURAXIS_USER_DATA_DIR);
}

if (headlessMode) {
  const realUserData = app.getPath('userData');
  process.env.AURAXIS_USER_DATA_DIR ||= realUserData;
  process.env.AURAXIS_CHAT_LOG_DIR ||= path.join(realUserData, 'chat-logs');
  process.env.AURAXIS_SESSION_LOG_DIR ||= path.join(realUserData, 'session-logs');
  process.env.AURAXIS_SESSION_CACHE_DIR ||= path.join(realUserData, 'session-cache');
  process.env.AURAXIS_FTS_DIR ||= path.join(realUserData, 'fts');
  process.env.AURAXIS_FEEDBACK_DIR ||= path.join(realUserData, 'feedback');
  process.env.AURAXIS_SNAPSHOT_DIR ||= path.join(realUserData, 'agent-snapshots');
  process.env.AURAXIS_HOOKS_DIR ||= path.join(realUserData, 'hooks');
  process.env.AURAXIS_HEADLESS = '1';
  const cliUserData = mkdtempSync(path.join(os.tmpdir(), 'auraxis-cli-'));
  process.env.AURAXIS_CLI_USER_DATA = cliUserData;
  app.setPath('userData', cliUserData);
}

if (!headlessMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  }
}

const CSP_HEADER = isDev
  ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: http:",
      `connect-src 'self' ${buildConnectSrc(true)}`,
      "font-src 'self' data: https://fonts.gstatic.com",
      `frame-src ${buildFrameSrc()}`,
      `child-src ${buildFrameSrc()}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  : [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: http:",
      `connect-src 'self' ${buildConnectSrc(false)}`,
      "font-src 'self' data: https://fonts.gstatic.com",
      `frame-src ${buildFrameSrc()}`,
      `child-src ${buildFrameSrc()}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');

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

  const blockUntrustedNavigation = (event: Electron.Event, url: string) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url);
      } catch {
        // invalid URL, deny
      }
    }
  };

  mainWindow.webContents.on('will-navigate', blockUntrustedNavigation);
  mainWindow.webContents.on('will-redirect', blockUntrustedNavigation);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    const url = (event as any)?.sender?.getURL?.() ?? '';
    if (url && !/^https?:\/\//i.test(url)) {
      event.preventDefault();
      return;
    }
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

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if (mainWindow) {
    mainWindow.webContents.send('app:error', { message: err.message, stack: err.stack });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  if (mainWindow) {
    mainWindow.webContents.send('app:error', { message: String(reason), stack: '' });
  }
});

process.env.AURAXIS_PACKAGED = app.isPackaged ? '1' : '';
app.setName('Auraxis');
setTrustedRendererUrl(pathToFileURL(path.join(__dirname, '../dist/index.html')).href);

async function migrateLegacyUserData(): Promise<void> {
  if (headlessMode || process.env.AURAXIS_USER_DATA_DIR || !process.env.LOCALAPPDATA) return;
  try {
    const currentUserData = app.getPath('userData');
    const legacyUserData = path.join(process.env.LOCALAPPDATA, 'auraxis', 'Cache', 'auraxis');
    if (legacyUserData === currentUserData || !existsSync(legacyUserData)) return;
    const files = [
      'auraxis-auth.json',
      'auraxis-settings.json',
      'auraxis-global-state.json',
      'auraxis-memory.db',
      'auraxis-memory.db-shm',
      'auraxis-memory.db-wal',
      '.env',
      'plugin-state.json',
    ];
    const dirs = [
      'agent-snapshots',
      'agent-workspaces',
      'chat-logs',
      'session-logs',
      'session-cache',
      'fts',
      'feedback',
      'hooks',
      'skills',
      'spill',
    ];
    for (const name of files) {
      const legacyPath = path.join(legacyUserData, name);
      const currentPath = path.join(currentUserData, name);
      if (existsSync(legacyPath) && !existsSync(currentPath)) {
        await copyFile(legacyPath, currentPath);
      }
    }
    for (const name of dirs) {
      const legacyPath = path.join(legacyUserData, name);
      const currentPath = path.join(currentUserData, name);
      if (existsSync(legacyPath) && !existsSync(currentPath)) {
        await cp(legacyPath, currentPath, { recursive: true });
      }
    }
  } catch {
    // migration is best-effort
  }
}

async function restoreUndoHistory(): Promise<void> {
  try {
    const bootSettings = await (await import('./ipc/settings-store')).readSettings();
    if (typeof bootSettings?.projectPath === 'string' && bootSettings.projectPath) {
      const { undoManager } = await import('./ipc/undo-manager');
      await undoManager.init(bootSettings.projectPath);
    }
  } catch {
    // non-critical
  }
}

async function handlePluginCli(cli: CliArgs): Promise<boolean> {
  const requested = cli.pluginList || cli.pluginScanDir !== undefined || cli.pluginEnable || cli.pluginDisable;
  if (!requested) return false;
  const { readSettings } = await import('./ipc/settings-store');
  const s = await readSettings();
  const catalog = Array.isArray(s.pluginCatalog)
    ? (s.pluginCatalog as { id: string; name: string; version?: string; enabled: boolean }[])
    : [];
  if (cli.pluginScanDir !== undefined) {
    const { scanPluginDir } = await import('./plugin-cli');
    const manifests = await scanPluginDir(cli.pluginScanDir || path.join(app.getPath('userData'), 'plugins'));
    for (const m of manifests) {
      console.log(`${m.id}\t${m.name}${m.version ? ` v${m.version}` : ''}\t${m.path}`);
    }
    if (manifests.length === 0) console.log('（未发现插件清单）');
  } else if (cli.pluginEnable || cli.pluginDisable) {
    const { setPluginEnabled } = await import('./plugin-cli');
    const id = cli.pluginEnable || cli.pluginDisable!;
    const enabled = !!cli.pluginEnable;
    const r = await setPluginEnabled(id, enabled);
    if (!r.ok) {
      console.error(r.error || '插件状态更新失败');
      app.exit(1);
    } else {
      console.log(`已${enabled ? '启用' : '禁用'}插件 ${id}（enabled: ${r.enabledIds.join(', ') || '无'}）`);
    }
  } else {
    for (const p of catalog) {
      console.log(`${p.id}\t${p.name}${p.version ? ` v${p.version}` : ''}\t${p.enabled ? 'enabled' : 'disabled'}`);
    }
    if (catalog.length === 0) console.log('（暂无插件记录 — 先运行桌面应用以同步插件目录）');
  }
  app.exit(0);
  return true;
}

async function resolveHeadlessProjectRoot(projectRoot?: string): Promise<string> {
  if (projectRoot) return projectRoot;
  try {
    const s = await (await import('./ipc/settings-store')).readSettings();
    return typeof s?.projectPath === 'string' ? s.projectPath : '';
  } catch {
    return '';
  }
}

async function startSdkMode(): Promise<void> {
  try {
    const { runSubAgent } = await import('./ipc/agent-handlers');
    const { startSdkTcpServer } = await import('./sdk-server');
    const { port, token } = await startSdkTcpServer({
      runAgent: async ({ prompt, description, subagentType, projectRoot }) =>
        runSubAgent({
          description: description || 'SDK 任务',
          prompt,
          subagentType: subagentType || 'general-purpose',
          projectRoot: await resolveHeadlessProjectRoot(projectRoot),
          requestId: `sdk-${Date.now()}`,
          autoApprove: process.env.AURAXIS_PACKAGED !== '1' && process.env.AURAXIS_SDK_AUTOAPPROVE === '1',
        }),
      searchSessions: (query, limit) => sessionQuerySearch(query, limit),
    });
    process.stdout.write(`AURAXIS_SDK_PORT=${port}\n`);
    process.stdout.write(`AURAXIS_SDK_TOKEN=${token}\n`);
  } catch (e: unknown) {
    process.stderr.write(`[sdk] failed: ${errorText(e)}\n`);
    app.exit(1);
  }
}

async function startAcpMode(): Promise<void> {
  const { startAcpServer } = await import('./acp-server');
  const { runSubAgent } = await import('./ipc/agent-handlers');
  startAcpServer({
    onShutdown: () => app.exit(0),
    runAgent: async ({ prompt, projectRoot, promptType, signal }) =>
      runSubAgent({
        description: 'ACP 任务',
        prompt,
        subagentType: promptType === 'plan' ? 'Plan' : 'general-purpose',
        projectRoot: await resolveHeadlessProjectRoot(projectRoot),
        requestId: `acp-${Date.now()}`,
        autoApprove: process.env.AURAXIS_PACKAGED !== '1' && process.env.AURAXIS_ACP_AUTOAPPROVE === '1',
        parentSignal: signal,
      }),
  });
}

async function runDesktopMaintenance(): Promise<void> {
  try {
    const { runLogRetention } = await import('./log-retention');
    const { pruneChatCache } = await import('./chat-log');
    const { pruneAgentCache } = await import('./session-log');
    const { rebuildFts } = await import('./fts');
    const userData = process.env.AURAXIS_USER_DATA_DIR || app.getPath('userData');
    void runLogRetention({
      dirs: [path.join(userData, 'chat-logs'), path.join(userData, 'session-logs')],
    }).catch(() => {});
    void Promise.all([pruneChatCache(), pruneAgentCache()]).catch(() => {});
    void rebuildFts().catch(() => {});
  } catch {
    // maintenance is best-effort
  }
}

app.whenReady().then(async () => {
  await migrateLegacyUserData();
  await seedAuthorizedProjectRoots();
  registerIpcHandlers();
  initUpdater();

  await restoreUndoHistory();

  const { parseCliArgs, cliUsage } = await import('./cli-args');
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.help) {
    console.log(cliUsage());
    app.exit(0);
    return;
  }
  if (await handlePluginCli(cli)) return;

  const sdkRequested = cli.sdk || process.env.AURAXIS_SDK === '1';
  const acpRequested = cli.acp || process.env.AURAXIS_ACP === '1';
  if (sdkRequested) {
    await startSdkMode();
  } else if (acpRequested) {
    await startAcpMode();
  } else if (cli.run) {
    const { cliRunTask } = await import('./headless-run');
    await cliRunTask(cli, cli.run);
  } else {
    await runDesktopMaintenance();
    createWindow(isWindows11());
  }

  secureHandle('window:focus', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (
      BrowserWindow.getAllWindows().length === 0 &&
      !(process.argv.includes('--sdk') || process.env.AURAXIS_SDK === '1')
    ) {
      createWindow(false);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
