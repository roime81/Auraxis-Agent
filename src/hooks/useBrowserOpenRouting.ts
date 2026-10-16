/**
 * useBrowserOpenRouting.ts — Agent 打开网页（`BrowserOpen` 工具）时的**呈现路由**。
 *
 * 主进程在收到该工具调用时会先导航已注册的预览 webview，然后广播
 * `browser:openRequest`。此前这个事件的唯一订阅者住在 `PreviewBrowser` 组件内部，
 * 于是：
 *   · 面板/预览没挂着 → **请求无人接收**，直接丢失（用户永远看不到刚打开的页面）；
 *   · 面板关着但预览曾挂载（子树常驻，宽度 0）→ 订阅者收到了，却只做
 *     `setRightPanelView('preview')` —— 对一棵看不见的树切换视图，用户毫无感知。
 *
 * 现在订阅放在 shell 层（与预览组件是否挂载无关），并按 Cursor 的 pill 语义决定呈现：
 *   · 面板开着 → 把预览切到前台（复用统一入口的路由，不夺走分栏里正在看的那一栏）；
 *   · 面板关着 → **不抢屏**：视图先在 store 里就位，顶栏工作台按钮亮一个小圆点，
 *     用户点开即见页面（清点发生在 `toggleRightPanel` 这一处）。
 *
 * 已知边界（本批不解决）：预览 webview 如果**从未挂载过**，`BrowserOpen` 在工具层
 * 就以 `NO_TARGET_ERROR` 失败（`electron/browser-target.ts` 的 fail-closed 注册语义），
 * 渲染层根本收不到事件 —— 那种情况下没有可自动呈现的东西。
 */
import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { openRightPanelView } from '../workbench/openRightPanel';

export function useBrowserOpenRouting(): void {
  useEffect(() => {
    const off = window.electronAPI?.browser?.onOpenRequest?.(({ url }) => {
      const app = useAppStore.getState();
      if (app.sidebarMode === 'chat') return; // Chat 没有右栏（模式硬边界）

      app.setBrowserOpenRequest({ url: url ?? '', ts: Date.now() });
      // activate:false —— 面板开着时只切栏（不重复 toggle）；关着时也不打开，
      // 由下面的提示点告诉用户"有新内容"。
      openRightPanelView('preview', { activate: false });
      if (!app.showRightPanel) app.markRightPanelUnseen();
    });
    return off;
  }, []);
}
