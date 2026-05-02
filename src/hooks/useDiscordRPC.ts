import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

interface DiscordConfig {
  enabled: boolean;
  clientId: string;
  showWorld: boolean;
  showAvatar: boolean;
}

function readConfig(): DiscordConfig {
  try {
    const raw = localStorage.getItem('vrcstudio_discord');
    const p = raw ? JSON.parse(raw) : {};
    return {
      enabled: p.enabled ?? false,
      clientId: p.clientId || '',
      showWorld: p.showWorld ?? true,
      showAvatar: p.showAvatar ?? true,
    };
  } catch {
    return { enabled: false, clientId: '', showWorld: true, showAvatar: true };
  }
}

export function useDiscordRPC() {
  const initialized = useRef(false);
  const startTs = useRef(Date.now());

  useEffect(() => {
    if (!window.electronAPI) return;

    function pushActivity() {
      if (!window.electronAPI || !initialized.current) return;
      const cfg = readConfig();
      const user = useAuthStore.getState().user;
      const current = useInstanceHistoryStore.getState().currentInstance;

      window.electronAPI.discordSetActivity({
        details: user ? `Playing as ${user.displayName}` : 'In VRChat',
        state: cfg.showWorld && current?.worldName
          ? `In ${current.worldName}`
          : (user?.statusDescription || 'Online'),
        largeImageKey: 'vrchat_logo',
        largeImageText: 'VRChat',
        startTimestamp: startTs.current,
        instance: !!current,
      });
    }

    function applyConfig() {
      const cfg = readConfig();
      const auth = useAuthStore.getState();

      if (cfg.enabled && auth.isLoggedIn) {
        if (!initialized.current) {
          window.electronAPI!.discordInit(cfg.clientId || '');
          initialized.current = true;
          startTs.current = Date.now();
        }
        pushActivity();
      } else if (!cfg.enabled && initialized.current) {
        window.electronAPI!.discordDisconnect();
        initialized.current = false;
      }
    }

    applyConfig();

    // Poll every 5s to pick up settings changes (localStorage events don't fire
    // for same-window writes in Electron's single-renderer setup)
    const pollId = setInterval(applyConfig, 5000);

    // Push activity updates whenever the auth store changes (location, status)
    const unsub = useAuthStore.subscribe(() => {
      if (initialized.current) pushActivity();
    });

    return () => {
      clearInterval(pollId);
      unsub();
      if (initialized.current) {
        window.electronAPI?.discordDisconnect();
        initialized.current = false;
      }
    };
  }, []);
}
