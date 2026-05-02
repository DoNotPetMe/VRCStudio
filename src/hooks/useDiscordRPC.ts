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
  const sessionStartTs = useRef(Date.now());
  const lastClientId = useRef('');

  useEffect(() => {
    if (!window.electronAPI) return;

    function pushActivity() {
      if (!window.electronAPI || !initialized.current) return;
      const cfg = readConfig();
      const user = useAuthStore.getState().user;
      const current = useInstanceHistoryStore.getState().currentInstance;

      // First line: who you are
      const details = user
        ? `${user.displayName} · ${user.statusDescription || user.status || 'Online'}`
        : 'Playing VRChat';

      // Second line: world name + instance type, only when in a world.
      // Show the raw worldId while the name is still loading (starts with wrld_).
      let state: string | undefined;
      let largeImageKey: string | undefined;
      let largeImageText: string | undefined;

      if (cfg.showWorld && current) {
        const worldName = current.worldName && !current.worldName.startsWith('wrld_')
          ? current.worldName
          : undefined;
        if (worldName) {
          const type = current.instanceType && current.instanceType !== 'public'
            ? ` (${current.instanceType})` : '';
          state = `${worldName}${type}`;
          largeImageText = worldName;
        }
        if (current.worldImage) {
          largeImageKey = current.worldImage;
        }
      }

      // Discord expects Unix epoch in SECONDS, not milliseconds.
      const startTimestamp = Math.floor(
        (current ? current.joinedAt : sessionStartTs.current) / 1000
      );

      window.electronAPI!.discordSetActivity({
        details,
        state,
        largeImageKey,
        largeImageText,
        startTimestamp,
        instance: !!current,
      });
    }

    function applyConfig() {
      const cfg = readConfig();
      const auth = useAuthStore.getState();

      if (cfg.enabled && auth.isLoggedIn && cfg.clientId) {
        if (!initialized.current || lastClientId.current !== cfg.clientId) {
          window.electronAPI!.discordInit(cfg.clientId);
          initialized.current = true;
          lastClientId.current = cfg.clientId;
          sessionStartTs.current = Date.now();
          setTimeout(pushActivity, 2000);
        } else {
          pushActivity();
        }
      } else if ((!cfg.enabled || !cfg.clientId) && initialized.current) {
        window.electronAPI!.discordDisconnect();
        initialized.current = false;
        lastClientId.current = '';
      }
    }

    applyConfig();

    // Poll every 5s to pick up settings changes (localStorage events don't fire
    // for same-window writes in Electron's single-renderer setup)
    const pollId = setInterval(applyConfig, 5000);

    // Push activity whenever auth (status, displayName) or instance (world join/leave) changes
    const unsubAuth = useAuthStore.subscribe(() => {
      if (initialized.current) pushActivity();
    });
    const unsubInstance = useInstanceHistoryStore.subscribe(() => {
      if (initialized.current) pushActivity();
    });

    return () => {
      clearInterval(pollId);
      unsubAuth();
      unsubInstance();
      if (initialized.current) {
        window.electronAPI?.discordDisconnect();
        initialized.current = false;
        lastClientId.current = '';
      }
    };
  }, []);
}
