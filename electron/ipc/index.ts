import { auraWindowManager } from '../window-manager';

function registerWindowShellHandlers() {
  secureHandle('window:openOrbPage', (_event, url: string) => {
    if (!url) return { ok: false, error: 'Missing url' };
    return { ok: auraWindowManager.openWebPage(url) };
  });

  secureHandle('window:closeOrbPage', () => {
    auraWindowManager.closeWebPage();
    return { ok: true };
  });

  secureHandle('window:backToChat', () => {
    auraWindowManager.backToChat();
    return { ok: true };
  });

  secureHandle('window:showOrb', () => {
    auraWindowManager.showCompanionWindow();
    return { ok: true };
  });

  secureHandle('window:hideOrb', () => {
    auraWindowManager.hideCompanionWindow();
    return { ok: true };
  });

  secureHandle('window:minimizeOrb', () => {
    auraWindowManager.minimizeCompanionWindow();
    return { ok: true };
  });

  secureHandle('window:restoreOrb', () => {
    auraWindowManager.restoreCompanionWindow();
    return { ok: true };
  });

  secureHandle('window:moveOrb', (_event, x: number, y: number) => {
    auraWindowManager.moveCompanionTo(Number(x), Number(y));
    return { ok: true };
  });

  secureHandle('window:getOrbBounds', () => {
    const orb = auraWindowManager.getFloatingWindow();
    if (!orb || orb.isDestroyed()) return { ok: true, data: { x: 0, y: 0 } };
    const { x, y } = orb.getBounds();
    return { ok: true, data: { x, y } };
  });

  secureHandle('window:toggleOrb', (_event, enabled: boolean) => {
    auraWindowManager.setCompanionEnabled(enabled);
    return { ok: true };
  });

  secureHandle('window:getOrbState', () => {
    const orb = auraWindowManager.getFloatingWindow();
    return {
      ok: true,
      data: {
        enabled: !auraWindowManager['state']?.companionDisabled,
        visible: !!orb && !orb.isDestroyed() && orb.isVisible(),
      },
    };
  });
}
