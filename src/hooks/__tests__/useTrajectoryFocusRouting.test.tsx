// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useTrajectoryFocusRouting } from '../useTrajectoryFocusRouting';
import { useAppStore } from '@/stores/useAppStore';

/**
 * 轨迹定位的路由契约：**用户显式点击必须真的把右栏打开并切到时间线**。
 *
 * 此前没有任何人负责开面板（请求只被"关着的面板"里那棵挂载但宽度为 0 的树消费掉），
 * 点击表现为"点了没反应"。这里逐条钉住：开面板 / 切栏 / chat 守卫 / 幂等。
 */
function Probe() {
  useTrajectoryFocusRouting();
  return null;
}

describe('useTrajectoryFocusRouting — 轨迹定位打开时间线', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarMode: 'code',
      showRightPanel: false,
      rightPanelView: 'menu',
      rightPanelView2: 'menu',
      rightPanelSplit: false,
      trajectoryFocusRequest: null,
    });
  });

  it('新的定位请求 → 打开右栏并切到时间线', () => {
    render(<Probe />);
    act(() => {
      useAppStore.getState().requestTrajectoryFocus('agent-1', 'call-1');
    });

    const state = useAppStore.getState();
    expect(state.rightPanelView).toBe('timeline');
    expect(state.showRightPanel, '定位必须把面板一并打开').toBe(true);
  });

  it('分栏开着且第一栏在忙 → 时间线进第二栏，不夺走正在看的那一栏', () => {
    useAppStore.setState({ showRightPanel: true, rightPanelSplit: true, rightPanelView: 'diff' });
    render(<Probe />);
    act(() => {
      useAppStore.getState().requestTrajectoryFocus('agent-1', 'call-1');
    });

    const state = useAppStore.getState();
    expect(state.rightPanelView).toBe('diff');
    expect(state.rightPanelView2).toBe('timeline');
  });

  it('Chat 模式：右栏不存在，不动作也不改状态', () => {
    useAppStore.setState({ sidebarMode: 'chat' });
    render(<Probe />);
    act(() => {
      useAppStore.getState().requestTrajectoryFocus('agent-1', 'call-1');
    });

    const state = useAppStore.getState();
    expect(state.rightPanelView).toBe('menu');
    expect(state.showRightPanel).toBe(false);
  });

  it('已经是同一个视图时不重复动作（幂等）', () => {
    useAppStore.setState({ rightPanelView: 'timeline', showRightPanel: true });
    render(<Probe />);
    act(() => {
      useAppStore.getState().requestTrajectoryFocus('agent-1', 'call-1');
    });

    expect(useAppStore.getState().rightPanelView).toBe('timeline');
    expect(useAppStore.getState().showRightPanel).toBe(true);
  });

  it('卸载后不再响应（订阅被清理）', () => {
    const { unmount } = render(<Probe />);
    unmount();
    act(() => {
      useAppStore.getState().requestTrajectoryFocus('agent-1', 'call-1');
    });

    expect(useAppStore.getState().rightPanelView).toBe('menu');
  });
});
