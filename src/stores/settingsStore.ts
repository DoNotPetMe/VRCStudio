import { create } from 'zustand';
import type { AppSettings } from '../types/vrchat';

const SETTINGS_KEY = 'vrcstudio_settings';

const defaultSettings: AppSettings = {
  general: {
    startMinimized: false,
    minimizeToTray: true,
    launchOnStartup: false,
    confirmClose: false,
    checkForUpdates: true,
    hardwareAcceleration: true,
  },
  notifications: {
    friendOnline: true,
    friendOffline: false,
    friendLocation: true,
    friendStatus: true,
    invites: true,
    sound: true,
    desktopNotifications: true,
    notificationDuration: 5,
    dndEnabled: false,
    dndStart: '23:00',
    dndEnd: '07:00',
    groupUpdates: false,
  },
  polling: {
    friendsInterval: 30,
    worldInterval: 60,
    notificationsInterval: 15,
    feedInterval: 20,
  },
  display: {
    compactMode: false,
    showOfflineFriends: true,
    timeFormat: '24h',
    friendsSortBy: 'status',
    groupByStatus: true,
    showTrustBadges: true,
    showBioPreview: true,
    showAvatarInList: true,
  },
  privacy: {
    showOnlineStatus: true,
    showCurrentWorld: true,
    allowFriendRequests: true,
    showLastSeen: true,
  },
  performance: {
    enableAnimations: true,
    imageQuality: 'high',
    backgroundSync: true,
    prefetchImages: true,
    virtualizeListsThreshold: 100,
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
      privacy: { ...defaultSettings.privacy, ...saved.privacy },
      performance: { ...defaultSettings.performance, ...saved.performance },
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
  updatePrivacy: (updates: Partial<AppSettings['privacy']>) => void;
  updatePerformance: (updates: Partial<AppSettings['performance']>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),

  updateGeneral: (updates) => {
    const settings = { ...get().settings, general: { ...get().settings.general, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  updateNotifications: (updates) => {
    const settings = { ...get().settings, notifications: { ...get().settings.notifications, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  updatePolling: (updates) => {
    const settings = { ...get().settings, polling: { ...get().settings.polling, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  updateDisplay: (updates) => {
    const settings = { ...get().settings, display: { ...get().settings.display, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  updatePrivacy: (updates) => {
    const settings = { ...get().settings, privacy: { ...get().settings.privacy, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  updatePerformance: (updates) => {
    const settings = { ...get().settings, performance: { ...get().settings.performance, ...updates } };
    saveSettings(settings);
    set({ settings });
  },

  resetSettings: () => {
    saveSettings(defaultSettings);
    set({ settings: defaultSettings });
  },
}));
