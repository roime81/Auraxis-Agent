import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StateCreator } from 'zustand';
import type {
  AppStore,
  DesktopLayoutState,
  LeftPanelTab,
  ThemeMode,
} from '../types/chat';
import { pushSessionVisit } from './sessionHistoryNav';
import type { WorkAutonomyTier } from '../types/advanced';

const MAX_FILE_TABS = 8;
/** 左右分栏时面板至少要能放下两栏正文（每栏约 320px）。 */
const RIGHT_PANEL_SPLIT_WIDTH = 640;

const EMPTY_DESKTOP_LAYOUT: DesktopLayoutState = {
  orb: {
    enabled: true,
    visible: true,
    alwaysOnTop: true,
    pinned: true,
    minimized: false,
    width: 260,
    height: 180,
    x: 24,
    y: 120,
    lastActivatedAt: null,
  },
  window: {
    width: 1200,
    height: 800,
    x: 120,
    y: 80,
    maximized: false,
    minimized: false,
    closeAction: 'minimize',
  },
  page: {
    url: null,
    title: null,
    source: null,
    visible: false,
    lastOpenedAt: null,
  },
};

type StoreSet = Parameters<StateCreator<AppStore, [], []>>[0];
type StoreGet = Parameters<StateCreator<AppStore, [], []>>[1];
/** 除初始状态字段之外的 action 集合。 */
type AppActions = Omit<AppStore, keyof typeof APP_STORE_INITIAL_STATE>;

const APP_STORE_INITIAL_STATE: Pick<
  AppStore,
  | 'theme'
  | 'sidebarCollapsed'
  | 'sidebarMode'
  | 'workAutonomyTier'
  | 'showSettings'
  | 'showRightPanel'
  | 'sidebarWidth'
  | 'leftPanelWidth'
  | 'rightPanelWidth'
  | 'paneSizes'
  | 'activeLeftPanel'
  | 'glassLayoutMounted'
  | 'activeToolView'
  | 'settingsInitialKey'
  | 'globalSearchOpen'
  | 'terminalHeight'
  | 'agentLogFocusRequest'
  | 'trajectoryFocusRequest'
  | 'lastAgentShellId'
  | 'agentErrorsOnly'
  | 'agentTextOnly'
  | 'agentRunningOnly'
  | 'agentRunningFollow'
  | 'openAgentTurns'
  | 'agentTurnCount'
  | 'agentRawLogRequest'
  | 'agentErrorNavRequest'
  | 'openFileRequest'
  | 'browserOpenRequest'
  | 'rightPanelUnseen'
  | 'fileTabs'
  | 'activeFilePath'
  | 'fileTreeVersion'
  | 'tabs'
  | 'activeTabId'
  | 'rightPanelView'
  | 'rightPanelFullscreen'
  | 'rightPanelSplit'
  | 'rightPanelView2'
  | 'sessionHistory'
  | 'sessionHistoryIndex'
  | 'desktopLayout'
> = {
  theme: 'light',
  sidebarCollapsed: false,
  sidebarMode: 'chat' as const,
  workAutonomyTier: 'smart' as WorkAutonomyTier,
  showSettings: false,
  showRightPanel: false,
  sidebarWidth: 260,
  leftPanelWidth: 256,
  rightPanelWidth: 320,
  paneSizes: null,
  activeLeftPanel: 'files' as LeftPanelTab,
  glassLayoutMounted: false,
  activeToolView: 'none' as const,
  settingsInitialKey: 'general',
  globalSearchOpen: false,
  terminalHeight: 300,
  agentLogFocusRequest: null,
  trajectoryFocusRequest: null,
  lastAgentShellId: null,
  agentErrorsOnly: false,
  agentTextOnly: false,
  agentRunningOnly: false,
  agentRunningFollow: true,
  openAgentTurns: [],
  agentTurnCount: 0,
  agentRawLogRequest: 0,
  agentErrorNavRequest: null,
  openFileRequest: null,
  browserOpenRequest: null,
  rightPanelUnseen: false,
  fileTabs: [],
  activeFilePath: null,
  fileTreeVersion: 0,
  tabs: [],
  activeTabId: null,
  rightPanelView: 'menu' as const,
  rightPanelFullscreen: false,
  rightPanelSplit: false,
  rightPanelView2: 'menu' as const,
  sessionHistory: [],
  sessionHistoryIndex: -1,
  desktopLayout: EMPTY_DESKTOP_LAYOUT,
};

/** 主题 / 面板 / 侧栏 / Agent 视图等通用 action。 */
function createGeneralActions(set: StoreSet, _get: StoreGet): AppActions {
  const actions: Partial<AppStore> = {
    toggleTheme: () =>
      set((s) => ({
        theme: s.theme === 'system' ? 'light' : s.theme === 'dark' ? 'light' : 'dark',
      })),

    setTheme: (mode: ThemeMode) => set({ theme: mode }),

    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

    setSidebarMode: (mode) => {
      set({ sidebarMode: mode });
    },

    setWorkAutonomyTier: (tier) => set({ workAutonomyTier: tier }),

    toggleRightPanel: () =>
      set((s) => ({ showRightPanel: !s.showRightPanel, rightPanelFullscreen: false, rightPanelUnseen: false })),

    setShowSettings: (show: boolean) => set({ showSettings: show }),

    setActiveToolView: (view) => set({ activeToolView: view }),

    setGlassLayoutMounted: (v) => set({ glassLayoutMounted: !!v }),

    openToolView: (view) =>
      set((s) => ({
        activeToolView: s.activeToolView === view ? 'none' : view,
      })),

    setSettingsInitialKey: (key) => set({ settingsInitialKey: key }),

    setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

    setTerminalHeight: (h) => set({ terminalHeight: Math.min(560, Math.max(160, Math.round(h))) }),

    requestAgentLogFocus: (agentId, toolCallId) =>
      set({ agentLogFocusRequest: { agentId, toolCallId, ts: Date.now() } }),

    clearAgentLogFocus: () => set({ agentLogFocusRequest: null }),

    requestTrajectoryFocus: (agentId, toolCallId) =>
      set({ trajectoryFocusRequest: { agentId, toolCallId, ts: Date.now() } }),

    clearTrajectoryFocus: () => set({ trajectoryFocusRequest: null }),

    setLastAgentShellId: (id) => set({ lastAgentShellId: id }),

    setAgentErrorsOnly: (v) => set({ agentErrorsOnly: v }),

    setAgentTextOnly: (v) => set({ agentTextOnly: v }),

    setAgentRunningOnly: (v) => set({ agentRunningOnly: v }),

    setAgentRunningFollow: (v) => set({ agentRunningFollow: v }),

    setOpenAgentTurns: (turns) => set({ openAgentTurns: Array.isArray(turns) ? turns : [] }),

    toggleAllAgentTurns: () =>
      set((s) => {
        const current = Array.isArray(s.openAgentTurns) ? s.openAgentTurns : [];
        return {
          openAgentTurns:
            current.length >= s.agentTurnCount && s.agentTurnCount > 0
              ? []
              : Array.from({ length: s.agentTurnCount }, (_, i) => i),
        };
      }),

    setAgentTurnCount: (n) => set({ agentTurnCount: n }),

    requestAgentRawLog: () => set({ agentRawLogRequest: Date.now() }),

    requestAgentErrorNav: (dir) => set({ agentErrorNavRequest: { ts: Date.now(), dir } }),

    clearAgentErrorNav: () => set({ agentErrorNavRequest: null }),

    setSidebarWidth: (w: number) => set({ sidebarWidth: Math.max(0, Math.min(420, w)) }),

    setLeftPanelWidth: (w: number) => set({ leftPanelWidth: Math.max(200, Math.min(420, w)) }),

    setRightPanelWidth: (w: number) => set({ rightPanelWidth: Math.max(320, Math.min(2400, w)) }),

    setPaneSizes: (sizes: number[]) => set({ paneSizes: sizes }),

    setActiveLeftPanel: (tab: LeftPanelTab) => set({ activeLeftPanel: tab }),

    incrementFileTreeVersion: () => set((s) => ({ fileTreeVersion: s.fileTreeVersion + 1 })),

    requestOpenFile: (path, target = 'file-tree') => set({ openFileRequest: { path, requestId: Date.now(), target } }),

    clearOpenFileRequest: () => set({ openFileRequest: null }),

    setBrowserOpenRequest: (req) => set({ browserOpenRequest: req }),

    clearBrowserOpenRequest: () => set({ browserOpenRequest: null }),

    markRightPanelUnseen: () => set({ rightPanelUnseen: true }),

    setDesktopLayout: (patch) =>
      set((state) => ({
        desktopLayout: {
          orb: { ...state.desktopLayout.orb, ...patch.orb },
          window: { ...state.desktopLayout.window, ...patch.window },
          page: { ...state.desktopLayout.page, ...patch.page },
        },
      })),

    setOrbState: (patch) =>
      set((state) => ({
        desktopLayout: { ...state.desktopLayout, orb: { ...state.desktopLayout.orb, ...patch } },
      })),

    setMainWindowState: (patch) =>
      set((state) => ({
        desktopLayout: { ...state.desktopLayout, window: { ...state.desktopLayout.window, ...patch } },
      })),

    setPageTargetState: (patch) =>
      set((state) => ({
        desktopLayout: { ...state.desktopLayout, page: { ...state.desktopLayout.page, ...patch } },
      })),

    setCloseAction: (action) =>
      set((state) => ({
        desktopLayout: {
          ...state.desktopLayout,
          window: { ...state.desktopLayout.window, closeAction: action },
        },
      })),

    openDesktopPage: (url, title, source = 'user') =>
      set((state) => ({
        desktopLayout: {
          ...state.desktopLayout,
          page: {
            url,
            title,
            source,
            visible: true,
            lastOpenedAt: Date.now(),
          },
        },
      })),

    hideDesktopPage: () =>
      set((state) => ({
        desktopLayout: {
          ...state.desktopLayout,
          page: { ...state.desktopLayout.page, visible: false },
        },
      })),

    openFileTab: (path) =>
      set((s) => {
        if (s.fileTabs.some((t) => t.path === path)) {
          return { activeFilePath: path };
        }
        const name = path.split(/[/\\]/).pop() || path;
        let tabs = s.fileTabs;
        if (tabs.length >= MAX_FILE_TABS) {
          const evictIdx = tabs[0].path === s.activeFilePath && tabs.length > 1 ? 1 : 0;
          tabs = tabs.filter((_, i) => i !== evictIdx);
        }
        return { fileTabs: [...tabs, { path, name }], activeFilePath: path };
      }),

    closeFileTab: (path) =>
      set((s) => {
        const idx = s.fileTabs.findIndex((t) => t.path === path);
        if (idx < 0) return s;
        const tabs = s.fileTabs.filter((t) => t.path !== path);
        let active = s.activeFilePath;
        if (active === path) {
          const next = tabs[idx] ?? tabs[idx - 1];
          active = next ? next.path : null;
        }
        return { fileTabs: tabs, activeFilePath: active };
      }),

    setActiveFilePath: (path) => set({ activeFilePath: path }),

    clearFileTabs: () => set({ fileTabs: [], activeFilePath: null }),
  };
  return actions as AppActions;
}

/** 文件标签页与主区标签 action（标签历史已移除：主区固定单标签，历史改为会话维度）。 */
function createTabActions(set: StoreSet): AppActions {
  const actions: Partial<AppStore> = {
    addTab: (tab) => {
      const id = Math.random().toString(36).slice(2, 11);
      set((s) => ({ tabs: [...s.tabs, { ...tab, id }], activeTabId: id }));
      return id;
    },

    closeTab: (tabId: string) => {
      set((s) => {
        const newTabs = s.tabs.filter((t) => t.id !== tabId);
        const newActive = s.activeTabId === tabId ? (newTabs[newTabs.length - 1]?.id ?? null) : s.activeTabId;
        return { tabs: newTabs, activeTabId: newActive };
      });
    },

    setActiveTab: (tabId: string) => {
      set((s) => {
        const exists = s.tabs.some((t) => t.id === tabId);
        if (!exists) return s;
        return { activeTabId: tabId };
      });
    },

    updateTab: (tabId: string, updates) => {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
      }));
    },

    closeAllTabs: () => {
      set({ tabs: [], activeTabId: null, sessionHistory: [], sessionHistoryIndex: -1 });
    },

    setRightPanelView: (view) => {
      set({ rightPanelView: view });
    },

    toggleRightPanelFullscreen: () => {
      set((s) => ({ rightPanelFullscreen: !s.rightPanelFullscreen }));
    },

    toggleRightPanelSplit: () => {
      set((s) => {
        const split = !s.rightPanelSplit;
        return {
          rightPanelSplit: split,
          rightPanelWidth: split ? Math.max(s.rightPanelWidth, RIGHT_PANEL_SPLIT_WIDTH) : s.rightPanelWidth,
        };
      });
    },

    setRightPanelView2: (view) => {
      set({ rightPanelView2: view });
    },

    openRightPanelInNewPane: (view) => {
      set((s) => ({
        rightPanelView2: view,
        rightPanelSplit: true,
        rightPanelWidth: Math.max(s.rightPanelWidth, RIGHT_PANEL_SPLIT_WIDTH),
      }));
    },

    recordSessionVisit: (id) =>
      set((s) => {
        const next = pushSessionVisit(s.sessionHistory, s.sessionHistoryIndex, id);
        return { sessionHistory: next.history, sessionHistoryIndex: next.index };
      }),

    setSessionHistoryIndex: (index) => set({ sessionHistoryIndex: index }),
  };
  return actions as AppActions;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...APP_STORE_INITIAL_STATE,
      ...createGeneralActions(set, get),
      ...createTabActions(set),
    }),
    {
      name: 'auraxis-app-storage',
      version: 4,
      migrate: (persisted) => persisted,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarMode: state.sidebarMode,
        theme: state.theme,
        sidebarWidth: state.sidebarWidth,
        leftPanelWidth: state.leftPanelWidth,
        rightPanelWidth: state.rightPanelWidth,
        activeLeftPanel: state.activeLeftPanel,
        rightPanelView: state.rightPanelView,
        terminalHeight: state.terminalHeight,
        agentErrorsOnly: state.agentErrorsOnly,
        agentTextOnly: state.agentTextOnly,
        agentRunningOnly: state.agentRunningOnly,
        agentRunningFollow: state.agentRunningFollow,
        desktopLayout: state.desktopLayout,
      }),
    },
  ),
);

