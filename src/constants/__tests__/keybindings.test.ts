import { describe, it, expect } from 'vitest';
import { KEY_BINDINGS, formatBinding, matchBinding, isCtrlOrCmd, normalizeRecordedKey, sameKey } from '../keybindings';

function ev(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: 'k',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  } as KeyboardEvent;
}

const CTRL_K = { key: 'k', ctrl: true, description: '打开命令面板', category: 'navigation' as const };

describe('matchBinding — Ctrl / Meta 平台语义', () => {
  it('Windows 上 Ctrl+K 匹配，Win+K 不匹配', () => {
    expect(matchBinding(ev({ ctrlKey: true }), CTRL_K, 'Win32')).toBe(true);
    expect(matchBinding(ev({ metaKey: true }), CTRL_K, 'Win32')).toBe(false);
  });

  it('macOS 上 Ctrl+K 与 Cmd+K 都匹配', () => {
    expect(matchBinding(ev({ ctrlKey: true }), CTRL_K, 'MacIntel')).toBe(true);
    expect(matchBinding(ev({ metaKey: true }), CTRL_K, 'MacIntel')).toBe(true);
  });
});

describe('matchBinding — 数字绑定的物理键兜底', () => {
  // 绑定表里存的是 '1'..'7'，而 Shift+数字 在 US / 中文布局上发出的是 ! @ # …
  const CTRL_SHIFT_1 = {
    key: '1',
    ctrl: true,
    shift: true,
    description: '右侧面板：执行详情',
    category: 'navigation' as const,
  };
  const ALT_1 = { key: '1', alt: true, description: '聚焦侧边栏', category: 'navigation' as const };

  it('Shift+1 产出 "!" 时仍匹配（真实键盘的形状）', () => {
    const e = ev({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true });
    expect(matchBinding(e, CTRL_SHIFT_1, 'Win32')).toBe(true);
  });

  it('小键盘 Numpad1 同样匹配', () => {
    const e = ev({ key: '!', code: 'Numpad1', ctrlKey: true, shiftKey: true });
    expect(matchBinding(e, CTRL_SHIFT_1, 'Win32')).toBe(true);
  });

  it('反例：Ctrl+1（未按 Shift）不匹配需要 Shift 的绑定', () => {
    const e = ev({ key: '1', code: 'Digit1', ctrlKey: true, shiftKey: false });
    expect(matchBinding(e, CTRL_SHIFT_1, 'Win32')).toBe(false);
  });

  it('反例：别的物理键不会冒充数字', () => {
    const e = ev({ key: '!', code: 'Digit9', ctrlKey: true, shiftKey: true });
    expect(matchBinding(e, CTRL_SHIFT_1, 'Win32')).toBe(false);
  });

  it('不带 Shift 的数字绑定（Alt+1..3）行为不变', () => {
    expect(matchBinding(ev({ key: '1', code: 'Digit1', altKey: true }), ALT_1, 'Win32')).toBe(true);
    expect(matchBinding(ev({ key: '1', code: 'Digit1', altKey: true }), CTRL_SHIFT_1, 'Win32')).toBe(false);
  });

  it('字母与符号绑定不受兜底影响', () => {
    expect(matchBinding(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), CTRL_K, 'Win32')).toBe(true);
    // 数字键上的按键不会命中字母绑定（兜底只对数字绑定生效）
    const shiftedDigit = ev({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true });
    expect(matchBinding(shiftedDigit, CTRL_K, 'Win32')).toBe(false);
  });
});

/**
 * 通用防线：**绑定表里的每一条都必须能被真实键盘事件命中**。
 *
 * 这条是补出来的 —— 此前"Ctrl+Shift+1..7"（数字被 Shift 变成符号）与"Ctrl+Shift+I"
 * （字母被 Shift 变成大写）两类静默失效都是靠人肉发现的：字面比较 `binding.key !== e.key`
 * 在伪造事件的单测里永远是绿的。这里不再伪造：按真实布局推导 `key`（Shift+数字→符号、
 * Shift+字母→大写），`code` 取物理键位，然后逐条断言可达。
 */
const SHIFTED_DIGIT: Record<string, string> = {
  '0': ')',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
};
const PUNCT_CODE: Record<string, string> = {
  '/': 'Slash',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  ' ': 'Space',
  '-': 'Minus',
  '=': 'Equal',
};

/** 由绑定反推"真键盘按下它时"的 KeyboardEvent 形状。 */
function realKeyboardEvent(binding: {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}): KeyboardEvent {
  let key = binding.key;
  let code = '';
  if (/^[a-z]$/i.test(binding.key)) {
    code = `Key${binding.key.toUpperCase()}`;
    if (binding.shift) key = binding.key.toUpperCase();
  } else if (/^[0-9]$/.test(binding.key)) {
    code = `Digit${binding.key}`;
    if (binding.shift) key = SHIFTED_DIGIT[binding.key] ?? binding.key;
  } else {
    code = PUNCT_CODE[binding.key] ?? binding.key;
  }
  return {
    key,
    code,
    ctrlKey: !!binding.ctrl,
    shiftKey: !!binding.shift,
    altKey: !!binding.alt,
    metaKey: !!binding.meta,
  } as KeyboardEvent;
}

describe('KEY_BINDINGS — 每条绑定都必须能被真实键盘命中', () => {
  it.each(KEY_BINDINGS.map((b) => [formatBinding(b), b] as const))('%s 在真机上按得响', (_label, binding) => {
    expect(matchBinding(realKeyboardEvent(binding), binding, 'Win32'), `${formatBinding(binding)} 按不响`).toBe(true);
  });
});

describe('matchBinding — 字母的大小写口径', () => {
  const CTRL_SHIFT_I = {
    key: 'I',
    ctrl: true,
    shift: true,
    description: '切换右侧面板',
    category: 'navigation' as const,
  };

  it('Shift+字母产出大写时命中（真键盘形状）', () => {
    expect(matchBinding(ev({ key: 'I', code: 'KeyI', ctrlKey: true, shiftKey: true }), CTRL_SHIFT_I, 'Win32')).toBe(
      true,
    );
  });

  it('绑定表与事件两侧任一大小写都能命中（历史表格混用过两种写法）', () => {
    const lower = { ...CTRL_SHIFT_I, key: 'i' };
    expect(matchBinding(ev({ key: 'I', code: 'KeyI', ctrlKey: true, shiftKey: true }), lower, 'Win32')).toBe(true);
    expect(matchBinding(ev({ key: 'i', code: 'KeyI', ctrlKey: true, shiftKey: true }), CTRL_SHIFT_I, 'Win32')).toBe(
      true,
    );
  });

  it('大小写放宽不越界：字母不同依旧不命中', () => {
    expect(matchBinding(ev({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true }), CTRL_SHIFT_I, 'Win32')).toBe(
      false,
    );
  });
});

describe('sameKey — 冲突检测的大小写口径', () => {
  it("'i' 与 'I' 视为同一个键（否则录制会留下两条等价绑定）", () => {
    expect(sameKey('i', 'I')).toBe(true);
    expect(sameKey('Escape', 'escape')).toBe(true);
    expect(sameKey('i', 'o')).toBe(false);
  });
});

describe('normalizeRecordedKey — 录制归一', () => {
  it('Shift+数字 / 小键盘数字都记成数字本身，而不是符号或 "End"', () => {
    expect(normalizeRecordedKey({ key: '!', code: 'Digit1' } as KeyboardEvent)).toBe('1');
    expect(normalizeRecordedKey({ key: 'End', code: 'Numpad1' } as KeyboardEvent)).toBe('1');
  });

  it('其它键原样保留', () => {
    expect(normalizeRecordedKey({ key: 'k', code: 'KeyK' } as KeyboardEvent)).toBe('k');
    expect(normalizeRecordedKey({ key: '`', code: 'Backquote' } as KeyboardEvent)).toBe('`');
  });

  it('code 缺失时退回 e.key（不抛）', () => {
    expect(normalizeRecordedKey({ key: '5', code: '' } as KeyboardEvent)).toBe('5');
  });
});

describe('isCtrlOrCmd', () => {
  const isMac = /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '');

  it.skipIf(isMac)('Windows/Linux 上只有 Ctrl 算', () => {
    expect(isCtrlOrCmd(ev({ ctrlKey: true }))).toBe(true);
    expect(isCtrlOrCmd(ev({ metaKey: true }))).toBe(false);
  });

  it.skipIf(!isMac)('macOS 上 Ctrl 或 Cmd 都算', () => {
    expect(isCtrlOrCmd(ev({ ctrlKey: true }))).toBe(true);
    expect(isCtrlOrCmd(ev({ metaKey: true }))).toBe(true);
  });
});
