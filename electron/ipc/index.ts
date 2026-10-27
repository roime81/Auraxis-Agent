import { auraWindowManager } from './window-manager';

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

  secureHandle('window:toggleOrb', (_event, enabled: boolean) => {
    auraWindowManager.setCompanionEnabled(enabled);
    return { ok: true };
  });

  secureHandle('window:getOrbState', () => {
    return {
      ok: true,
      data: {
        enabled: !auraWindowManager['state']?.companionDisabled,
      },
    };
  });
}
