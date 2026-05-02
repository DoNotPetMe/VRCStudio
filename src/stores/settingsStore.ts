import { create } from 'zustand';
import type { AppSettings } from '../types/vrchat';

const SETTINGS_KEY = 'vrcstudio_settings';

const defaultSettings: AppSettings = {
  general: {
    startMinimized: false,
    minimizeToTray: true,
    launchOnStartup: false,
  },
  notifications: {
    friendOnline: true,
    friendOffline: false,
    friendLocation: true,
    friendStatus: true,
    invites: true,
    sound: true,
  },
  polling: {
    friendsInterval: 30,
    worldInterval: 60,
  },
  display: {
    compactMode: false,
    showOfflineFriends: true,
    timeFormat: '24h',
  },
  profile: {
    nickname: '',
    greetingEnabled: true,
    showWeather: true,
  },
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const saved = JSON.parse(raw);
    return {
      general: { ...defaultSettings.general, ...saved.general },
      notifications: { ...defaultSettings.notifications, ...saved.notifications },
      polling: { ...defaultSettings.polling, ...saved.polling },
      display: { ...defaultSettings.display, ...saved.display },
      profile: { ...defaultSettings.profile, ...saved.profile },
    };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface SettingsState {
  settings: AppSettings;
  updateGeneral: (updates: Partial<AppSettings['general']>) => void;
  updateNotifications: (updates: Partial<AppSettings['notifications']>) => void;
  updatePolling: (updates: Partial<AppSettings['polling']>) => void;
  updateDisplay: (updates: Partial<AppSettings['display']>) => void;
  updateProfile: (updates: Partial<AppSettings['profile']>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),

  updateGeneral: (updates) => {
    const settings = {
      ...get().settings,
      general: { ...get().settings.general, ...updates },
    };
    saveSettings(settings);
    set({ settings });
  },

  updateNotifications: (updates) => {
    const settings = {
      ...get().settings,
      notifications: { ...get().settings.notifications, ...updates },
    };
    saveSettings(settings);
    set({ settings });
  },

  updatePolling: (updates) => {
    const settings = {
      ...get().settings,
      polling: { ...get().settings.polling, ...updates },
    };
    saveSettings(settings);
    set({ settings });
  },

  updateDisplay: (updates) => {
    const settings = {
      ...get().settings,
      display: { ...get().settings.display, ...updates },
    };
    saveSettings(settings);
    set({ settings });
  },

  updateProfile: (updates) => {
    const settings = { ...get().settings, profile: { ...get().settings.profile, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  resetSettings: () => {
    saveSettings(defaultSettings);
    set({ settings: defaultSettings });
  },
}));
