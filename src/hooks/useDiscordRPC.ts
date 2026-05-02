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

function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just joined';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function useDiscordRPC() {
  const initialized = useRef(false);
  const startTs = useRef(Date.now());
  const lastClientId = useRef('');

  useEffect(() => {
    if (!window.electronAPI) return;

    function pushActivity() {
      if (!window.electronAPI || !initialized.current) return;
      const cfg = readConfig();
      const user = useAuthStore.getState().user;
      const current = useInstanceHistoryStore.getState().currentInstance;

      // details = first line (bold) — who you are
      const details = user
        ? `${user.displayName} · ${user.statusDescription || user.status || 'Online'}`
        : 'Playing VRChat';

      // state = second line — where you are
      let state: string;
      if (cfg.showWorld && current?.worldName) {
        const dur = fmtDuration(Date.now() - current.joinedAt);
        const type = current.instanceType !== 'public' ? ` (${current.instanceType})` : '';
        state = `${current.worldName}${type} · ${dur}`;
      } else {
        state = 'In menus';
      }

      // Use the world thumbnail URL directly — Discord supports external URLs
      // since 2022, no need to pre-upload assets
      const worldImageUrl = current?.worldImage || null;

      window.electronAPI!.discordSetActivity({
        details,
        state,
        largeImageKey: worldImageUrl || 'vrchat_logo',
        largeImageText: current?.worldName || 'VRChat',
        startTimestamp: startTs.current,
        instance: !!current,
      });
    }

    function applyConfig() {
      const cfg = readConfig();
      const auth = useAuthStore.getState();

      if (cfg.enabled && auth.isLoggedIn && cfg.clientId) {
        // Re-init only if clientId changed
        if (!initialized.current || lastClientId.current !== cfg.clientId) {
          window.electronAPI!.discordInit(cfg.clientId);
          initialized.current = true;
          lastClientId.current = cfg.clientId;
          startTs.current = Date.now();
          // Give the RPC a moment to connect before pushing activity
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

    // Push activity updates whenever auth store changes (location, status)
    const unsub = useAuthStore.subscribe(() => {
      if (initialized.current) pushActivity();
    });

    return () => {
      clearInterval(pollId);
      unsub();
      if (initialized.current) {
        window.electronAPI?.discordDisconnect();
        initialized.current = false;
        lastClientId.current = '';
      }
    };
  }, []);
}
