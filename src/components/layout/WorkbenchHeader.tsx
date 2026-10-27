import { Sparkles } from '@/components/common/icons';

const toggleOrb = () => {
  const api = (window as any).electronAPI;
  if (!api) return;

  if (api.getOrbState) {
    api.getOrbState().then((state: { enabled?: boolean }) => {
      const next = !(state?.enabled ?? true);
      api.toggleOrb(next);
    });
    return;
  }

  api.toggleOrb?.(true);
};

<button
  className={clsx(
    'ax-header-action relative text-sm',
    activeToolView === 'orb' && '!bg-primary-soft !text-primary',
  )}
  onClick={toggleOrb}
  title="Toggle Blablabla orb"
>
  <Sparkles size={12} />
</button>
