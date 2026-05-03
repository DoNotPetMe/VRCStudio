import { useState, useRef, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Monitor, Clock, RotateCcw, RotateCw,
  Palette, Download, Upload, UserCircle, Globe2, Zap, Shield,
  Trash2, Smile, X, Volume2, Moon, Sun, ArrowUpDown, Lock,
  Cpu, Database, Keyboard, Info, ExternalLink,
} from 'lucide-react';
import { VRCDB_PROVIDERS, getProviderId, setProviderId } from '../api/vrcdb';
import type { ProviderId } from '../api/vrcdb';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useFriendStore } from '../stores/friendStore';
import { useThemeStore } from '../stores/themeStore';
import { useMultiAccountStore } from '../stores/multiAccountStore';
import { exportAllData, downloadExport, importData, exportFriendsList, downloadCSV } from '../utils/dataExport';
import { getAvailableLanguages, setLanguage, getLanguage } from '../utils/i18n';

type SettingsSection =
  | 'account' | 'accounts' | 'notifications' | 'polling'
  | 'display' | 'appearance' | 'discord' | 'vrcdb' | 'general' | 'data'
  | 'profile' | 'privacy' | 'performance' | 'shortcuts' | 'about';

const sections: Array<{ key: SettingsSection; label: string; icon: typeof SettingsIcon; group: string }> = [
  { key: 'profile',       label: 'Personalization',       icon: Smile,         group: 'Profile' },
  { key: 'account',       label: 'Account',               icon: UserCircle,    group: 'Profile' },
  { key: 'accounts',      label: 'Multiple Accounts',     icon: Shield,        group: 'Profile' },
  { key: 'notifications', label: 'Notifications',         icon: Bell,          group: 'App' },
  { key: 'polling',       label: 'Update Intervals',      icon: Clock,         group: 'App' },
  { key: 'display',       label: 'Display',               icon: Monitor,       group: 'App' },
  { key: 'appearance',    label: 'Appearance',            icon: Palette,       group: 'App' },
  { key: 'privacy',       label: 'Privacy',               icon: Lock,          group: 'App' },
  { key: 'discord',       label: 'Discord Rich Presence', icon: Zap,           group: 'Integrations' },
  { key: 'vrcdb',         label: 'Avatar Database',       icon: Database,      group: 'Integrations' },
  { key: 'general',       label: 'General',               icon: SettingsIcon,  group: 'System' },
  { key: 'performance',   label: 'Performance',           icon: Cpu,           group: 'System' },
  { key: 'shortcuts',     label: 'Keyboard Shortcuts',    icon: Keyboard,      group: 'System' },
  { key: 'data',          label: 'Data & Backup',         icon: Download,      group: 'System' },
  { key: 'about',         label: 'About',                 icon: Info,          group: 'System' },
];

const SHORTCUT_LIST: Array<{ description: string; keys: string[] }> = [
  { description: 'Go to Dashboard',  keys: ['Ctrl', '1'] },
  { description: 'Go to Friends',    keys: ['Ctrl', '2'] },
  { description: 'Go to Worlds',     keys: ['Ctrl', '3'] },
  { description: 'Go to Avatars',    keys: ['Ctrl', '4'] },
  { description: 'Focus Search',     keys: ['Ctrl', 'F'] },
  { description: 'Open Settings',    keys: ['Ctrl', ','] },
];

// ── Discord live diagnostics ──────────────────────────────────────────────────

function DiscordDiagnostics() {
  const user = useAuthStore(s => s.user);
  const current = useInstanceHistoryStore(s => s.currentInstance);
  const [tick, setTick] = useState(0);

  // Refresh every 5 s so values stay live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const location = user?.location ?? '—';
  const worldId = (user as any)?.worldId ?? '—';
  const instanceId = (user as any)?.instanceId ?? '—';
  const avatarUrl = user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl || user?.userIcon || '';
  const worldImg  = current?.worldImage ?? '';

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-900/60 p-3 space-y-2 text-xs">
      <p className="text-surface-300 font-semibold">Live status</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-surface-400">
        <span className="text-surface-500">user.location</span>
        <span className="font-mono text-surface-200 break-all">{location || '—'}</span>

        <span className="text-surface-500">user.worldId</span>
        <span className="font-mono text-surface-200 break-all">{worldId || '—'}</span>

        <span className="text-surface-500">user.instanceId</span>
        <span className="font-mono text-surface-200 break-all">{instanceId || '—'}</span>

        <span className="text-surface-500">World tracked</span>
        <span className={current ? 'text-green-400' : 'text-surface-500'}>
          {current ? `${current.worldName || current.worldId} (${current.instanceType})` : 'none'}
        </span>

        <span className="text-surface-500">World image</span>
        <span className="font-mono break-all">{worldImg || '—'}</span>

        <span className="text-surface-500">Avatar image</span>
        <span className="font-mono break-all">{avatarUrl ? `${avatarUrl.slice(0, 60)}…` : '—'}</span>
      </div>
      {!current && location && location !== '—' && !location.startsWith('wrld_') && (
        <p className="text-amber-400 text-xs mt-1">
          ⚠ location is <code className="bg-surface-800 px-1 rounded">{location}</code> — not a world instance.
          Join a world for tracking to begin.
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateGeneral, updateNotifications, updatePolling, updateDisplay, updatePrivacy, updatePerformance, updateProfile, resetSettings } = useSettingsStore();
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const {
    theme, setMode, setAccentColor, setCustomCSS, setFontSize,
    setSidebarWidth, setBorderRadius, setAnimationSpeed, setGlassEffect, resetTheme,
  } = useThemeStore();
  const { accounts, removeAccount } = useMultiAccountStore();
  const [active, setActive] = useState<SettingsSection>('account');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [vrcdbProvider, setVrcdbProviderState] = useState<ProviderId>(getProviderId());
  const [lang, setLang] = useState(getLanguage());
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(settings.profile.nickname);
  const [resetConfirm, setResetConfirm] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [discordEnabled, setDiscordEnabled] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"enabled":false,"clientId":""}').enabled
  );
  const [discordClientId, setDiscordClientId] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"enabled":false,"clientId":""}').clientId
  );
  const [discordShowWorld, setDiscordShowWorld] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"showWorld":true}').showWorld ?? true
  );
  const [discordShowAvatar, setDiscordShowAvatar] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"showAvatar":true}').showAvatar ?? true
  );

  const saveDiscord = (enabled: boolean, clientId: string, showWorld: boolean, showAvatar: boolean) => {
    localStorage.setItem('vrcstudio_discord', JSON.stringify({ enabled, clientId, showWorld, showAvatar }));
    if (enabled && clientId && window.electronAPI) {
      window.electronAPI.discordInit(clientId);
    } else if (!enabled) {
      window.electronAPI?.discordDisconnect();
    }
  };

  useEffect(() => {
    window.electronAPI?.getAutoLaunch().then(v => setAutoLaunch(v));
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importData(text);
    setImportStatus(result.message);
    setTimeout(() => setImportStatus(null), 5000);
    e.target.value = '';
  };

  const handleExportData = () => downloadExport(exportAllData());

  const handleExportFriends = () => {
    const all = [...onlineFriends, ...offlineFriends];
    const csv = exportFriendsList(all.map(f => ({ id: f.id, displayName: f.displayName, status: f.status })));
    downloadCSV(csv, `vrcstudio-friends-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleLangChange = (code: string) => {
    setLanguage(code);
    setLang(code);
    window.location.reload();
  };

  const handleAutoLaunch = (v: boolean) => {
    setAutoLaunch(v);
    window.electronAPI?.setAutoLaunch(v);
    updateGeneral({ launchOnStartup: v });
  };

  // Group sections by their group label for the sidebar
  const groups = sections.reduce<Record<string, typeof sections>>((acc, s) => {
    const g = s.group ?? 'Other';
    (acc[g] = acc[g] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-surface-100">Settings</h1>
        <p className="text-sm text-surface-500 mt-0.5">Configure your VRC Studio experience</p>
      </div>

      <div className="flex gap-6">
        {/* Left nav */}
        <nav className="w-52 flex-shrink-0">
          <div className="glass-panel-solid p-2 space-y-3">
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-surface-600">
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {items.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setActive(key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active === key
                          ? 'bg-accent-600/15 text-accent-400'
                          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/60'
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              onClick={() => setResetConfirm(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <RotateCcw size={14} /> Reset All Settings
            </button>
          </div>
          {resetConfirm && (
            <div className="mt-2 glass-panel p-3 space-y-2">
              <p className="text-xs text-surface-400">Reset all settings to defaults?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { resetSettings(); setResetConfirm(false); }}
                  className="btn-danger text-xs flex-1"
                >
                  Reset
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="btn-secondary text-xs flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Personalization ── */}
          {active === 'profile' && (
            <>
              <Section title="Your Identity" icon={Smile}>
                <p className="text-xs text-surface-500">
                  Set a preferred name that VRC Studio uses to greet you. Leave blank to use your VRChat display name.
                </p>
                <div className="space-y-1">
                  <label className="block text-sm font-medium">Preferred Name</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={nicknameInput}
                        onChange={e => setNicknameInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateProfile({ nickname: nicknameInput.trim() });
                          if (e.key === 'Escape') { setNicknameInput(settings.profile.nickname); }
                        }}
                        placeholder={user?.displayName || 'Your VRChat name'}
                        maxLength={40}
                        className="input-field w-full pr-8"
                      />
                      {nicknameInput && (
                        <button
                          onClick={() => { setNicknameInput(''); updateProfile({ nickname: '' }); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                          title="Clear name"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => updateProfile({ nickname: nicknameInput.trim() })}
                      disabled={nicknameInput.trim() === settings.profile.nickname}
                      className="btn-primary text-sm disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-surface-600">
                    {nicknameInput.trim()
                      ? `You'll be greeted as "${nicknameInput.trim()}"`
                      : `You'll be greeted as "${user?.displayName || 'Traveler'}"`}
                  </p>
                </div>
              </Section>

              <Section title="Dashboard Greeting" icon={Smile}>
                <Toggle
                  label="Show Greeting"
                  description="Display a personalized greeting with live info on the Dashboard"
                  checked={settings.profile.greetingEnabled}
                  onChange={v => updateProfile({ greetingEnabled: v })}
                />
                {settings.profile.greetingEnabled && (
                  <Toggle
                    label="Show Local Weather"
                    description="Fetch and display your current weather in the greeting — requires location permission"
                    checked={settings.profile.showWeather}
                    onChange={v => updateProfile({ showWeather: v })}
                  />
                )}
                {settings.profile.greetingEnabled && (
                  <div className="glass-panel p-3 mt-1">
                    <div className="text-xs text-surface-500 mb-2 font-medium uppercase tracking-wide">Preview</div>
                    <div className="text-sm font-semibold text-surface-200">
                      {(() => {
                        const h = new Date().getHours();
                        let g = 'Good night';
                        if (h >= 5 && h < 12)  g = 'Good morning';
                        else if (h >= 12 && h < 17) g = 'Good afternoon';
                        else if (h >= 17 && h < 21) g = 'Good evening';
                        const name = nicknameInput.trim() || user?.displayName || 'Traveler';
                        return <>{g}, <span className="text-gradient">{name}</span></>;
                      })()}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">
                      The greeting rotates through: current time, friends online, join-me invites{settings.profile.showWeather ? ', and weather' : ''}.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ── Account ── */}
          {active === 'account' && (
            <Section title="Account" icon={UserCircle}>
              <InfoRow label="Display Name" value={user?.displayName || '—'} />
              <InfoRow label="User ID" value={user?.id || '—'} mono />
              <InfoRow label="Email Verified" value={user?.emailVerified ? 'Yes' : 'No'} />
              <InfoRow label="2FA Enabled" value={user?.twoFactorAuthEnabled ? 'Yes' : 'No'} />
              <InfoRow label="Friends" value={`${onlineFriends.length} online / ${onlineFriends.length + offlineFriends.length} total`} />
              <InfoRow label="Join Date" value={user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'} />
              <InfoRow label="Last Platform" value={user?.last_platform || '—'} />
            </Section>
          )}

          {/* ── Multiple Accounts ── */}
          {active === 'accounts' && (
            <Section title="Multi-Account" icon={Shield}>
              <p className="text-xs text-surface-500 mb-3">
                Saved accounts allow quick profile switching. Credentials are stored locally only and never sent to any server.
              </p>
              <div className="space-y-2">
                {accounts.map(acct => (
                  <div key={acct.id} className="glass-panel p-3 flex items-center gap-3">
                    {acct.avatarUrl && (
                      <img src={acct.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{acct.displayName || acct.label || acct.username}</div>
                      <div className="text-xs text-surface-500">{acct.username}</div>
                    </div>
                    <button onClick={() => removeAccount(acct.id)} className="btn-ghost text-red-400 hover:text-red-300 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {accounts.length === 0 && (
                  <p className="text-sm text-surface-500">No saved accounts. Log in to automatically save your session.</p>
                )}
              </div>
            </Section>
          )}

          {/* ── Privacy ── */}
          {active === 'privacy' && (
            <Section title="Privacy" icon={Lock}>
              <p className="text-xs text-surface-500 mb-1">
                Control what information VRC Studio reads and displays locally. These settings do not change your VRChat account privacy — configure that in-game.
              </p>
              <Toggle
                label="Show Online Status"
                description="Display your online/offline status in the dashboard"
                checked={settings.privacy.showOnlineStatus}
                onChange={v => updatePrivacy({ showOnlineStatus: v })}
              />
              <Toggle
                label="Show Current World"
                description="Display the world you are currently in"
                checked={settings.privacy.showCurrentWorld}
                onChange={v => updatePrivacy({ showCurrentWorld: v })}
              />
              <Toggle
                label="Show Last Seen"
                description="Display when friends were last active"
                checked={settings.privacy.showLastSeen}
                onChange={v => updatePrivacy({ showLastSeen: v })}
              />
              <Toggle
                label="Allow Friend Requests"
                description="Show incoming friend request notifications"
                checked={settings.privacy.allowFriendRequests}
                onChange={v => updatePrivacy({ allowFriendRequests: v })}
              />
            </Section>
          )}

          {/* ── Notifications ── */}
          {active === 'notifications' && (
            <>
              <Section title="Event Notifications" icon={Bell}>
                <Toggle label="Friend Comes Online" description="Notify when a friend's status becomes online"
                  checked={settings.notifications.friendOnline} onChange={v => updateNotifications({ friendOnline: v })} />
                <Toggle label="Friend Goes Offline" description="Notify when a friend disconnects"
                  checked={settings.notifications.friendOffline} onChange={v => updateNotifications({ friendOffline: v })} />
                <Toggle label="Friend Location Change" description="Notify when a friend joins a new world"
                  checked={settings.notifications.friendLocation} onChange={v => updateNotifications({ friendLocation: v })} />
                <Toggle label="Friend Status Change" description="Notify when a friend updates their status message"
                  checked={settings.notifications.friendStatus} onChange={v => updateNotifications({ friendStatus: v })} />
                <Toggle label="Invites & Requests" description="Notify on incoming invites and friend requests"
                  checked={settings.notifications.invites} onChange={v => updateNotifications({ invites: v })} />
                <Toggle label="Group Activity Updates" description="Bundle rapid status changes into a single notification"
                  checked={settings.notifications.groupUpdates} onChange={v => updateNotifications({ groupUpdates: v })} />
              </Section>

              <Section title="Delivery" icon={Volume2}>
                <Toggle label="Sound" description="Play a sound with each notification"
                  checked={settings.notifications.sound} onChange={v => updateNotifications({ sound: v })} />
                <Toggle label="Desktop Notifications" description="Show OS-level pop-up notifications"
                  checked={settings.notifications.desktopNotifications} onChange={v => updateNotifications({ desktopNotifications: v })} />
                <SliderRow
                  label="Notification Duration"
                  value={settings.notifications.notificationDuration}
                  min={2} max={15} step={1} unit="s"
                  onChange={v => updateNotifications({ notificationDuration: v })}
                />
              </Section>

              <Section title="Do Not Disturb" icon={Moon}>
                <Toggle
                  label="Enable Do Not Disturb"
                  description="Silence all notifications during the set hours"
                  checked={settings.notifications.dndEnabled}
                  onChange={v => updateNotifications({ dndEnabled: v })}
                />
                {settings.notifications.dndEnabled && (
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div>
                      <label className="block text-xs text-surface-500 mb-1">Start time</label>
                      <input
                        type="time"
                        value={settings.notifications.dndStart}
                        onChange={e => updateNotifications({ dndStart: e.target.value })}
                        className="input-field text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-surface-500 mb-1">End time</label>
                      <input
                        type="time"
                        value={settings.notifications.dndEnd}
                        onChange={e => updateNotifications({ dndEnd: e.target.value })}
                        className="input-field text-sm w-full"
                      />
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ── Polling ── */}
          {active === 'polling' && (
            <Section title="Update Intervals" icon={Clock}>
              <p className="text-xs text-surface-500 mb-4">
                VRC Studio uses a real-time WebSocket connection plus periodic polling. Lower intervals give fresher data at the cost of more API calls.
              </p>
              <SliderRow
                label="Friends Refresh"
                value={settings.polling.friendsInterval}
                min={10} max={120} step={5} unit="s"
                onChange={v => updatePolling({ friendsInterval: v })}
              />
              <SliderRow
                label="World Browser Refresh"
                value={settings.polling.worldInterval}
                min={30} max={300} step={10} unit="s"
                onChange={v => updatePolling({ worldInterval: v })}
              />
              <SliderRow
                label="Notifications Refresh"
                value={settings.polling.notificationsInterval}
                min={10} max={120} step={5} unit="s"
                onChange={v => updatePolling({ notificationsInterval: v })}
              />
              <SliderRow
                label="Activity Feed Refresh"
                value={settings.polling.feedInterval}
                min={10} max={120} step={5} unit="s"
                onChange={v => updatePolling({ feedInterval: v })}
              />
            </Section>
          )}

          {/* ── Display ── */}
          {active === 'display' && (
            <>
              <Section title="Layout" icon={Monitor}>
                <Toggle label="Compact Mode" description="Denser layout showing more items per screen"
                  checked={settings.display.compactMode} onChange={v => updateDisplay({ compactMode: v })} />
                <Toggle label="Show Offline Friends" description="Include offline friends in the friends list"
                  checked={settings.display.showOfflineFriends} onChange={v => updateDisplay({ showOfflineFriends: v })} />
                <Toggle label="Group Friends by Status" description="Separate friends into Online / Away / Offline sections"
                  checked={settings.display.groupByStatus} onChange={v => updateDisplay({ groupByStatus: v })} />
                <Toggle label="Show Avatar in List" description="Display friend avatars next to their names"
                  checked={settings.display.showAvatarInList} onChange={v => updateDisplay({ showAvatarInList: v })} />
                <Toggle label="Show Bio Preview" description="Show a short bio excerpt in the friends list"
                  checked={settings.display.showBioPreview} onChange={v => updateDisplay({ showBioPreview: v })} />
                <Toggle label="Show Trust Rank Badges" description="Display VRChat trust level badges on friend cards"
                  checked={settings.display.showTrustBadges} onChange={v => updateDisplay({ showTrustBadges: v })} />
              </Section>

              <Section title="Sorting & Format" icon={ArrowUpDown}>
                <div>
                  <label className="block text-sm font-medium mb-1">Friends Sort Order</label>
                  <select
                    value={settings.display.friendsSortBy}
                    onChange={e => updateDisplay({ friendsSortBy: e.target.value as 'name' | 'status' | 'trust' })}
                    className="input-field w-auto"
                  >
                    <option value="status">By Status</option>
                    <option value="name">By Name (A–Z)</option>
                    <option value="trust">By Trust Rank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time Format</label>
                  <select
                    value={settings.display.timeFormat}
                    onChange={e => updateDisplay({ timeFormat: e.target.value as '12h' | '24h' })}
                    className="input-field w-auto"
                  >
                    <option value="24h">24-hour (14:30)</option>
                    <option value="12h">12-hour (2:30 PM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Language</label>
                  <select value={lang} onChange={e => handleLangChange(e.target.value)} className="input-field w-auto">
                    {getAvailableLanguages().map(l => (
                      <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-surface-500 mt-1">Changing language reloads the app.</p>
                </div>
              </Section>
            </>
          )}

          {/* ── Appearance ── */}
          {active === 'appearance' && (
            <>
              <Section title="Theme" icon={Palette}>
                <div>
                  <label className="block text-sm font-medium mb-2">Color Mode</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { key: 'dark',     label: 'Dark',     icon: Moon },
                      { key: 'midnight', label: 'Midnight', icon: Moon },
                      { key: 'oled',     label: 'OLED',     icon: Moon },
                      { key: 'light',    label: 'Light',    icon: Sun  },
                    ] as const).map(({ key, label, icon: ModeIcon }) => (
                      <button
                        key={key}
                        onClick={() => setMode(key)}
                        className={`py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                          theme.mode === key
                            ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                            : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                        }`}
                      >
                        <ModeIcon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Accent Color</label>
                  <div className="flex gap-3 flex-wrap">
                    {([
                      { key: 'blue',   bg: 'bg-blue-500',   label: 'Blue'   },
                      { key: 'purple', bg: 'bg-purple-500', label: 'Purple' },
                      { key: 'green',  bg: 'bg-green-500',  label: 'Green'  },
                      { key: 'rose',   bg: 'bg-rose-500',   label: 'Rose'   },
                      { key: 'amber',  bg: 'bg-amber-500',  label: 'Amber'  },
                      { key: 'cyan',   bg: 'bg-cyan-500',   label: 'Cyan'   },
                    ] as const).map(({ key, bg, label }) => (
                      <button
                        key={key}
                        onClick={() => setAccentColor(key)}
                        title={label}
                        className={`w-8 h-8 rounded-full ${bg} transition-transform hover:scale-110 ${
                          theme.accentColor === key
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900'
                            : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Typography & Layout" icon={Monitor}>
                <div>
                  <label className="block text-sm font-medium mb-2">Font Size</label>
                  <OptionRow
                    options={['small', 'medium', 'large']}
                    value={theme.fontSize}
                    onChange={v => setFontSize(v as 'small' | 'medium' | 'large')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sidebar Width</label>
                  <OptionRow
                    options={['compact', 'normal', 'wide']}
                    value={theme.sidebarWidth}
                    onChange={v => setSidebarWidth(v as 'compact' | 'normal' | 'wide')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Border Radius</label>
                  <OptionRow
                    options={['sharp', 'rounded', 'pill']}
                    value={theme.borderRadius}
                    onChange={v => setBorderRadius(v as 'sharp' | 'rounded' | 'pill')}
                  />
                </div>
              </Section>

              <Section title="Effects & Animation" icon={Zap}>
                <div>
                  <label className="block text-sm font-medium mb-2">Glass Effect</label>
                  <OptionRow
                    options={['none', 'light', 'medium']}
                    value={theme.glassEffect}
                    onChange={v => setGlassEffect(v as 'none' | 'light' | 'medium')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Animation Speed</label>
                  <OptionRow
                    options={['none', 'subtle', 'normal']}
                    value={theme.animationSpeed}
                    onChange={v => setAnimationSpeed(v as 'none' | 'subtle' | 'normal')}
                  />
                </div>
              </Section>

              <Section title="Custom CSS" icon={SettingsIcon}>
                <p className="text-xs text-surface-500">Advanced: inject CSS directly into the app. Changes apply instantly.</p>
                <textarea
                  value={theme.customCSS}
                  onChange={e => setCustomCSS(e.target.value)}
                  placeholder="/* Custom CSS */"
                  className="input-field font-mono text-xs h-32 resize-y"
                />
              </Section>

              <button onClick={resetTheme} className="btn-secondary text-sm w-fit">
                Reset to Default Theme
              </button>
            </>
          )}

          {/* ── Discord RPC ── */}
          {active === 'discord' && (
            <Section title="Discord Rich Presence" icon={Zap}>
              {!window.electronAPI && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
                  Not available in browser mode — requires the Electron desktop app.
                </div>
              )}

              {/* Setup guide */}
              <div className="mb-4 bg-surface-800/50 rounded-lg p-3 space-y-1.5 text-xs text-surface-400">
                <p className="text-surface-200 font-semibold text-xs">Setup required</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <span className="text-accent-400">discord.com/developers/applications</span> and create a New Application</li>
                  <li>Name it whatever you want (e.g. "VRChat" or "VRC Studio")</li>
                  <li>Copy the <span className="font-semibold text-surface-200">Application ID</span> from the General Information page</li>
                  <li>Paste it in the Client ID field below and click Apply</li>
                </ol>
                <p className="text-surface-500 mt-1">The world thumbnail will be used automatically as your presence image — no assets upload needed.</p>
              </div>

              <DiscordDiagnostics />

              <Toggle
                label="Enable Discord Rich Presence"
                description="Show your current VRChat world and playtime on Discord"
                checked={discordEnabled}
                onChange={v => { setDiscordEnabled(v); saveDiscord(v, discordClientId, discordShowWorld, discordShowAvatar); }}
              />
              {discordEnabled && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium">Discord Application Client ID</label>
                    <p className="text-xs text-surface-500">
                      Required — paste your Discord Application ID here.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discordClientId}
                        onChange={e => setDiscordClientId(e.target.value)}
                        placeholder="1234567890123456789"
                        className="input-field flex-1 font-mono text-sm"
                      />
                      <button
                        onClick={() => saveDiscord(discordEnabled, discordClientId, discordShowWorld, discordShowAvatar)}
                        className="btn-primary text-sm"
                      >
                        Apply
                      </button>
                    </div>
                    {discordEnabled && !discordClientId && (
                      <p className="text-xs text-amber-400">⚠ Enter a Client ID to activate rich presence.</p>
                    )}
                  </div>
                  <Toggle
                    label="Show Current World"
                    description="Include the world name and how long you've been there"
                    checked={discordShowWorld}
                    onChange={v => { setDiscordShowWorld(v); saveDiscord(discordEnabled, discordClientId, v, discordShowAvatar); }}
                  />
                </>
              )}
            </Section>
          )}

          {/* ── Avatar Database (VRCDB) ── */}
          {active === 'vrcdb' && (
            <Section title="Avatar Database" icon={Database}>
              <p className="text-xs text-surface-500">
                The VRCDB search (Avatars page → VRCDB tab and Quick Switcher) uses community-run public avatar
                indexes. These are independent third-party services — switch if one is unavailable.
              </p>

              <div>
                <div className="text-sm font-medium mb-2">Search Provider</div>
                <div className="space-y-2">
                  {VRCDB_PROVIDERS.map(p => (
                    <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vrcdb_provider"
                        checked={vrcdbProvider === p.id}
                        onChange={() => {
                          setProviderId(p.id as ProviderId);
                          setVrcdbProviderState(p.id as ProviderId);
                        }}
                        className="accent-accent-500"
                      />
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-surface-500 font-mono">{p.searchUrl('…')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-surface-800 text-xs text-surface-600 space-y-1">
                <p>These providers index only <strong className="text-surface-400">public</strong> avatars shared by their creators.</p>
                <p>Any public avatar can be worn directly via the Wear button — same as clicking an avatar on the VRChat website.</p>
                <p>
                  To request removal of your avatar from an index, contact the provider directly.{' '}
                  <button
                    className="text-accent-400 hover:text-accent-300 underline"
                    onClick={() => window.electronAPI?.openExternal('https://avtrdb.com/faq')}
                  >
                    avtrdb.com/faq
                  </button>
                </p>
              </div>
            </Section>
          )}

          {/* ── General ── */}
          {active === 'general' && (
            <>
              <Section title="Window Behavior" icon={SettingsIcon}>
                <Toggle
                  label="Start Minimized"
                  description="Start VRC Studio minimized to the system tray"
                  checked={settings.general.startMinimized}
                  onChange={v => updateGeneral({ startMinimized: v })}
                />
                <Toggle
                  label="Minimize to Tray"
                  description="Send to system tray instead of closing when you click ✕"
                  checked={settings.general.minimizeToTray}
                  onChange={v => { updateGeneral({ minimizeToTray: v }); window.electronAPI?.setMinimizeToTray(v); }}
                />
                <Toggle
                  label="Confirm Before Closing"
                  description="Ask for confirmation before quitting the app"
                  checked={settings.general.confirmClose}
                  onChange={v => updateGeneral({ confirmClose: v })}
                />
                <Toggle
                  label="Launch on System Startup"
                  description="Start VRC Studio automatically when your computer boots"
                  checked={autoLaunch}
                  onChange={handleAutoLaunch}
                  disabled={!window.electronAPI}
                />
                {!window.electronAPI && (
                  <p className="text-xs text-amber-400">Auto-launch requires the desktop (Electron) build.</p>
                )}
              </Section>

              <Section title="Updates" icon={RotateCw}>
                <Toggle
                  label="Check for Updates Automatically"
                  description="Notify you when a new version of VRC Studio is available"
                  checked={settings.general.checkForUpdates}
                  onChange={v => updateGeneral({ checkForUpdates: v })}
                />
              </Section>
            </>
          )}

          {/* ── Privacy ── (already handled above) */}

          {/* ── Performance ── */}
          {active === 'performance' && (
            <>
              <Section title="Rendering" icon={Cpu}>
                <Toggle
                  label="Enable Animations"
                  description="Fade and slide transitions throughout the UI"
                  checked={settings.performance.enableAnimations}
                  onChange={v => updatePerformance({ enableAnimations: v })}
                />
                <Toggle
                  label="Hardware Acceleration"
                  description="Use GPU acceleration (requires restart)"
                  checked={settings.general.hardwareAcceleration}
                  onChange={v => updateGeneral({ hardwareAcceleration: v })}
                  disabled={!window.electronAPI}
                />
                <div>
                  <label className="block text-sm font-medium mb-1">Image Quality</label>
                  <p className="text-xs text-surface-500 mb-2">Controls thumbnail resolution for worlds and avatars.</p>
                  <OptionRow
                    options={['low', 'medium', 'high']}
                    value={settings.performance.imageQuality}
                    onChange={v => updatePerformance({ imageQuality: v as 'low' | 'medium' | 'high' })}
                  />
                </div>
              </Section>

              <Section title="Data & Sync" icon={Database}>
                <Toggle
                  label="Background Sync"
                  description="Keep friends and world data fresh even when the app is minimized"
                  checked={settings.performance.backgroundSync}
                  onChange={v => updatePerformance({ backgroundSync: v })}
                />
                <Toggle
                  label="Prefetch Images"
                  description="Pre-load avatar and world thumbnails for faster browsing"
                  checked={settings.performance.prefetchImages}
                  onChange={v => updatePerformance({ prefetchImages: v })}
                />
                <SliderRow
                  label="Virtualize Lists Above"
                  value={settings.performance.virtualizeListsThreshold}
                  min={20} max={500} step={10} unit=" items"
                  onChange={v => updatePerformance({ virtualizeListsThreshold: v })}
                />
              </Section>
            </>
          )}

          {/* ── Shortcuts ── */}
          {active === 'shortcuts' && (
            <Section title="Keyboard Shortcuts" icon={Keyboard}>
              <p className="text-xs text-surface-500 mb-3">
                These shortcuts work globally when no text input is focused.
              </p>
              <div className="space-y-2">
                {SHORTCUT_LIST.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between py-1.5 border-b border-surface-800 last:border-0">
                    <span className="text-sm text-surface-300">{description}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="px-2 py-0.5 rounded bg-surface-700 border border-surface-600 text-xs font-mono text-surface-300">
                            {k}
                          </kbd>
                          {i < keys.length - 1 && <span className="text-surface-600 text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Data & Backup ── */}
          {active === 'data' && (
            <Section title="Data & Backup" icon={Download}>
              <p className="text-xs text-surface-500 mb-2">
                Export and import your VRC Studio data: notes, presets, friend log, settings, and theme.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ActionCard
                  title="Export Full Backup"
                  description="All notes, presets, friend log, settings as JSON"
                  icon={Download}
                  onClick={handleExportData}
                  label="Export .json"
                />
                <ActionCard
                  title="Import Backup"
                  description="Restore from a previously exported backup file"
                  icon={Upload}
                  onClick={() => importRef.current?.click()}
                  label="Import .json"
                  variant="secondary"
                />
                <ActionCard
                  title="Export Friends List"
                  description="Export friend IDs and display names as CSV"
                  icon={Download}
                  onClick={handleExportFriends}
                  label="Export .csv"
                  variant="secondary"
                />
              </div>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              {importStatus && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  importStatus.includes('Successfully') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {importStatus}
                </div>
              )}

              <StorageUsage />

              <div className="pt-4 border-t border-surface-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-400">Clear All Local Data</div>
                    <div className="text-xs text-surface-500">Removes all notes, presets, friend log, and settings</div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('This will delete ALL local data. Are you sure?')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="btn-danger text-sm"
                  >
                    Clear Data
                  </button>
                </div>
              </div>
            </Section>
          )}

          {/* ── About ── */}
          {active === 'about' && (
            <Section title="About VRC Studio" icon={Info}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent-600/20 flex items-center justify-center">
                  <Globe2 size={24} className="text-accent-400" />
                </div>
                <div>
                  <div className="text-base font-semibold">VRC Studio</div>
                  <div className="text-xs text-surface-500">Advanced VRChat companion app</div>
                </div>
              </div>
              <InfoRow label="Version" value="1.0.0" />
              <InfoRow label="Build" value="electron + vite + react" />
              <InfoRow label="Theme Engine" value="CSS custom properties" />
              <InfoRow label="Data Storage" value="localStorage (local only)" />
              <AppStatsRow />
              <div className="pt-3 border-t border-surface-800 mt-2">
                <p className="text-xs text-surface-500">
                  VRC Studio is an unofficial third-party application. It is not affiliated with or endorsed by VRChat Inc.
                  All VRChat data is fetched through the official VRChat API using your own credentials.
                </p>
              </div>
              <div className="pt-2 text-center">
                <p className="text-[11px] text-surface-600">Made by DoNotResurrect_</p>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AppStatsRow() {
  const [downloads, setDownloads] = useState<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.httpGet(
      'https://api.github.com/repos/crystaldusty/vrcstudio/releases',
      { 'User-Agent': 'VRCStudio/1.0.0' },
    ).then(res => {
      if (!res.ok || !Array.isArray(res.data)) return;
      const total = (res.data as any[]).reduce((sum: number, release: any) =>
        sum + (release.assets as any[] || []).reduce((s: number, a: any) => s + (a.download_count || 0), 0), 0
      );
      setDownloads(total);
    }).catch(() => {});
  }, []);

  if (downloads === null) return null;

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-surface-400">Total Downloads</span>
      <span className="text-sm font-semibold text-accent-400">{downloads.toLocaleString()}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: typeof SettingsIcon; children: React.ReactNode;
}) {
  return (
    <div className="glass-panel-solid p-5 space-y-5">
      <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
        <Icon size={15} /> {title}
      </h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-surface-400">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs text-surface-500' : ''}`}>{value}</span>
    </div>
  );
}

function Toggle({
  label, description, checked, onChange, disabled,
}: {
  label: string; description: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="pr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-surface-500">{description}</div>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-accent-600' : 'bg-surface-700'}`}
      >
        <div
          className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-semibold text-accent-400">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent-500"
      />
      <div className="flex justify-between text-xs text-surface-600 mt-1">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function OptionRow({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
            value === opt
              ? 'border-accent-500 bg-accent-500/15 text-accent-400'
              : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

const STORAGE_STORES: Array<{ key: string; label: string; clearable: boolean }> = [
  { key: 'vrcstudio_instance_history', label: 'Visit history',       clearable: true  },
  { key: 'vrcstudio_reports',          label: 'Filed reports',       clearable: false },
  { key: 'vrcstudio_world_analytics',  label: 'World analytics',     clearable: true  },
  { key: 'vrcstudio_settings',         label: 'App settings',        clearable: false },
  { key: 'vrcstudio_theme',            label: 'Theme preferences',   clearable: false },
  { key: 'vrcstudio_discord',          label: 'Discord RPC config',  clearable: false },
  { key: 'vrcstudio_starred_friends',  label: 'Starred friends',     clearable: false },
  { key: 'vrcstudio_multi_accounts',   label: 'Saved accounts',      clearable: false },
];

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function StorageUsage() {
  const [tick, setTick] = useState(0);

  const rows = STORAGE_STORES.map(store => {
    const raw = localStorage.getItem(store.key) ?? '';
    const bytes = new Blob([raw]).size;
    return { ...store, bytes };
  });

  // Also capture any other vrcstudio_ keys not in the list
  const knownKeys = new Set(STORAGE_STORES.map(s => s.key));
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) ?? '';
    if (k.startsWith('vrcstudio_') && !knownKeys.has(k)) {
      const raw = localStorage.getItem(k) ?? '';
      rows.push({ key: k, label: k.replace('vrcstudio_', ''), bytes: new Blob([raw]).size, clearable: true });
    }
  }

  const total = rows.reduce((s, r) => s + r.bytes, 0);
  const maxBytes = Math.max(...rows.map(r => r.bytes), 1);

  function clearStore(key: string) {
    localStorage.removeItem(key);
    setTick(t => t + 1);
  }

  return (
    <div className="pt-4 border-t border-surface-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Storage Usage</div>
        <div className="text-xs text-surface-500">{fmtBytes(total)} total</div>
      </div>
      <div className="space-y-2">
        {rows.filter(r => r.bytes > 0).sort((a, b) => b.bytes - a.bytes).map(row => (
          <div key={row.key + tick} className="flex items-center gap-3">
            <div className="w-28 text-xs text-surface-400 truncate flex-shrink-0">{row.label}</div>
            <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-500/60 rounded-full"
                style={{ width: `${(row.bytes / maxBytes) * 100}%` }}
              />
            </div>
            <div className="text-xs text-surface-500 w-14 text-right flex-shrink-0">{fmtBytes(row.bytes)}</div>
            {row.clearable ? (
              <button
                onClick={() => clearStore(row.key)}
                className="text-xs text-red-400/70 hover:text-red-400 transition-colors flex-shrink-0"
                title={`Clear ${row.label}`}
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <div className="w-3 flex-shrink-0" />
            )}
          </div>
        ))}
        {rows.every(r => r.bytes === 0) && (
          <p className="text-xs text-surface-600">No data stored yet.</p>
        )}
      </div>
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, onClick, label, variant = 'primary' }: {
  title: string; description: string; icon: typeof Download;
  onClick: () => void; label: string; variant?: 'primary' | 'secondary';
}) {
  return (
    <div className="glass-panel p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent-400" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-surface-500">{description}</p>
      <button onClick={onClick} className={variant === 'primary' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}>
        {label}
      </button>
    </div>
  );
}
