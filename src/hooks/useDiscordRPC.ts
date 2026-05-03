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

      // Details (line 1, bold). Always non-empty so Discord shows something.
      const details = user
        ? `${user.displayName}`
        : 'VRChat Companion';

      // State (line 2). Either world name when in a world, or status when not.
      let state: string | undefined;
      let largeImageKey: string | undefined;
      let largeImageText: string | undefined;
      let smallImageKey: string | undefined;
      let smallImageText: string | undefined;

      if (cfg.showWorld && current) {
        const worldName = current.worldName && !current.worldName.startsWith('wrld_')
          ? current.worldName
          : undefined;
        if (worldName) {
          const type = current.instanceType && current.instanceType !== 'public'
            ? ` · ${current.instanceType}` : '';
          state = `In ${worldName}${type}`;
          largeImageText = worldName;
        } else {
          state = 'Loading world…';
        }
        if (current.worldImage) {
          largeImageKey = current.worldImage;
        }
        // When in a world, show user avatar as the small (corner) image.
        if (cfg.showAvatar && user) {
          const avatar = user.profilePicOverride || user.currentAvatarThumbnailImageUrl || user.userIcon;
          if (avatar && avatar.startsWith('https://')) {
            smallImageKey = avatar;
            smallImageText = user.displayName;
          }
        }
      } else if (user) {
        // Not in a world — show online status so the card is never empty.
        const status = user.statusDescription || user.status || 'Online';
        state = status.length >= 2 ? status : 'Online';
        // Use user's avatar/profile pic as the large image so we don't
        // show a blank white ? placeholder.
        const avatar = user.profilePicOverride || user.currentAvatarThumbnailImageUrl || user.userIcon;
        if (avatar && avatar.startsWith('https://')) {
          largeImageKey = avatar;
          largeImageText = user.displayName;
        }
      }

      // Discord requires details/state to be 2-128 chars. Sanitize.
      const safeDetails = details.slice(0, 128);
      const safeState = state && state.length >= 2 ? state.slice(0, 128) : undefined;

      // Discord expects Unix epoch in SECONDS, not milliseconds.
      const startTimestamp = Math.floor(
        (current ? current.joinedAt : sessionStartTs.current) / 1000
      );

      console.log('[useDiscordRPC] pushActivity', {
        details: safeDetails,
        state: safeState,
        largeImageKey: largeImageKey ? `${largeImageKey.slice(0, 80)}…` : undefined,
        smallImageKey: smallImageKey ? `${smallImageKey.slice(0, 80)}…` : undefined,
        startTimestamp,
        inWorld: !!current,
      });

      window.electronAPI!.discordSetActivity({
        details: safeDetails,
        state: safeState,
        largeImageKey,
        largeImageText,
        smallImageKey,
        smallImageText,
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
          // Push immediately — main process queues until 'ready' event fires.
          pushActivity();
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
