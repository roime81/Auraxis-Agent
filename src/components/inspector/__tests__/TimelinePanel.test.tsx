// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import TimelinePanel, { TRAJECTORY_FOCUS_TTL_MS } from '../TimelinePanel';
import { useAgentStore } from '@/stores/useAgentStore';
import { useAppStore } from '@/stores/useAppStore';
import type { AgentInfo } from '@/types/agent';

const agent: AgentInfo = {
  id: 'a1',
  name: '重构',
  description: '重构输入区',
  type: 'general-purpose',
  status: 'running',
  priority: 'normal',
  startTime: Date.now(),
  iteration: 2,
  maxIterations: 10,
  toolCallCount: 1,
  messagesCount: 2,
  totalInputTokens: 1200,
  totalOutputTokens: 800,
  log: [
    { type: 'iteration_start', timestamp: 1, iteration: 1 },
    {
      type: 'tool_start',
      timestamp: 2,
      toolCallId: 'tc1',
      toolName: 'Read',
      input: { file_path: 'electron/agent-runtime/step-engine.ts' },
    },
    {
      type: 'tool_end',
      timestamp: 3,
      toolCallId: 'tc1',
      toolName: 'Read',
      input: { file_path: 'electron/agent-runtime/step-engine.ts' },
      durationMs: 120,
    },
    {
      type: 'iteration_end',
      timestamp: 4,
      iteration: 1,
      llmLatencyMs: 2500,
      firstTokenMs: 500,
      outputTokens: 200,
    },
    { type: 'iteration_start', timestamp: 5, iteration: 2 },
    { type: 'text', timestamp: 6, text: '先读取代码结构，再统一事件流。' },
    { type: 'iteration_end', timestamp: 7, iteration: 2, llmLatencyMs: 1000 },
  ],
};

describe('TimelinePanel — 右侧时间线', () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [agent], currentAgentId: 'a1' });
  });

  it('groups events into turns with TTFT / tok/s stats', () => {
    const { container } = render(<TimelinePanel />);
    const text = container.textContent ?? '';
    expect(text).toContain('轮次 1');
    expect(text).toContain('轮次 2');
    expect(text).toContain('Read');
    expect(text).toContain('step-engine.ts');
    expect(text).toContain('首 token 0.5s');
    expect(text).toContain('~100 tok/s');
    expect(text).toContain('先读取代码结构，再统一事件流。');
  });

  it('shows an empty hint without a selected agent', () => {
    useAgentStore.setState({ agents: [], currentAgentId: null });
    const { container } = render(<TimelinePanel />);
    expect(container.textContent).toContain('时间线');
  });

  it('does not crash when a tool entry has neither input nor output', () => {
    const log: AgentInfo['log'] = [
      { type: 'iteration_start', timestamp: 1, iteration: 1 },
      { type: 'tool_end', timestamp: 2, toolCallId: 'tc-empty', toolName: 'SomeTool' },
      { type: 'iteration_end', timestamp: 3, iteration: 1 },
    ];
    useAgentStore.setState({ agents: [{ ...agent, log }], currentAgentId: 'a1' });
    const { container } = render(<TimelinePanel />);
    const row = [...container.querySelectorAll('tr')].find((tr) => (tr.textContent ?? '').includes('SomeTool'));
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(container.textContent).toContain('SomeTool');
  });

  it('virtualizes long ledgers and windows on scroll', () => {
    const log: AgentInfo['log'] = [];
    for (let i = 1; i <= 100; i++) {
      log.push({ type: 'iteration_start', timestamp: i * 100, iteration: i });
      log.push({ type: 'text', timestamp: i * 100 + 1, text: `消息 ${i}` });
      log.push({ type: 'iteration_end', timestamp: i * 100 + 2, iteration: i });
    }
    useAgentStore.setState({
      agents: [{ ...agent, iteration: 100, toolCallCount: 0, log }],
      currentAgentId: 'a1',
    });
    const { container } = render(<TimelinePanel />);
    const scroller = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller).toBeTruthy();
    // Only the first window is mounted, not all 200 rows.
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(200);
    expect(container.textContent).toContain('消息 1');

    Object.defineProperty(scroller, 'clientHeight', { value: 400, writable: true, configurable: true });
    Object.defineProperty(scroller, 'scrollHeight', { value: 8200, writable: true, configurable: true });
    Object.defineProperty(scroller, 'scrollTop', { value: 3000, writable: true, configurable: true });
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });

    // A later window is now mounted and the head rows are unmounted.
    expect(container.textContent).toContain('消息 43');
    expect(container.textContent).not.toContain('消息 1');
  });

  it('filters the ledger with the trajectory search box', () => {
    const { container } = render(<TimelinePanel />);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'step-engine' } });
    expect(container.textContent).toContain('Read');
    expect(container.textContent).not.toContain('轮次 2');
  });

  it('轨迹定位请求：新的选中该行，过期的只清不滚', () => {
    // 新鲜请求 → 选中并展开详情侧栏（`<aside>` 只在有选中项时渲染）
    useAppStore.setState({
      trajectoryFocusRequest: { agentId: 'a1', toolCallId: 'tc1', ts: Date.now() },
    });
    const fresh = render(<TimelinePanel />);
    expect(fresh.container.querySelector('aside'), '新鲜请求应当选中该行并展开详情').toBeTruthy();
    expect(useAppStore.getState().trajectoryFocusRequest, '消费即清').toBeNull();
    fresh.unmount();

    // 过期请求（超过 TTL）→ 不选中任何行，但同样清掉，避免它继续挂在 store 里
    useAppStore.setState({
      trajectoryFocusRequest: {
        agentId: 'a1',
        toolCallId: 'tc1',
        ts: Date.now() - TRAJECTORY_FOCUS_TTL_MS - 1000,
      },
    });
    const stale = render(<TimelinePanel />);
    expect(stale.container.querySelector('aside'), '过期请求不该把视图跳到历史步骤上').toBeNull();
    expect(useAppStore.getState().trajectoryFocusRequest).toBeNull();
  });

  it('switches to the duration timeline view', () => {
    const { container } = render(<TimelinePanel />);
    const timelineBtn = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '') === '时间线');
    expect(timelineBtn).toBeTruthy();
    fireEvent.click(timelineBtn!);
    expect(container.textContent).toContain('块宽 ∝ 实际耗时');
    expect(container.textContent).toContain('轮次 1');
  });
});
