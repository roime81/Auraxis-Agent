// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useSessionHistoryNav, useSessionHistoryRecording } from '../useSessionHistory';
import { useAppStore } from '@/stores/useAppStore';
import { useChatStore } from '@/stores/useChatStore';
import { useSessionStore } from '@/stores/useSessionStore';
import type { Session } from '@/stores/sessionStoreTypes';

/**
 * 顶栏左上角 ← → 的会话历史。
 *
 * 契约：**任何**把 currentSessionId 变成另一个会话的入口都要被记下来（侧栏、命令面板、
 * 全局搜索、模式切换、新建、分支 —— 其中后两者直接写 currentSessionId、不经过
 * switchSession），并且点 ← / → 回到历史里的相邻会话、**删除过的会话要跳过**。
 */
function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    created: 1,
    updated: 1,
    model: 'deepseek-flash',
    messageCount: 1,
    messages: [{ id: `${id}-m1`, role: 'user', content: `来自 ${title} 的消息` }],
    mode: 'chat',
  } as unknown as Session;
}

function Probes() {
  useSessionHistoryRecording();
  return null;
}

function NavProbe({ onState }: { onState: (nav: ReturnType<typeof useSessionHistoryNav>) => void }) {
  onState(useSessionHistoryNav());
  return null;
}

function resetStores() {
  useSessionStore.setState({
    sessions: [makeSession('s1', '一号'), makeSession('s2', '二号'), makeSession('s3', '三号')],
    currentSessionId: 's1',
    pendingMode: 'chat',
  } as never);
  useAppStore.setState({ sessionHistory: [], sessionHistoryIndex: -1, sidebarMode: 'chat' });
  useChatStore.setState({ messages: [], isStreaming: false, drafts: {} } as never);
}

describe('会话历史 — 记录', () => {
  beforeEach(resetStores);

  it('初始会话直接入栈（启动后就有"当前位置"）', () => {
    render(<Probes />);
    expect(useAppStore.getState().sessionHistory).toEqual(['s1']);
    expect(useAppStore.getState().sessionHistoryIndex).toBe(0);
  });

  it('切换会话会被记录 —— 包括不经过 switchSession 的入口（新建/分支直接写 currentSessionId）', () => {
    render(<Probes />);

    act(() => {
      useSessionStore.setState({ currentSessionId: 's2' }); // 模拟 newSession 那条路径
    });
    act(() => {
      useChatStore.getState().switchSession('s3'); // 常规入口
    });

    expect(useAppStore.getState().sessionHistory).toEqual(['s1', 's2', 's3']);
    expect(useAppStore.getState().sessionHistoryIndex).toBe(2);
  });
});

describe('会话历史 — 前进 / 后退', () => {
  beforeEach(resetStores);

  function setup() {
    let nav: ReturnType<typeof useSessionHistoryNav> | null = null;
    const { rerender } = render(<NavProbe onState={(n) => (nav = n)} />);
    const tick = () => act(() => rerender(<NavProbe onState={(n) => (nav = n)} />));
    return {
      get nav() {
        return nav!;
      },
      tick,
    };
  }

  it('← 回到上一个会话，→ 再回到后来的那个', () => {
    useAppStore.setState({ sessionHistory: ['s1', 's2', 's3'], sessionHistoryIndex: 2 });
    const h = setup();
    expect(h.nav.canGoBack).toBe(true);
    expect(h.nav.canGoForward).toBe(false);

    act(() => h.nav.goBack());
    expect(useAppStore.getState().sessionHistoryIndex).toBe(1);
    expect(useChatStore.getState().messages[0]?.content).toBe('来自 二号 的消息');

    h.tick();
    expect(h.nav.canGoForward).toBe(true);
    act(() => h.nav.goForward());
    expect(useAppStore.getState().sessionHistoryIndex).toBe(2);
    expect(useChatStore.getState().messages[0]?.content).toBe('来自 三号 的消息');
  });

  it('跳转**不会**把目标会话又记一次（否则历史原地打转）', () => {
    useAppStore.setState({ sessionHistory: ['s1', 's2'], sessionHistoryIndex: 1 });
    const h = setup();

    act(() => h.nav.goBack());

    expect(useAppStore.getState().sessionHistory).toEqual(['s1', 's2']);
    expect(useAppStore.getState().sessionHistoryIndex).toBe(0);
  });

  it('已删除的会话被跳过（不是简单地减一）', () => {
    useAppStore.setState({ sessionHistory: ['s1', 's2', 's3'], sessionHistoryIndex: 2 });
    // s2 被删掉了
    useSessionStore.setState({ sessions: [makeSession('s1', '一号'), makeSession('s3', '三号')] } as never);
    const h = setup();

    act(() => h.nav.goBack());

    expect(useAppStore.getState().sessionHistoryIndex).toBe(0);
    expect(useChatStore.getState().messages[0]?.content).toBe('来自 一号 的消息');
  });

  it('两端没有可达会话时按钮禁用（不画点了没反应的按钮）', () => {
    useAppStore.setState({ sessionHistory: ['gone', 's2', 'gone2'], sessionHistoryIndex: 1 });
    useSessionStore.setState({ sessions: [makeSession('s2', '二号')] } as never);
    const h = setup();

    expect(h.nav.canGoBack).toBe(false);
    expect(h.nav.canGoForward).toBe(false);
  });
});
