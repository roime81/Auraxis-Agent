import { PanelRight } from '@/components/common/icons';
import { useAppStore } from '@/stores/useAppStore';
import clsx from 'clsx';
import { useT } from '../../i18n';

/**
 * One-click workbench panel toggle.
 *
 * 打开时进入「功能列表」（menu）而不是直接进某个详情：首次点开先看到全部功能
 * 自上而下的清单，点某一项才进入该功能；再次打开会回到上次停留的功能
 * （因为关闭面板不会清空 rightPanelView）。
 */
export default function WorkbenchActionsButton() {
  const t = useT();
  const showRightPanel = useAppStore((s) => s.showRightPanel);
  const rightPanelView = useAppStore((s) => s.rightPanelView);
  const unseen = useAppStore((s) => s.rightPanelUnseen);
  const active = showRightPanel && rightPanelView !== 'none';
  // 面板关着且有新内容（Agent 打开了网页）才亮提示点：不抢屏，但要让人看得见。
  const showDot = unseen && !active;

  const togglePanel = () => {
    const store = useAppStore.getState();
    if (store.showRightPanel && store.rightPanelView !== 'none') {
      store.toggleRightPanel();
      return;
    }
    if (store.rightPanelView === 'none') store.setRightPanelView('menu');
    if (!store.showRightPanel) store.toggleRightPanel();
  };

  return (
    <button
      type="button"
      // 稳定钩子：关闭面板时焦点回位到这里（见 WorkbenchLayout 的 focus-return effect），
      // 不依赖按钮的可访问名（它会随未读状态变化）。
      data-workbench-toggle=""
      className={clsx('ax-header-action relative text-sm', active && '!bg-primary-soft !text-primary')}
      onClick={togglePanel}
      aria-label={showDot ? t('workbench.unseenContent') : t('workbench.actions')}
      aria-pressed={active}
      title={showDot ? t('workbench.unseenContent') : t('workbench.actions')}
    >
      <PanelRight weight={active ? 'fill' : 'regular'} />
      {showDot && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger" />}
    </button>
  );
}
