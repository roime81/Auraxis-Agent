import { describe, it, expect } from 'vitest';
import { findSessionHistoryTarget, pushSessionVisit, MAX_SESSION_HISTORY } from '../sessionHistoryNav';

const allValid = () => true;

describe('findSessionHistoryTarget — 跳过已删除 / 不存在的条目', () => {
  it('正常前后移动', () => {
    const h = ['a', 'b', 'c'];
    expect(findSessionHistoryTarget(h, 2, -1, allValid)).toBe(1);
    expect(findSessionHistoryTarget(h, 0, 1, allValid)).toBe(1);
  });

  it('相邻条目已被删除时继续往外找', () => {
    const h = ['a', 'b', 'c'];
    const valid = (id: string) => id !== 'b';
    expect(findSessionHistoryTarget(h, 2, -1, valid)).toBe(0);
    expect(findSessionHistoryTarget(h, 0, 1, valid)).toBe(2);
  });

  it('到头返回 null（而不是 -1/+1 越界后继续用）', () => {
    const h = ['a', 'b'];
    expect(findSessionHistoryTarget(h, 0, -1, allValid)).toBeNull();
    expect(findSessionHistoryTarget(h, 1, 1, allValid)).toBeNull();
  });

  it('该方向全是已删除会话时返回 null（按钮据此禁用，而不是变成死点击）', () => {
    const h = ['gone1', 'current', 'gone2'];
    const valid = (id: string) => id === 'current';
    expect(findSessionHistoryTarget(h, 1, -1, valid)).toBeNull();
    expect(findSessionHistoryTarget(h, 1, 1, valid)).toBeNull();
  });
});

describe('pushSessionVisit — 记录一次访问', () => {
  it('追加并返回新的下标', () => {
    expect(pushSessionVisit(['a'], 0, 'b')).toEqual({ history: ['a', 'b'], index: 1 });
  });

  it('与当前位置相同的会话不重复入栈（切换回同一会话时会出现）', () => {
    expect(pushSessionVisit(['a', 'b'], 1, 'b')).toEqual({ history: ['a', 'b'], index: 1 });
  });

  it('空 id 不入栈（会话尚未建立时的占位调用）', () => {
    expect(pushSessionVisit(['a'], 0, '')).toEqual({ history: ['a'], index: 0 });
  });

  it('从中间访问新会话会截断前进分支', () => {
    expect(pushSessionVisit(['a', 'b', 'c'], 0, 'd')).toEqual({ history: ['a', 'd'], index: 1 });
  });

  it('超过上限时丢弃最旧的（长期使用不会无限增长）', () => {
    const full = Array.from({ length: MAX_SESSION_HISTORY }, (_, i) => `s${i}`);
    const next = pushSessionVisit(full, full.length - 1, 'newest');
    expect(next.history).toHaveLength(MAX_SESSION_HISTORY);
    expect(next.history[next.history.length - 1]).toBe('newest');
    expect(next.history[0]).toBe('s1'); // 最旧的 s0 被丢弃
    expect(next.index).toBe(MAX_SESSION_HISTORY - 1);
  });

  it('不改动入参数组（store 里是只读状态）', () => {
    const original = ['a', 'b'];
    pushSessionVisit(original, 1, 'c');
    expect(original).toEqual(['a', 'b']);
  });
});
