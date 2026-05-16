// Two-way bridge between the renderer and the Discord bot in main.
//
// Push direction (renderer → main):
//   Every few seconds (and whenever a key store changes) we send a compact
//   snapshot of the live app state to the bot so its read-only slash
//   commands (/whoami, /world, /players, /friends, /videos) can answer
//   instantly without burning extra VRChat API calls.
//
// Pull direction (main → renderer):
//   When a slash command needs to *do* something — change status, swap
//   avatar, send a chatbox message — main fires `bot:executeAction`. We
//   handle it here using the existing api / OSC layer and report back
//   with bot:actionResult.
//
// Also auto-starts the bot on app launch when the user enabled that.

import { useEffect, useRef } from 'react';
import { useDiscordBotStore } from '../stores/discordBotStore';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useOSCStore } from '../stores/oscStore';
import api from '../api/vrchat';

const SYNC_INTERVAL_MS = 8000; // push a snapshot every ~8s

function buildSnapshot() {
  const user = useAuthStore.getState().user;
  const onlineFriends = useFriendStore.getState().onlineFriends;
  const inst = useInstanceHistoryStore.getState().currentInstance;
  const players = Object.values(useInstanceAvatarsStore.getState().byPlayer);
  const videos = useVideoPlayerStore.getState().getRecent(10);

  return {
    user: user
      ? {
          id: user.id,
          displayName: user.displayName,
          status: user.status,
          statusDescription: user.statusDescription,
          currentAvatar: user.currentAvatar,
          currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl,
          bio: (user as any).bio,
          trustRank: (user as any).$trustLevel,
        }
      : undefined,
    instance: inst
      ? {
          worldId: inst.worldId,
          worldName: inst.worldName,
          worldImage: inst.worldImage,
          instanceId: inst.instanceId,
          instanceType: inst.instanceType,
          joinedAt: inst.joinedAt,
        }
      : null,
    onlineFriends: onlineFriends.slice(0, 80).map(f => ({
      id: f.id,
      displayName: f.displayName,
      status: f.status,
      statusDescription: f.statusDescription,
      location: f.location,
    })),
    instancePlayers: players.slice(0, 80).map(p => ({
      playerName: p.playerName,
      avatarId: p.avatarId,
      avatarName: p.avatarName,
      rank: p.rank,
      stats: p.stats ? { triangles: p.stats.triangles, materials: p.stats.materials } : undefined,
    })),
    recentVideos: videos.map(v => ({ url: v.url, label: v.label, timestamp: v.timestamp })),
  };
}

// Performs whichever action the bot asked for and reports the result back.
async function handleAction(payload: { id: string; action: string; payload: any }) {
  let result: { ok: boolean; error?: string; data?: any };
  try {
    switch (payload.action) {
      case 'updateStatus': {
        const user = useAuthStore.getState().user;
        if (!user?.id) {
          result = { ok: false, error: 'Not signed in' };
          break;
        }
        await api.updateStatus(user.id, payload.payload.status, payload.payload.message ?? '');
        await useAuthStore.getState().refreshUser();
        result = { ok: true };
        break;
      }
      case 'selectAvatar': {
        await api.selectAvatar(payload.payload.avatarId);
        result = { ok: true };
        break;
      }
      case 'oscChatbox': {
        await useOSCStore.getState().send('/chatbox/input', [payload.payload.text, true, false]);
        result = { ok: true };
        break;
      }
      case 'getAvatar': {
        const a: any = await api.getAvatar(payload.payload.avatarId);
        result = a
          ? {
              ok: true,
              data: {
                name: a.name,
                authorName: a.authorName,
                description: a.description,
                thumbnailImageUrl: a.thumbnailImageUrl ?? a.imageUrl,
              },
            }
          : { ok: false, error: 'Avatar not found' };
        break;
      }
      default:
        result = { ok: false, error: `Unknown action: ${payload.action}` };
    }
  } catch (err: any) {
    result = { ok: false, error: err?.message ?? String(err) };
  }
  window.electronAPI?.botActionResult?.({ id: payload.id, ...result });
}

export function useDiscordBotBridge() {
  const config = useDiscordBotStore(s => s.config);
  const start = useDiscordBotStore(s => s.start);
  const refreshStatus = useDiscordBotStore(s => s.refreshStatus);
  const startedRef = useRef(false);

  // Auto-start once on launch if the user enabled it.
  useEffect(() => {
    if (startedRef.current) return;
    if (!config.autoStart) return;
    if (!config.token) return;
    if (!window.electronAPI?.botStart) return;
    startedRef.current = true;
    start().catch(() => {});
  }, [config.autoStart, config.token, start]);

  // Listen for bot:executeAction events from main.
  useEffect(() => {
    const off = window.electronAPI?.onBotExecuteAction?.(handleAction);
    return () => { off?.(); };
  }, []);

  // Periodically push state snapshots so the bot stays fresh.
  useEffect(() => {
    if (!window.electronAPI?.botSyncState) return;
    const push = () => {
      try { window.electronAPI!.botSyncState(buildSnapshot()); } catch {}
    };
    push();
    const id = setInterval(push, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Refresh status indicator periodically so the Settings panel UI stays
  // up to date without us having to plumb live events.
  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 10_000);
    return () => clearInterval(id);
  }, [refreshStatus]);
}
