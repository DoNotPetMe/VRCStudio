// Single subscription to the Electron log tail. Fans the incoming line
// stream out to every store that needs to consume it (video player history,
// live instance avatars, future log-mining features). Replaces the old
// useVideoPlayerTracking hook.
//
// Each store exposes an `ingestLines(lines: string[])` method; we call them
// all on every batch. Stores are cheap regex-only consumers — no async work
// on the hot path.
//
// Also keeps the "current instance" context in sync from
// instanceHistoryStore → videoPlayerStore so newly-parsed URLs/avatars get
// pinned to the right room.

import { useEffect } from 'react';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

export function useLogIngestion() {
  const current = useInstanceHistoryStore(s => s.currentInstance);
  const setVideoCtx = useVideoPlayerStore(s => s.setContext);
  const setTailingStatus = useVideoPlayerStore(s => s.setTailingStatus);

  // Sync current instance into the video store (and reset avatar tracking
  // whenever the user moves to a different instance).
  useEffect(() => {
    if (current) {
      setVideoCtx({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
      useInstanceAvatarsStore.getState().setInstanceContext({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
    }
  }, [current?.id, setVideoCtx]);

  // Start log tailing + fan-out subscription.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.logStartTailing || !api?.onVRChatLogLines) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const fanOut = (lines: string[]) => {
      // Pull store actions fresh each call so we always have the latest
      // closure values without re-subscribing.
      useVideoPlayerStore.getState().ingestLines(lines);
      useInstanceAvatarsStore.getState().ingestLines(lines);
    };

    (async () => {
      try {
        const backlog = await api.logReadBacklog?.(2000);
        if (backlog?.success && backlog.lines && !cancelled) {
          fanOut(backlog.lines);
        }

        const result = await api.logStartTailing();
        if (cancelled) return;
        setTailingStatus(!!result.success, result.path);
        if (!result.success) return;

        unlisten = api.onVRChatLogLines(fanOut);
      } catch (err) {
        console.error('[useLogIngestion] failed to start:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      api.logStopTailing?.().catch(() => {});
      setTailingStatus(false);
    };
  }, [setTailingStatus]);
}
