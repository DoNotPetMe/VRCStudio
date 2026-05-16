// Wires the videoPlayerStore to:
//   1. The Electron log tailer — starts tailing on mount, ingests lines.
//   2. The instanceHistoryStore — keeps the "current world/instance" context
//      in sync so newly-parsed video URLs are pinned to the right room.
//
// Mounted once at the App level. Safe to call without Electron (no-ops).

import { useEffect } from 'react';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

export function useVideoPlayerTracking() {
  const current = useInstanceHistoryStore(s => s.currentInstance);
  const setContext = useVideoPlayerStore(s => s.setContext);
  const ingestLines = useVideoPlayerStore(s => s.ingestLines);
  const setTailingStatus = useVideoPlayerStore(s => s.setTailingStatus);

  // Push current instance into the video store any time it changes.
  useEffect(() => {
    if (current) {
      setContext({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
    }
  }, [current?.id, setContext]);

  // Start log tailing + subscribe to incoming line batches.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.logStartTailing || !api?.onVRChatLogLines) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        // Read a slice of backlog FIRST so the user sees videos that were
        // already played this session even if they only just opened the app.
        const backlog = await api.logReadBacklog?.(2000);
        if (backlog?.success && backlog.lines && !cancelled) {
          ingestLines(backlog.lines);
        }

        const result = await api.logStartTailing();
        if (cancelled) return;
        setTailingStatus(!!result.success, result.path);
        if (!result.success) return;

        unlisten = api.onVRChatLogLines((lines) => {
          ingestLines(lines);
        });
      } catch (err) {
        console.error('[VideoPlayerTracking] failed to start:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      api.logStopTailing?.().catch(() => {});
      setTailingStatus(false);
    };
  }, [ingestLines, setTailingStatus]);
}
