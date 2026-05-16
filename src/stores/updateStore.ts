// Tracks update-check state. The actual download/apply work happens in
// the Electron main process; we just hold the latest check result here
// and expose simple actions for the UI to call.

import { create } from 'zustand';

export interface UpdateCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface UpdateInfo {
  currentCommit: string | null;
  latestCommit: string;
  behind: number;
  upToDate: boolean;
  unknown?: boolean;
  latestMessage?: string | null;
  latestDate?: string | null;
  commits: UpdateCommit[];
}

export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'preparing' | 'restarting' | 'error' | 'up-to-date';

interface UpdateState {
  stage: UpdateStage;
  info: UpdateInfo | null;
  error: string | null;
  progress: { received: number; total: number } | null;
  lastCheckedAt: number | null;

  check: (silent?: boolean) => Promise<void>;
  apply: () => Promise<void>;
  dismissBanner: () => void;
  bannerDismissed: boolean;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  stage: 'idle',
  info: null,
  error: null,
  progress: null,
  lastCheckedAt: null,
  bannerDismissed: false,

  check: async (silent = false) => {
    if (!window.electronAPI?.updateCheck) {
      if (!silent) set({ stage: 'error', error: 'Updater is only available in the desktop app.' });
      return;
    }
    if (!silent) set({ stage: 'checking', error: null });
    try {
      const result = await window.electronAPI.updateCheck();
      if (!result.ok) {
        set({ stage: 'error', error: result.error ?? 'Update check failed' });
        return;
      }
      const info: UpdateInfo = {
        currentCommit: result.currentCommit,
        latestCommit: result.latestCommit,
        behind: result.behind,
        upToDate: result.upToDate,
        unknown: result.unknown,
        latestMessage: result.latestMessage,
        latestDate: result.latestDate,
        commits: result.commits,
      };
      set({
        info,
        stage: result.upToDate ? 'up-to-date' : 'available',
        lastCheckedAt: Date.now(),
        bannerDismissed: false,
        error: null,
      });
    } catch (err: any) {
      set({ stage: 'error', error: err?.message ?? String(err) });
    }
  },

  apply: async () => {
    if (!window.electronAPI?.updateDownloadAndApply) return;
    set({ stage: 'downloading', progress: { received: 0, total: 0 }, error: null });
    const unsubscribe = window.electronAPI.onUpdateProgress?.((msg) => {
      set({
        stage: msg.stage as UpdateStage,
        progress: { received: msg.received, total: msg.total },
      });
    });
    try {
      const result = await window.electronAPI.updateDownloadAndApply();
      if (!result.ok) {
        set({ stage: 'error', error: result.error ?? 'Update failed' });
        unsubscribe?.();
      }
      // On success the helper script takes over and the app quits.
    } catch (err: any) {
      set({ stage: 'error', error: err?.message ?? String(err) });
      unsubscribe?.();
    }
  },

  dismissBanner: () => set({ bannerDismissed: true }),
}));

// Used by App.tsx — runs once at startup to populate stage/info so the
// banner can decide whether to show.
export async function checkForUpdatesOnStartup() {
  const store = useUpdateStore.getState();
  // Only run if the renderer can actually reach the IPC layer (desktop build).
  if (!window.electronAPI?.updateCheck) return;
  await store.check(true);
}
