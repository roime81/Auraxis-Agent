/**
 * useSessionHistory.ts — 顶栏左上角 ← → 的「上一个 / 下一个会话」。
 *
 * 为什么记录点放在**订阅**而不是某个 action 里：会话激活的入口有五个以上
 * （侧栏列表、命令面板、全局搜索、模式切换、新建、分支、回滚），其中
 * `newSession()` / `forkSession()` 是**直接写 `currentSessionId`** 的、根本不经过
 * `switchSession`。订阅读的是"当前会话是谁"这个事实，任何入口都覆盖得到。
 *
 * 导航为什么不在 store 里：`useAppStore` 不能 import `useChatStore`
 * （chatActions 已 import useAppStore，反向引用成环，`check:cycles` 预算为 0），
 * 所以"算走哪一步 → 调 switchSession → 回写下标"这段放在这里。
 */
import { useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useChatStore } from '../stores/useChatStore';
import { useSessionStore } from '../stores/useSessionStore';
import { findSessionHistoryTarget } from '../stores/sessionHistoryNav';

/**
 * 导航进行中：`switchSession` 会写 `currentSessionId`，从而触发下面的记录订阅 ——
 * 若不在记录时忽略它，每点一次「后退」都会把目标会话又追加进历史（历史原地打转）。
 */
let sessionNavInFlight = false;

/** 记录"当前会话变成了谁"。挂在应用级副作用里（三种模式都要生效）。 */
export function useSessionHistoryRecording(): void {
  useEffect(() => {
    const record = (id: string | null) => {
      if (!id || sessionNavInFlight) return;
      useAppStore.getState().recordSessionVisit(id);
    };
    record(useSessionStore.getState().currentSessionId);
    return useSessionStore.subscribe((s, prev) => {
      if (s.currentSessionId !== prev.currentSessionId) record(s.currentSessionId);
    });
  }, []);
}

export interface SessionHistoryNav {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

/** 供顶栏使用的前进/后退。返回值随 store 变化重算（**不能**用 getState 求值，否则按钮状态不更新）。 */
export function useSessionHistoryNav(): SessionHistoryNav {
  const history = useAppStore((s) => s.sessionHistory);
  const index = useAppStore((s) => s.sessionHistoryIndex);
  const sessions = useSessionStore((s) => s.sessions);

  return useMemo(() => {
    const isValid = (id: string) => sessions.some((s) => s.id === id);
    const backIdx = findSessionHistoryTarget(history, index, -1, isValid);
    const forwardIdx = findSessionHistoryTarget(history, index, 1, isValid);

    const go = (targetIdx: number | null) => {
      if (targetIdx === null) return;
      const id = history[targetIdx];
      sessionNavInFlight = true;
      try {
        useChatStore.getState().switchSession(id);
        useAppStore.getState().setSessionHistoryIndex(targetIdx);
      } finally {
        sessionNavInFlight = false;
      }
    };

    return {
      canGoBack: backIdx !== null,
      canGoForward: forwardIdx !== null,
      goBack: () => go(backIdx),
      goForward: () => go(forwardIdx),
    };
  }, [history, index, sessions]);
}
