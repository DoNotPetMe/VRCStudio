import { create } from 'zustand';
import type { VRCAvatar } from '../types/vrchat';

const STORAGE_KEY = 'vrcstudio_avatar_switcher';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface Persisted {
  pinnedIds: string[];
  recentIds: string[];
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      pinnedIds: Array.isArray(p.pinnedIds) ? p.pinnedIds : [],
      recentIds: Array.isArray(p.recentIds) ? p.recentIds : [],
    };
  } catch {
    return { pinnedIds: [], recentIds: [] };
  }
}

function save(pinnedIds: string[], recentIds: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedIds, recentIds }));
}

interface AvatarSwitcherState {
  isOpen: boolean;
  pinnedIds: string[];
  recentIds: string[];
  cachedAvatars: VRCAvatar[];
  cacheTime: number;

  open: () => void;
  close: () => void;
  toggle: () => void;
  pinAvatar: (id: string) => void;
  unpinAvatar: (id: string) => void;
  togglePin: (id: string) => void;
  recordSwitch: (id: string) => void;
  setCache: (avatars: VRCAvatar[]) => void;
  isCacheStale: () => boolean;
  isPinned: (id: string) => boolean;
}

const initial = load();

export const useAvatarSwitcherStore = create<AvatarSwitcherState>((set, get) => ({
  isOpen: false,
  pinnedIds: initial.pinnedIds,
  recentIds: initial.recentIds,
  cachedAvatars: [],
  cacheTime: 0,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set(s => ({ isOpen: !s.isOpen })),

  pinAvatar: (id) => {
    const pinnedIds = [id, ...get().pinnedIds.filter(p => p !== id)];
    save(pinnedIds, get().recentIds);
    set({ pinnedIds });
  },

  unpinAvatar: (id) => {
    const pinnedIds = get().pinnedIds.filter(p => p !== id);
    save(pinnedIds, get().recentIds);
    set({ pinnedIds });
  },

  togglePin: (id) => {
    get().isPinned(id) ? get().unpinAvatar(id) : get().pinAvatar(id);
  },

  recordSwitch: (id) => {
    const recentIds = [id, ...get().recentIds.filter(r => r !== id)].slice(0, 10);
    save(get().pinnedIds, recentIds);
    set({ recentIds });
  },

  setCache: (avatars) => {
    set({ cachedAvatars: avatars, cacheTime: Date.now() });
  },

  isCacheStale: () => Date.now() - get().cacheTime > CACHE_TTL_MS,

  isPinned: (id) => get().pinnedIds.includes(id),
}));
