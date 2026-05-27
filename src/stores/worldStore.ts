import { create } from 'zustand';
import api from '../api/vrchat';
import type { VRCWorld, VRCInstance } from '../types/vrchat';

interface WorldState {
  searchResults: VRCWorld[];
  activeWorlds: VRCWorld[];
  recentWorlds: VRCWorld[];
  favoriteWorlds: VRCWorld[];
  worldCache: Record<string, VRCWorld>;
  instanceCache: Record<string, VRCInstance>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;

  searchWorlds: (query: string) => Promise<void>;
  fetchActiveWorlds: () => Promise<void>;
  fetchRecentWorlds: () => Promise<void>;
  fetchFavoriteWorlds: () => Promise<void>;
  getWorld: (worldId: string) => Promise<VRCWorld>;
  getInstance: (worldId: string, instanceId: string) => Promise<VRCInstance>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  searchResults: [],
  activeWorlds: [],
  recentWorlds: [],
  favoriteWorlds: [],
  worldCache: {},
  instanceCache: {},
  isLoading: false,
  error: null,
  searchQuery: '',

  clearError: () => set({ error: null }),

  searchWorlds: async (query) => {
    set({ isLoading: true, searchQuery: query, error: null });
    try {
      const results = await api.searchWorlds({ query, count: 30, sort: 'relevance' });
      const cache = { ...get().worldCache };
      results.forEach(w => { cache[w.id] = w; });
      set({ searchResults: results, worldCache: cache, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Search failed — check your connection and try again' });
    }
  },

  fetchActiveWorlds: async () => {
    set({ isLoading: true, error: null });
    try {
      const worlds = await api.getActiveWorlds(30);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ activeWorlds: worlds, worldCache: cache, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Failed to load worlds — check your connection' });
    }
  },

  fetchRecentWorlds: async () => {
    try {
      const worlds = await api.getRecentWorlds(30);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ recentWorlds: worlds, worldCache: cache });
    } catch (e) {
      set({ error: 'Failed to load recent worlds' });
    }
  },

  fetchFavoriteWorlds: async () => {
    try {
      const worlds = await api.getFavoriteWorlds(50);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ favoriteWorlds: worlds, worldCache: cache });
    } catch (e) {
      set({ error: 'Failed to load favorite worlds' });
    }
  },

  getWorld: async (worldId) => {
    // Cache may contain a LimitedWorld from list/search endpoints — those
    // never include `instances`. Only treat the cache as authoritative when
    // we already have the full World response (i.e. `instances` is set).
    const cached = get().worldCache[worldId];
    if (cached && Array.isArray(cached.instances)) return cached;

    const world = await api.getWorld(worldId);
    set((state) => ({
      worldCache: { ...state.worldCache, [worldId]: world },
    }));
    return world;
  },

  getInstance: async (worldId, instanceId) => {
    const key = `${worldId}:${instanceId}`;
    const cached = get().instanceCache[key];
    if (cached) return cached;

    const instance = await api.getInstance(worldId, instanceId);
    set((state) => ({
      instanceCache: { ...state.instanceCache, [key]: instance },
    }));
    return instance;
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
}));

