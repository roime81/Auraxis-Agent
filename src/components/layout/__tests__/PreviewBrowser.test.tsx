// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import PreviewBrowser from '../PreviewBrowser';
import { useAppStore } from '@/stores/useAppStore';

describe('PreviewBrowser — 预览浏览器按钮', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      browser: {
        open: vi.fn(async () => ({ ok: true, data: {} })),
        navigate: vi.fn(async () => ({ ok: true, data: {} })),
        back: vi.fn(async () => ({ ok: true, data: {} })),
        forward: vi.fn(async () => ({ ok: true, data: {} })),
        reload: vi.fn(async () => ({ ok: true, data: {} })),
        home: vi.fn(async () => ({ ok: true, data: {} })),
      },
    };
  });

  it('renders viewport switch buttons', () => {
    const { container } = render(<PreviewBrowser tabId="p1" />);
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(4);
  });

  it('右栏实例消费 Agent 的打开请求：webview 尚未挂载时先落 URL，挂载即导航', () => {
    useAppStore.setState({ browserOpenRequest: { url: 'http://localhost:4321/preview', ts: Date.now() } });
    const { container } = render(<PreviewBrowser tabId="right-preview" />);

    // jsdom 下走 iframe 分支（无 electronAPI 时为纯浏览器回退）
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('http://localhost:4321/preview');
    expect(useAppStore.getState().browserOpenRequest, '消费一次即清').toBeNull();
  });

  it('主区实例不消费请求（同一个页面不该被两个实例加载两遍）', () => {
    useAppStore.setState({ browserOpenRequest: { url: 'http://localhost:4321/preview', ts: Date.now() } });
    render(<PreviewBrowser tabId="main-browser" />);

    expect(useAppStore.getState().browserOpenRequest).not.toBeNull();
    useAppStore.setState({ browserOpenRequest: null });
  });
});
