// Holds Discord bot config (token, auto-start flag) plus a cached copy of
// the bot's connection status. The actual bot runs in the Electron main
// process — this store is the renderer's view of it.
//
// Persistence: token + autoStart go through the persistent storage IPC so
// they survive app restarts. Bot status is volatile.

import { create } from 'zustand';
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';

const STORAGE_KEY = 'discord_bot_config';

interface BotConfig {
  token: string;
  autoStart: boolean;
}

interface BotStatus {
  connected: boolean;
  botTag: string | null;
  guildCount: number;
  ping: number | null;
  lastError: string | null;
  connectedAt: number | null;
}

const EMPTY_STATUS: BotStatus = {
  connected: false,
  botTag: null,
  guildCount: 0,
  ping: null,
  lastError: null,
  connectedAt: null,
};

interface BotState {
  config: BotConfig;
  status: BotStatus;
  busy: boolean;

  setToken: (token: string) => Promise<void>;
  setAutoStart: (v: boolean) => Promise<void>;
  start: () => Promise<{ ok: boolean; error?: string }>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  restoreFromDisk: () => Promise<void>;
}

export const useDiscordBotStore = create<BotState>((set, get) => ({
  config: { token: '', autoStart: false },
  status: EMPTY_STATUS,
  busy: false,

  setToken: async (token) => {
    const next = { ...get().config, token: token.trim() };
    set({ config: next });
    await savePersistentData(STORAGE_KEY, next).catch(() => {});
  },

  setAutoStart: async (autoStart) => {
    const next = { ...get().config, autoStart };
    set({ config: next });
    await savePersistentData(STORAGE_KEY, next).catch(() => {});
  },

  start: async () => {
    const token = get().config.token;
    if (!token) return { ok: false, error: 'No bot token set.' };
    if (!window.electronAPI?.botStart) return { ok: false, error: 'Bot is desktop-only.' };
    set({ busy: true });
    try {
      const result = await window.electronAPI.botStart(token);
      await get().refreshStatus();
      return result;
    } finally {
      set({ busy: false });
    }
  },

  stop: async () => {
    if (!window.electronAPI?.botStop) return;
    set({ busy: true });
    try {
      await window.electronAPI.botStop();
      await get().refreshStatus();
    } finally {
      set({ busy: false });
    }
  },

  refreshStatus: async () => {
    if (!window.electronAPI?.botStatus) return;
    const status = await window.electronAPI.botStatus();
    set({ status });
  },

  restoreFromDisk: async () => {
    const saved = await loadPersistentData<BotConfig>(STORAGE_KEY).catch(() => null);
    if (saved && typeof saved.token === 'string') {
      set({ config: { token: saved.token, autoStart: !!saved.autoStart } });
    }
  },
}));
