/**
 * useTrajectoryFocusRouting.ts — 轨迹定位请求的**路由**：打开右栏并切到时间线。
 *
 * 触发源是对话区里两类**用户显式动作**：工具行的「定位」按钮、工具行双击
 * （`AgentConversationRender`）。它们只往 store 里写一个
 * `trajectoryFocusRequest { agentId, toolCallId, ts }`，消费方是时间线面板
 * （选中并滚动到那一行）。
 *
 * 之所以需要这条路由：右栏**关着的时候子树仍然挂载**（宽度 0，是为了让面板状态
 * 跨关开存活 —— 刻意的设计）。于是请求会被那棵看不见的树消费掉并清空，用户看到的
 * 是"点了没反应"。
 *
 * 实现用 `useAppStore.subscribe` 而不是读 state 的 effect：订阅在 `set()` 内
 * **同步**触发，因此不受"时间线面板的消费 effect 恰好先跑并清掉请求"影响 ——
 * 两个 React effect 的执行顺序不可依赖，路由必须以**事件**为准，而不是以
 * "请求还在不在 store 里"为准。
 *
 * 与错误导航（`useAgentConversationLog`）的分工：那是"在主区里跳下一条错误"的
 * 自动镜像，只在时间线**可见**时才发请求，不抢右栏。
 */
import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { openRightPanelView } from '../workbench/openRightPanel';

export function useTrajectoryFocusRouting(): void {
  useEffect(() => {
    let lastHandled: unknown = null;
    return useAppStore.subscribe((s) => {
      const req = s.trajectoryFocusRequest;
      // 幂等：同一个请求对象只处理一次（清空后再写入同值也会是新对象）。
      if (!req || req === lastHandled) return;
      lastHandled = req;
      // chat 模式没有右栏 —— 守卫在统一入口里。
      openRightPanelView('timeline');
    });
  }, []);
}
