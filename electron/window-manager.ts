import {
  app,
  BrowserWindow,
  screen,
  WebContentsView,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

type SavedWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  companionDisabled: boolean;
};

const DEFAULT_WINDOW_STATE: SavedWindowState = {
  x: 120,
  y: 120,
  width: 1200,
  height: 760,
  maximized: false,
  companionDisabled: false,
};

export class AuraWindowManager {
  private expandedWindow: BrowserWindow | null = null;
  private floatingWindow: BrowserWindow | null = null;
  private pageView: WebContentsView | null = null;
  private statePath: string;
  private state: SavedWindowState = { ...DEFAULT_WINDOW_STATE };
  private isQuitting = false;

  constructor() {
    this.statePath = path.join(app.getPath('userData'), 'aura-window-state.json');
    this.loadState();
  }

  getExpandedWindow(): BrowserWindow | null {
    return this.expandedWindow && !this.expandedWindow.isDestroyed() ? this.expandedWindow : null;
  }

  getFloatingWindow(): BrowserWindow | null {
    return this.floatingWindow && !this.floatingWindow.isDestroyed() ? this.floatingWindow : null;
  }

  private loadState(): void {
    try {
      if (!existsSync(this.statePath)) return;
      const raw = readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SavedWindowState>;
      this.state = { ...DEFAULT_WINDOW_STATE, ...parsed };
    } catch {
      this.state = { ...DEFAULT_WINDOW_STATE };
    }
  }

  private persistState(): void {
    try {
      mkdirSync(path.dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Best effort.
    }
  }

  private ensureDisplayBounds(bounds: Rectangle): Rectangle {
    const displays = screen.getAllDisplays();
    if (displays.length === 0) return bounds;

    const target = displays.find((display) => {
      const { x, y, width, height } = display.workArea;
      return (
        bounds.x >= x &&
        bounds.y >= y &&
        bounds.x + bounds.width <= x + width &&
        bounds.y + bounds.height <= y + height
      );
    });

    const display = target ?? screen.getPrimaryDisplay();
    const work = display.workArea;
    return {
      ...bounds,
      x: Math.max(work.x, Math.min(bounds.x, work.x + work.width - 80)),
      y: Math.max(work.y, Math.min(bounds.y, work.y + work.height - 80)),
      width: Math.min(bounds.width, work.width - 100),
      height: Math.min(bounds.height, work.height - 100),
    };
  }

  private persistExpandedState(): void {
    const win = this.expandedWindow;
    if (!win || win.isDestroyed()) return;

    const bounds = win.getBounds();
    this.state = {
      ...this.state,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
    };
    this.persistState();
  }

  private animateOpacity(win: BrowserWindow | null, visible: boolean): void {
    if (!win || win.isDestroyed()) return;

    const current = win.getOpacity();
    if (visible) {
      win.show();
      win.setOpacity(0.0);
      const start = 0.0;
      let opacity = start;
      const tick = window.setInterval(() => {
        opacity = Math.min(1, opacity + 0.12);
        win.setOpacity(opacity);
        if (opacity >= 1) {
          win.setOpacity(1);
          window.clearInterval(tick);
        }
      }, 16);
      return;
    }

    const start = current <= 0 ? 1 : current;
    let opacity = start;
    const tick = window.setInterval(() => {
      opacity = Math.max(0, opacity - 0.12);
      win.setOpacity(opacity);
      if (opacity <= 0) {
        win.setOpacity(0);
        win.hide();
        window.clearInterval(tick);
      }
    }, 16);
  }

  showCompanionWindow(): void {
    if (this.state.companionDisabled) return;
    const orb = this.ensureFloatingWindow();
    if (!orb || orb.isDestroyed()) return;
    this.animateOpacity(orb, true);
  }

  hideCompanionWindow(): void {
    const orb = this.getFloatingWindow();
    if (!orb || orb.isDestroyed()) return;
    this.animateOpacity(orb, false);
  }

  moveCompanionTo(x: number, y: number): void {
    const orb = this.getFloatingWindow();
    if (!orb || orb.isDestroyed()) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const nextX = Math.max(0, Math.min(x, width - orb.getBounds().width));
    const nextY = Math.max(0, Math.min(y, height - orb.getBounds().height));
    orb.setPosition(nextX, nextY);
  }

  createExpandedWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
    if (this.expandedWindow && !this.expandedWindow.isDestroyed()) return this.expandedWindow;

    const bounds = this.ensureDisplayBounds({
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height,
    });

    const win = new BrowserWindow({
      ...options,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      show: false,
      frame: false,
      backgroundColor: '#0b1020',
      title: 'Blablabla',
      minWidth: 900,
      minHeight: 620,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
      },
    });

    this.expandedWindow = win;

    win.on('closed', () => {
      this.expandedWindow = null;
      this.closeWebPage();
      if (!this.isQuitting && this.floatingWindow && !this.floatingWindow.isDestroyed()) {
        this.floatingWindow.close();
      }
    });

    win.on('close', (event) => {
      if (this.isQuitting) return;
      event.preventDefault();
      this.hideExpandedWindow();
    });

    win.on('resize', () => this.persistExpandedState());
    win.on('move', () => this.persistExpandedState());
    win.on('maximize', () => this.persistExpandedState());
    win.on('unmaximize', () => this.persistExpandedState());

    if (this.state.maximized) win.maximize();
    if (!this.state.companionDisabled) this.ensureFloatingWindow();

    return win;
  }

  ensureFloatingWindow(): BrowserWindow | null {
    if (this.state.companionDisabled) return null;
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) return this.floatingWindow;

    const win = new BrowserWindow({
      width: 160,
      height: 160,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      movable: false,
      skipTaskbar: true,
      show: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(__dirname, '../resources/companion-orb.html'));
    win.on('closed', () => {
      this.floatingWindow = null;
    });

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setPosition(Math.max(24, width - 180), Math.max(24, height - 180));
    win.setOpacity(0.0);
    this.floatingWindow = win;
    return win;
  }

  openExpandedWindow(): BrowserWindow | null {
    const win = this.createExpandedWindow({
      width: this.state.width,
      height: this.state.height,
      backgroundColor: '#0b1020',
    });

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    this.hideCompanionWindow();
    return win;
  }

  hideExpandedWindow(): void {
    const win = this.expandedWindow;
    if (!win || win.isDestroyed()) return;

    win.hide();
    if (!this.state.companionDisabled) {
      this.showCompanionWindow();
    }
    this.persistExpandedState();
  }

  minimizeExpandedWindow(): void {
    this.expandedWindow?.minimize();
  }

  restoreExpandedWindow(): void {
    const win = this.expandedWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    this.hideCompanionWindow();
  }

  disableCompanion(): void {
    this.state.companionDisabled = true;
    this.persistState();
    const orb = this.getFloatingWindow();
    if (orb && !orb.isDestroyed()) {
      this.animateOpacity(orb, false);
      setTimeout(() => orb.close(), 180);
    }
    this.floatingWindow = null;
  }

  setCompanionEnabled(enabled: boolean): void {
    if (enabled) {
      this.state.companionDisabled = false;
      this.showCompanionWindow();
    } else {
      this.disableCompanion();
    }
    this.persistState();
  }

  private injectBackToChat(webContents: Electron.WebContents): void {
    const script = `
      (() => {
        if (window.__auraxisBackToChatInjected) return;
        window.__auraxisBackToChatInjected = true;

        const existing = document.querySelector('#auraxis-back-to-chat');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'auraxis-back-to-chat';
        container.style.position = 'fixed';
        container.style.right = '18px';
        container.style.bottom = '18px';
        container.style.zIndex = '2147483647';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '8px';
        container.style.pointerEvents = 'auto';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Back to Chat';
        button.style.border = '1px solid rgba(255,255,255,0.18)';
        button.style.borderRadius = '999px';
        button.style.background = 'rgba(10,15,26,0.8)';
        button.style.color = '#f4f7ff';
        button.style.padding = '10px 16px';
        button.style.fontSize = '13px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 10px 28px rgba(0,0,0,0.22)';
        button.style.backdropFilter = 'blur(12px)';
        button.addEventListener('click', () => {
          if (window.electronAPI && typeof window.electronAPI.backToChat === 'function') {
            window.electronAPI.backToChat();
          }
        });

        const chip = document.createElement('div');
        chip.textContent = 'Aura';
        chip.style.borderRadius = '999px';
        chip.style.background = 'rgba(127,142,247,0.12)';
        chip.style.border = '1px solid rgba(127,142,247,0.32)';
        chip.style.color = '#dfe6ff';
        chip.style.padding = '7px 10px';
        chip.style.fontSize = '11px';
        chip.style.fontWeight = '700';
        chip.style.letterSpacing = '0.04em';
        chip.style.textTransform = 'uppercase';

        container.appendChild(button);
        container.appendChild(chip);
        document.body.appendChild(container);
      })();
    `;

    webContents.executeJavaScript(script, true).catch(() => {});
  }

  openWebPage(url: string): boolean {
    if (!this.expandedWindow || this.expandedWindow.isDestroyed()) return false;

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    } catch {
      return false;
    }

    if (!this.pageView) {
      this.pageView = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          nativeWindowOpen: false,
        },
      });
    }

    const view = this.pageView;
    const bounds = this.expandedWindow.getContentBounds();
    view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    view.webContents.on('did-finish-load', () => {
      this.injectBackToChat(view.webContents);
    });
    view.webContents.on('did-navigate', () => {
      this.injectBackToChat(view.webContents);
    });

    view.webContents.loadURL(url);
    this.expandedWindow.setContentView(view);
    return true;
  }

  closeWebPage(): void {
    const win = this.expandedWindow;
    if (!win) return;
    win.setContentView(null);
    this.pageView = null;
  }

  backToChat(): void {
    this.closeWebPage();
  }

  quitApplication(): void {
    this.isQuitting = true;
    this.closeWebPage();
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) this.floatingWindow.close();
    if (this.expandedWindow && !this.expandedWindow.isDestroyed()) this.expandedWindow.close();
    app.quit();
  }
}

export const auraWindowManager = new AuraWindowManager();
