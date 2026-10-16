/**
 * sessionHistoryNav.ts — 「上一个 / 下一个会话」的历史模型（纯函数）。
 *
 * 顶栏左上角那两个箭头此前连的是**主区标签页历史**（`tabHistory`）：那是主区还有
 * chat / 浏览器 / 文件树多个标签时的东西。后来标签条被删、主区固定显示对话，启动
 * 逻辑还会主动关掉所有非 chat 标签（`useAppRuntimeEffects`），于是历史数组最多只有
 * 一项、两个按钮**永远禁用**（实测 Chat/Work/Code 三态全灰）。
 *
 * 现在改为会话历史：你访问过的会话按顺序记下来，← 回到上一个、→ 回到下一个。
 * 与标签历史的两点不同：
 *   · 会话会被删除 → 导航时要跳过**已不存在的 id**（不是简单 -1/+1）；
 *   · 访问可能来自任意入口（侧栏、命令面板、全局搜索、模式切换、新建、分支），
 *     所以记录点不放在某个 action 里，而是订阅 `currentSessionId` 的变化。
 */

/** 历史上限：够用即可，避免长期使用后无限增长。 */
export const MAX_SESSION_HISTORY = 50;

/** 从当前位置往前/往后找**仍然存在**的相邻条目；返回它的下标，找不到返回 null。 */
export function findSessionHistoryTarget(
  history: readonly string[],
  index: number,
  dir: -1 | 1,
  isValid: (id: string) => boolean,
): number | null {
  let cursor = index + dir;
  while (cursor >= 0 && cursor < history.length) {
    if (isValid(history[cursor])) return cursor;
    cursor += dir;
  }
  return null;
}

/**
 * 记录一次会话访问：截断"前进"分支后追加，并去重连续重复。
 *
 * 截断是浏览器历史的语义：从历史中间回到 A、再打开新会话 B，
 * 那条更早的前进分支就作废了。
 */
export function pushSessionVisit(
  history: readonly string[],
  index: number,
  id: string,
): { history: string[]; index: number } {
  if (!id) return { history: [...history], index };
  if (history[index] === id) return { history: [...history], index };
  const next = [...history.slice(0, index + 1), id];
  const trimmed = next.length > MAX_SESSION_HISTORY ? next.slice(next.length - MAX_SESSION_HISTORY) : next;
  return { history: trimmed, index: trimmed.length - 1 };
}
