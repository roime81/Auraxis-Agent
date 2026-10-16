// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBrowserOpenRouting } from '../useBrowserOpenRouting';
import { useAppStore } from '@/stores/useAppStore';

/**
 * Agent 打开网页时的呈现路由。
 *
 * 两条硬约束：
 *   · 面板**开着** → 切到预览（复用统一入口，分栏时不夺走第一栏）；
 *   · 面板**关着** → 不抢屏：视图先就位，只亮顶栏提示点，用户点开即见。
 * 以及：订阅在 shell 层，所以"预览组件没挂载"时请求也不会丢。
 */
let emitOpenRequest: ((payload: { url?: string }) => void) | null = null;

function Probe() {
  useBrowserOpenRouting();
  return null;
}

beforeEach(() => {
  emitOpenRequest = null;
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    browser: {
      onOpenRequest: (cb: (payload: { url?: string }) => void) => {
        emitOpenRequest = cb;
        return () => {
          emitOpenRequest = null;
        };
      },
    },
  };
  useAppStore.setState({
    sidebarMode: 'code',
    showRightPanel: false,
    rightPanelView: 'menu',
    rightPanelView2: 'menu',
    rightPanelSplit: false,
    browserOpenRequest: null,
    rightPanelUnseen: false,
  });
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('useBrowserOpenRouting — Agent 打开网页的呈现', () => {
  it('面板开着：切到预览并写入请求', () => {
    useAppStore.setState({ showRightPanel: true, rightPanelView: 'diff' });
    render(<Probe />);
    act(() => emitOpenRequest?.({ url: 'http://localhost:3000' }));

    const state = useAppStore.getState();
    expect(state.rightPanelView).toBe('preview');
    expect(state.rightPanelUnseen).toBe(false);
    expect(state.browserOpenRequest?.url).toBe('http://localhost:3000');
  });

  it('面板关着：视图就位但不打开，只亮提示点（不抢屏）', () => {
    render(<Probe />);
    act(() => emitOpenRequest?.({ url: 'http://localhost:3000' }));

    const state = useAppStore.getState();
    expect(state.showRightPanel, '不许抢屏').toBe(false);
    expect(state.rightPanelView, '视图先就位，点开即见').toBe('preview');
    expect(state.rightPanelUnseen).toBe(true);
  });

  it('点开面板即清提示点（清除只在 toggleRightPanel 一处）', () => {
    render(<Probe />);
    act(() => emitOpenRequest?.({ url: 'http://localhost:3000' }));
    expect(useAppStore.getState().rightPanelUnseen).toBe(true);

    act(() => useAppStore.getState().toggleRightPanel());
    const state = useAppStore.getState();
    expect(state.showRightPanel).toBe(true);
    expect(state.rightPanelUnseen).toBe(false);
  });

  it('分栏开着且第一栏在忙：预览进第二栏，不夺走正在看的那一栏', () => {
    useAppStore.setState({ showRightPanel: true, rightPanelSplit: true, rightPanelView: 'diff' });
    render(<Probe />);
    act(() => emitOpenRequest?.({ url: 'http://localhost:3000' }));

    const state = useAppStore.getState();
    expect(state.rightPanelView).toBe('diff');
    expect(state.rightPanelView2).toBe('preview');
  });

  it('Chat 模式：右栏不存在，不写入也不动作', () => {
    useAppStore.setState({ sidebarMode: 'chat' });
    render(<Probe />);
    act(() => emitOpenRequest?.({ url: 'http://localhost:3000' }));

    const state = useAppStore.getState();
    expect(state.browserOpenRequest).toBeNull();
    expect(state.rightPanelUnseen).toBe(false);
    expect(state.showRightPanel).toBe(false);
  });
});
