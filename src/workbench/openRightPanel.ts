/**
 * openRightPanel.ts — 打开右栏视图的**唯一入口**。
 *
 * 此前这条逻辑在本仓库有三份互不相同的实现，语义还各差一点：
 *   · `src/hooks/useAppShortcuts.ts` 的私有 helper（带 chat 守卫，无视分栏）；
 *   · `src/components/layout/CommandPaletteItems.tsx` 里两处裸写的
 *     "setRightPanelView + toggleRightPanel"（先切 code 模式，无守卫、无路由）；
 *   · `src/components/layout/WorkbenchLayout.tsx` 的 openFileRequest effect
 *     （按请求自带的 target 选面板，同样无视分栏）。
 *
 * 三份都要各自记得加 chat 守卫、各自决定"放哪一栏"，于是**分栏开着时任何一次
 * 跳转都会顶掉第一栏** —— 而 Windsurf 一类产品的面板是"双栏一等公民"
 * （其 Cascade 文档把 side-by-side panes 与 tabs 并列为一等能力）。
 *
 * 收敛后只有一条规则：**不夺走用户正在看的那一栏**。
 */
import type { RightPanelTab } from '../types/chat';
import type { WorkbenchPanelKey } from './workbench-panels';
import { useAppStore } from '../stores/useAppStore';

/** 路由决策只依赖这几个字段（抽出来便于单测，不需要真 store）。 */
export interface RightPanelRouteState {
  rightPanelView: RightPanelTab;
  rightPanelView2: RightPanelTab;
  rightPanelSplit: boolean;
}

/**
 * 该把视图放到哪一栏：`1` / `2`，或 `null` 表示"某一栏已经在显示它"，不必动作。
 *
 * 规则优先级：
 *   1. 任一栏已经显示该视图 → 不动（重复按同一条快捷键不该有副作用）；
 *   2. 分栏开着且**第一栏不是清单态** → 用第二栏（第一栏在忙，别顶掉）；
 *   3. 其余情况用第一栏（含：分栏开着但第一栏停在清单态 —— 清单不是"正在看的东西"）。
 */
export function resolveTargetPane(state: RightPanelRouteState, view: WorkbenchPanelKey): 1 | 2 | null {
  if (state.rightPanelView === view) return null;
  if (state.rightPanelSplit) {
    if (state.rightPanelView2 === view) return null;
    if (state.rightPanelView !== 'menu') return 2;
  }
  return 1;
}

/**
 * 打开右栏的某个视图。
 *
 * @param view      要显示的视图（不含 `'menu'` / `'none'`：它们是面板自身状态，不是功能）
 * @param activate  面板关着时是否顺带打开它（默认 true）。`false` 用于
 *                  "内容到了但不想抢屏"的场合（见 B2-2 的未读点）。
 */
export function openRightPanelView(view: WorkbenchPanelKey, opts: { activate?: boolean } = {}): void {
  const app = useAppStore.getState();
  // Chat 模式没有右栏（模式硬边界）：不动作，也不静默改状态。
  if (app.sidebarMode === 'chat') return;

  const pane = resolveTargetPane(app, view);
  if (pane === 1) app.setRightPanelView(view);
  else if (pane === 2) app.setRightPanelView2(view);

  if ((opts.activate ?? true) && !app.showRightPanel) app.toggleRightPanel();
}
