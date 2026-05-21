import { create } from 'zustand';
import api from '../api/vrchat';
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';
import type { VRCUser, FriendNote } from '../types/vrchat';
import { useFeedStore } from './feedStore';
import { nextPaletteColor } from '../utils/tagColors';

export interface TagSummary {
  tag: string;
  color: string;
  count: number;
}

interface FriendState {
  onlineFriends: VRCUser[];
  offlineFriends: VRCUser[];
  isLoading: boolean;
  lastUpdated: number | null;
  notes: Record<string, FriendNote>;
  /** tag name -> palette colour id */
  tagColors: Record<string, string>;
  previousLocations: Record<string, string>;

  fetchOnlineFriends: () => Promise<void>;
  fetchOfflineFriends: () => Promise<void>;
  fetchAllFriends: () => Promise<void>;
  setNote: (userId: string, note: string, tags?: string[], color?: string) => void;
  getNote: (userId: string) => FriendNote | undefined;
  getFriend: (userId: string) => VRCUser | undefined;
  setTagColor: (tag: string, colorId: string) => void;
  /** All tags across every note, with colour + usage count, sorted by count desc. */
  getAllTags: () => TagSummary[];
}

const NOTES_KEY = 'vrcstudio_friend_notes';
const PERSISTENT_NOTES_KEY = 'friend_notes'; // Survives app updates
const TAG_COLORS_KEY = 'vrcstudio_friend_tag_colors';
const PERSISTENT_TAG_COLORS_KEY = 'friend_tag_colors';

function loadNotes(): Record<string, FriendNote> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<string, FriendNote>) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  // Also save to persistent storage (survives app updates)
  savePersistentData(PERSISTENT_NOTES_KEY, notes)
    .catch(e => console.warn('[FriendStore] Failed to persist notes:', e));
}

function loadTagColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TAG_COLORS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTagColors(tagColors: Record<string, string>) {
  localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(tagColors));
  savePersistentData(PERSISTENT_TAG_COLORS_KEY, tagColors)
    .catch(e => console.warn('[FriendStore] Failed to persist tag colours:', e));
}

export const useFriendStore = create<FriendState>((set, get) => ({
  onlineFriends: [],
  offlineFriends: [],
  isLoading: false,
  lastUpdated: null,
  notes: loadNotes(),
  tagColors: loadTagColors(),
  previousLocations: {},

  fetchOnlineFriends: async () => {
    try {
      const friends = await api.getAllOnlineFriends();
      const oldFriends = get().onlineFriends;
      const prevLocations = get().previousLocations;
      const feed = useFeedStore.getState();
      // Skip change events on the very first fetch — oldFriends is empty and
      // firing friend_online for every friend would spam notifications on startup.
      const isFirstFetch = get().lastUpdated === null;

      const oldMap = new Map(oldFriends.map(f => [f.id, f]));

      for (const friend of friends) {
        const old = oldMap.get(friend.id);
        if (!old && !isFirstFetch) {
          feed.addEvent({
            type: 'friend_online',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            details: friend.statusDescription,
          });
        } else if (!isFirstFetch && old && old.location !== friend.location && friend.location !== 'private' && friend.location) {
          const newWorldId = friend.location.split(':')[0];
          const oldWorldId = old.location?.split(':')[0];

          feed.addEvent({
            type: 'friend_location',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            worldId: newWorldId,
            details: `Moved to a new instance`,
            previousValue: prevLocations[friend.id],
            newValue: friend.location,
          });

        }

        if (!isFirstFetch && old && old.status !== friend.status) {
          feed.addEvent({
            type: 'friend_status',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            previousValue: old.status,
            newValue: friend.status,
          });
        }
      }

      if (!isFirstFetch) {
        for (const old of oldFriends) {
          if (!friends.find(f => f.id === old.id)) {
            feed.addEvent({
              type: 'friend_offline',
              userId: old.id,
              userName: old.displayName,
              userAvatar: old.currentAvatarThumbnailImageUrl,
            });
          }
        }
      }

      const newPrevLocations: Record<string, string> = {};
      for (const f of friends) {
        if (f.location) newPrevLocations[f.id] = f.location;
      }

      set({
        onlineFriends: friends,
        lastUpdated: Date.now(),
        previousLocations: newPrevLocations,
      });
    } catch (err) {
      console.error('Failed to fetch online friends:', err);
    }
  },

  fetchOfflineFriends: async () => {
    try {
      const friends = await api.getAllOfflineFriends();
      set({ offlineFriends: friends });
    } catch (err) {
      console.error('Failed to fetch offline friends:', err);
    }
  },

  fetchAllFriends: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().fetchOnlineFriends(),
      get().fetchOfflineFriends(),
    ]);
    set({ isLoading: false });
  },

  setNote: (userId, note, tags = [], color) => {
    const notes = { ...get().notes };
    notes[userId] = { userId, note, tags, color, updatedAt: Date.now() };
    saveNotes(notes);
    set({ notes });

    // Make sure every tag has a colour assigned. New tags get the
    // least-used palette colour so they stay visually distinct.
    const tagColors = { ...get().tagColors };
    let changed = false;
    for (const t of tags) {
      if (!tagColors[t]) {
        tagColors[t] = nextPaletteColor(Object.values(tagColors));
        changed = true;
      }
    }
    if (changed) {
      saveTagColors(tagColors);
      set({ tagColors });
    }
  },

  getNote: (userId) => get().notes[userId],

  getFriend: (userId) => {
    return get().onlineFriends.find(f => f.id === userId)
      || get().offlineFriends.find(f => f.id === userId);
  },

  setTagColor: (tag, colorId) => {
    const tagColors = { ...get().tagColors, [tag]: colorId };
    saveTagColors(tagColors);
    set({ tagColors });
  },

  getAllTags: () => {
    const { notes, tagColors } = get();
    const counts = new Map<string, number>();
    for (const n of Object.values(notes)) {
      for (const t of n.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count, color: tagColors[tag] ?? 'accent' }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  },
}));
