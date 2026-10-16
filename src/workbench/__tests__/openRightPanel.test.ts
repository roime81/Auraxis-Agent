import { describe, it, expect } from 'vitest';
import { resolveTargetPane, type RightPanelRouteState } from '../openRightPanel';

const base: RightPanelRouteState = {
  rightPanelView: 'menu',
  rightPanelView2: 'menu',
  rightPanelSplit: false,
};

describe('resolveTargetPane — 右栏视图该放哪一栏', () => {
  it('单栏：一律第一栏', () => {
    expect(resolveTargetPane({ ...base, rightPanelView: 'diff' }, 'timeline')).toBe(1);
  });

  it('已经显示着这个视图 → 不动（重复按同一条快捷键不该有副作用）', () => {
    expect(resolveTargetPane({ ...base, rightPanelView: 'diff' }, 'diff')).toBeNull();
    expect(
      resolveTargetPane({ rightPanelView: 'diff', rightPanelView2: 'timeline', rightPanelSplit: true }, 'timeline'),
    ).toBeNull();
  });

  it('分栏开着且第一栏在忙 → 进第二栏，不夺走正在看的那一栏', () => {
    expect(
      resolveTargetPane({ rightPanelView: 'diff', rightPanelView2: 'menu', rightPanelSplit: true }, 'preview'),
    ).toBe(2);
  });

  it('分栏开着但第一栏停在清单态 → 仍用第一栏（清单不是"正在看的东西"）', () => {
    expect(
      resolveTargetPane({ rightPanelView: 'menu', rightPanelView2: 'timeline', rightPanelSplit: true }, 'diff'),
    ).toBe(1);
  });
});
