import { create } from 'zustand';

const STORAGE_KEY = 'vrcstudio_starred_friends';

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

interface StarredFriendsState {
  starredIds: string[];
  toggleStar: (userId: string) => void;
  isStarred: (userId: string) => boolean;
}

export const useStarredFriendsStore = create<StarredFriendsState>((set, get) => ({
  starredIds: load(),

  toggleStar: (userId) => {
    const current = get().starredIds;
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    save(updated);
    set({ starredIds: updated });
  },

  isStarred: (userId) => get().starredIds.includes(userId),
}));
