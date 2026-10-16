export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: 'navigation' | 'chat' | 'agent' | 'system';
}

export const KEY_BINDINGS: KeyBinding[] = [
  // ── Navigation ──
  {
    key: 'k',
    ctrl: true,
    description: '打开命令面板',
    category: 'navigation',
  },
  {
    key: 'P',
    ctrl: true,
    shift: true,
    description: '打开命令面板',
    category: 'navigation',
  },
  {
    key: 'b',
    ctrl: true,
    description: '切换侧边栏',
    category: 'navigation',
  },
  {
    key: '/',
    ctrl: true,
    description: '切换侧边栏',
    category: 'navigation',
  },
  {
    // 大写：与上面的 `'P'` 一致 —— 真键盘上 `Shift+字母` 产出的就是大写。
    // 匹配已忽略大小写（见 keyMatches），这里写成大写只是让表格自洽。
    key: 'I',
    ctrl: true,
    shift: true,
    description: '切换右侧面板',
    category: 'navigation',
  },
  {
    key: 'b',
    ctrl: true,
    alt: true,
    description: '切换右侧面板',
    category: 'navigation',
  },
  // ── Pane focus ──
  {
    key: '1',
    alt: true,
    description: '聚焦侧边栏',
    category: 'navigation',
  },
  {
    key: '2',
    alt: true,
    description: '聚焦主内容区',
    category: 'navigation',
  },
  {
    key: '3',
    alt: true,
    description: '聚焦右侧面板',
    category: 'navigation',
  },
  // ── Right-panel tab switching ──
  {
    key: '1',
    ctrl: true,
    shift: true,
    description: '右侧面板：执行详情',
    category: 'navigation',
  },
  {
    key: '2',
    ctrl: true,
    shift: true,
    description: '右侧面板：时间线',
    category: 'navigation',
  },
  {
    key: '3',
    ctrl: true,
    shift: true,
    description: '右侧面板：变更',
    category: 'navigation',
  },
  {
    key: '4',
    ctrl: true,
    shift: true,
    description: '右侧面板：预览',
    category: 'navigation',
  },
  {
    key: '`',
    ctrl: true,
    description: '打开集成终端',
    category: 'navigation',
  },
  // ── Chat ──
  {
    key: 'l',
    ctrl: true,
    description: '清空对话',
    category: 'chat',
  },
  {
    key: 'n',
    ctrl: true,
    description: '新建对话',
    category: 'chat',
  },
  // ── System ──
  {
    key: 'z',
    ctrl: true,
    description: '撤销最近操作',
    category: 'system',
  },
  {
    key: ',',
    ctrl: true,
    description: '打开设置',
    category: 'system',
  },
  {
    key: 'w',
    ctrl: true,
    description: '关闭当前标签页',
    category: 'system',
  },
  {
    key: 'Escape',
    description: '停止生成 / 关闭面板',
    category: 'system',
  },
  // ── Right-panel tab switching（续）──
  // 追加在**数组末尾**而不是紧挨上面的 1–4：用户的换绑按数组下标持久化
  // （`useKeybindingsStore` 的 overrides），在中间插入会让已保存的自定义键整体错位。
  {
    key: '5',
    ctrl: true,
    shift: true,
    description: '右侧面板：概览',
    category: 'navigation',
  },
  {
    key: '6',
    ctrl: true,
    shift: true,
    description: '右侧面板：计划',
    category: 'navigation',
  },
  {
    key: '7',
    ctrl: true,
    shift: true,
    description: '右侧面板：文件',
    category: 'navigation',
  },
];

/**
 * 按键是否命中绑定。
 *
 * 数字绑定额外比对**物理键位**：绑定表里存的是 `'1'`..`'7'`，而 `Shift+数字` 在
 * US / 中文布局上产出的是 `! @ # $ % ^ &` —— 只比 `e.key` 的话，菜单与详情头广告
 * 的「Ctrl+Shift+1..7」在真机上**一个都按不出来**（单测曾因伪造 `key:'1'` 而常绿）。
 * 修饰键仍由 `matchBinding` 严格比对，所以 `Ctrl+3` 不会误触 `Ctrl+Shift+3`。
 */
function keyMatches(e: KeyboardEvent, key: string): boolean {
  if (key === e.key) return true;
  // 字母**忽略大小写**：`Shift+字母` 在真实键盘上产出大写（`Ctrl+Shift+I` → key `"I"`），
  // 而绑定表历史上混用了两种写法（`'P'` 大写、`'i'` 小写）—— 只做字面比较会让
  // 「切换右侧面板」这类和弦静默失效。与数字的物理键兜底是同一类错误的两种形态。
  if (key.length === 1 && e.key.length === 1 && /[a-z]/i.test(key)) {
    return key.toLowerCase() === e.key.toLowerCase();
  }
  if (key.length === 1 && key >= '0' && key <= '9') {
    return e.code === `Digit${key}` || e.code === `Numpad${key}`;
  }
  return false;
}

export function matchBinding(e: KeyboardEvent, binding: KeyBinding, platform?: string): boolean {
  // Ctrl-bindings are Cmd-equivalent on macOS only. Treating Meta as Ctrl
  // everywhere makes Windows' Win key hijack app shortcuts (e.g. Win+K).
  const mac = /Mac|iPhone|iPad/.test(platform ?? (typeof navigator !== 'undefined' ? navigator.platform : ''));
  const ctrlPressed = e.ctrlKey || (mac && e.metaKey);
  if (!keyMatches(e, binding.key)) return false;
  if (binding.ctrl !== undefined && binding.ctrl !== ctrlPressed) return false;
  if (binding.shift !== undefined && binding.shift !== e.shiftKey) return false;
  if (binding.alt !== undefined && binding.alt !== e.altKey) return false;
  if (binding.meta !== undefined && binding.meta !== e.metaKey) return false;
  return true;
}

/** Platform-aware Ctrl/Cmd check (Windows/Linux: Ctrl only; macOS: Ctrl or Cmd). */
export function isCtrlOrCmd(e: KeyboardEvent): boolean {
  const mac = /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '');
  return e.ctrlKey || (mac && e.metaKey);
}

export function formatBinding(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  if (b.meta) parts.push('Meta');
  if (b.key === 'Escape') parts.push('Esc');
  else if (b.key === ' ') parts.push('Space');
  else if (b.key.length === 1) parts.push(b.key.toUpperCase());
  else parts.push(b.key);
  return parts.join('+');
}

/**
 * 录制按键时的归一：数字键一律存成 `'0'`..`'9'`，而不是 `Shift` 带出来的符号。
 *
 * 与 `keyMatches` 的物理键兜底配套 —— 否则用户录制 `Ctrl+Shift+1` 会存成
 * `Ctrl+Shift+!`，设置页显示成后者，且换个布局就再也不命中。
 */
export function normalizeRecordedKey(e: KeyboardEvent): string {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code ?? '');
  return m ? m[1] : e.key;
}

/**
 * 两条绑定是否指向同一个物理按键。字母忽略大小写 —— 与 `keyMatches` 同一口径，
 * 否则"录制 `Ctrl+Shift+I` 与表里的小写 `'i'`"会被判成不冲突，从而留下两条等价绑定。
 */
export function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
