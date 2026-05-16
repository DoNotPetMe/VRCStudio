import { create } from 'zustand';

export interface InstanceHistoryEntry {
  id: string;
  worldId: string;
  instanceId: string;
  worldName: string;
  worldImage: string;
  instanceType: string;
  groupId?: string;
  joinedAt: number;
  leftAt?: number;
}

const STORAGE_KEY = 'vrcstudio_instance_history';

/**
 * Merge runs of consecutive same-instance entries into one row. The
 * previous version of this hook was creating a new history entry on
 * every location poll, which left users with hundreds of dupes pinned
 * to the same world. This compacts the existing data on app load so
 * the page renders cleanly without forcing the user to clear history.
 */
function compactHistory(entries: InstanceHistoryEntry[]): InstanceHistoryEntry[] {
  if (entries.length === 0) return entries;
  const sorted = [...entries].sort((a, b) => b.joinedAt - a.joinedAt);
  const out: InstanceHistoryEntry[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.worldId === e.worldId &&
      last.instanceId === e.instanceId &&
      // The two rows touch (no real gap, or the previous row's leftAt
      // was within 5 minutes of this row's joinedAt).
      Math.abs((last.joinedAt) - (e.leftAt ?? e.joinedAt)) < 5 * 60_000
    ) {
      // Merge: extend the existing row's joinedAt back to the older one's
      // joinedAt, keep the newer leftAt.
      last.joinedAt = Math.min(last.joinedAt, e.joinedAt);
      if (!last.leftAt && e.leftAt) last.leftAt = e.leftAt;
      // Prefer richer metadata if the older row had a real world name.
      if (!last.worldName.startsWith('wrld_') && last.worldName) {
        // keep last's better name
      } else if (e.worldName && !e.worldName.startsWith('wrld_')) {
        last.worldName = e.worldName;
        if (e.worldImage) last.worldImage = e.worldImage;
      }
      continue;
    }
    out.push({ ...e });
  }
  // Preserve the original sort (newest first).
  return out;
}

function loadHistory(): InstanceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InstanceHistoryEntry[];
    const compacted = compactHistory(parsed);
    // Persist the compacted form if we actually changed anything, so the
    // cleanup is permanent rather than re-run on every load.
    if (compacted.length !== parsed.length) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted.slice(0, 100))); } catch {}
    }
    return compacted;
  } catch {
    return [];
  }
}

function saveHistory(entries: InstanceHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100)));
}

interface InstanceHistoryState {
  history: InstanceHistoryEntry[];
  currentInstance: InstanceHistoryEntry | null;

  trackJoin: (entry: Omit<InstanceHistoryEntry, 'id' | 'joinedAt'>) => void;
  trackLeave: () => void;
  getRecent: (count?: number) => InstanceHistoryEntry[];
  clearHistory: () => void;
}

export const useInstanceHistoryStore = create<InstanceHistoryState>((set, get) => ({
  history: loadHistory(),
  currentInstance: null,

  trackJoin: (entry) => {
    const state = get();
    const now = Date.now();

    // De-dupe: if we're already "in" this exact instance, do nothing.
    // The location poll can fire many times for the same room — we should
    // only ever create one history row per actual join.
    if (
      state.currentInstance &&
      state.currentInstance.worldId === entry.worldId &&
      state.currentInstance.instanceId === entry.instanceId
    ) {
      return;
    }

    // De-dupe: if the most recent history row is the same instance and
    // closed less than 60s ago, treat this as a continuation of that
    // session rather than a brand new visit. (Happens when the location
    // string briefly hiccups between polls.)
    const latest = state.history[0];
    if (
      latest &&
      latest.worldId === entry.worldId &&
      latest.instanceId === entry.instanceId &&
      latest.leftAt &&
      now - latest.leftAt < 60_000
    ) {
      const revived = { ...latest, leftAt: undefined };
      const updated = [revived, ...state.history.slice(1)];
      set({ currentInstance: revived, history: updated });
      saveHistory(updated);
      return;
    }

    // Close the previous current instance (if any) before opening a new one.
    state.trackLeave();

    const newEntry: InstanceHistoryEntry = {
      ...entry,
      id: `inst_${now}_${Math.random().toString(36).slice(2)}`,
      joinedAt: now,
    };

    const updated = [newEntry, ...get().history];
    set({ currentInstance: newEntry, history: updated });
    saveHistory(updated);
  },

  trackLeave: () => {
    const current = get().currentInstance;
    if (current) {
      const updated = get().history.map(h =>
        h.id === current.id ? { ...h, leftAt: Date.now() } : h
      );
      set({ history: updated, currentInstance: null });
      saveHistory(updated);
    }
  },

  getRecent: (count = 10) => get().history.slice(0, count),

  clearHistory: () => {
    set({ history: [], currentInstance: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
