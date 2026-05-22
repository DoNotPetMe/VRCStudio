import { create } from 'zustand';

export interface OSCMessage {
  ts: number;
  address: string;
  args: any[];
  outgoing?: boolean;
}

export interface OSCConfig {
  autoStart: boolean;
  sendHost: string;
  sendPort: number;
  recvPort: number;
  logSize: number;
}

/** Settings for the recurring "live status" chatbox sender. */
export interface OSCChatboxStatus {
  enabled: boolean;
  intervalSec: number;
  showClock: boolean;
  clock24h: boolean;
  showDate: boolean;
  showUptime: boolean;
  customText: string;
  rotateMessages: boolean;
  messages: string[];
  separator: string;
}

const CFG_KEY = 'vrcstudio_osc_config';
const CHATBOX_KEY = 'vrcstudio_osc_chatbox_status';

const defaultConfig: OSCConfig = {
  autoStart: false,
  sendHost: '127.0.0.1',
  sendPort: 9000,
  recvPort: 9001,
  logSize: 250,
};

function loadConfig(): OSCConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return defaultConfig;
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return defaultConfig;
  }
}

function saveConfig(cfg: OSCConfig) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {}
}

const defaultChatboxStatus: OSCChatboxStatus = {
  enabled: false,
  intervalSec: 5,
  showClock: true,
  clock24h: true,
  showDate: false,
  showUptime: false,
  customText: '',
  rotateMessages: false,
  messages: [],
  separator: ' · ',
};

function loadChatboxStatus(): OSCChatboxStatus {
  try {
    const raw = localStorage.getItem(CHATBOX_KEY);
    if (!raw) return defaultChatboxStatus;
    return { ...defaultChatboxStatus, ...JSON.parse(raw) };
  } catch {
    return defaultChatboxStatus;
  }
}

function saveChatboxStatus(s: OSCChatboxStatus) {
  try { localStorage.setItem(CHATBOX_KEY, JSON.stringify(s)); } catch {}
}

const appStart = Date.now();

/**
 * Build the chatbox status string from the currently-enabled tokens.
 * `rotationIndex` selects which message to show when rotation is on.
 */
export function composeChatboxStatus(s: OSCChatboxStatus, rotationIndex = 0): string {
  const parts: string[] = [];
  const msgs = s.messages.filter(m => m.trim().length > 0);
  const lead = s.rotateMessages && msgs.length > 0
    ? msgs[((rotationIndex % msgs.length) + msgs.length) % msgs.length]
    : s.customText;
  if (lead && lead.trim()) parts.push(lead.trim());
  if (s.showClock) {
    parts.push(new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', hour12: !s.clock24h,
    }));
  }
  if (s.showDate) {
    parts.push(new Date().toLocaleDateString([], {
      weekday: 'short', day: 'numeric', month: 'short',
    }));
  }
  if (s.showUptime) {
    const ms = Date.now() - appStart;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    parts.push(h > 0 ? `up ${h}h ${m}m` : `up ${m}m`);
  }
  return parts.join(s.separator).slice(0, 144);
}

interface OSCState {
  connected: boolean;
  config: OSCConfig;
  chatboxStatus: OSCChatboxStatus;
  parameters: Record<string, any>;
  log: OSCMessage[];

  start: () => Promise<void>;
  stop: () => Promise<void>;
  send: (address: string, args?: any[]) => Promise<void>;
  setConfig: (patch: Partial<OSCConfig>) => void;
  setChatboxStatus: (patch: Partial<OSCChatboxStatus>) => void;
  ingest: (msg: OSCMessage) => void;
  setStatus: (s: { connected: boolean }) => void;
  clearLog: () => void;
  clearParameters: () => Promise<void>;
}

let listenersAttached = false;

export const useOSCStore = create<OSCState>((set, get) => ({
  connected: false,
  config: loadConfig(),
  chatboxStatus: loadChatboxStatus(),
  parameters: {},
  log: [],

  start: async () => {
    if (!window.electronAPI?.oscStart) return;
    if (!listenersAttached) {
      listenersAttached = true;
      window.electronAPI.onOscMessage((msg) => {
        const ts = Date.now();
        get().ingest({ ts, address: msg.address, args: msg.args });
        if (msg.address.startsWith('/avatar/parameters/')) {
          const value = Array.isArray(msg.args) && msg.args.length > 0 ? msg.args[0] : null;
          set(state => ({ parameters: { ...state.parameters, [msg.address]: value } }));
        }
      });
      window.electronAPI.onOscStatus((s) => {
        set({ connected: !!s.connected });
      });
    }
    const cfg = get().config;
    const res = await window.electronAPI.oscStart({
      sendHost: cfg.sendHost,
      sendPort: cfg.sendPort,
      recvPort: cfg.recvPort,
    });
    if (res?.ok) set({ connected: true });
  },

  stop: async () => {
    await window.electronAPI?.oscStop();
    set({ connected: false });
  },

  send: async (address, args = []) => {
    await window.electronAPI?.oscSend(address, args);
    get().ingest({ ts: Date.now(), address, args, outgoing: true });
  },

  setConfig: (patch) => {
    const cfg = { ...get().config, ...patch };
    saveConfig(cfg);
    set({ config: cfg });
  },

  setChatboxStatus: (patch) => {
    const next = { ...get().chatboxStatus, ...patch };
    next.intervalSec = Math.max(3, Math.min(60, Math.round(next.intervalSec) || 5));
    saveChatboxStatus(next);
    set({ chatboxStatus: next });
    applyChatboxLoop();
  },

  ingest: (msg) => {
    set(state => {
      const max = state.config.logSize;
      const log = [msg, ...state.log].slice(0, max);
      return { log };
    });
  },

  setStatus: ({ connected }) => set({ connected }),

  clearLog: () => set({ log: [] }),

  clearParameters: async () => {
    await window.electronAPI?.oscClearCache();
    set({ parameters: {} });
  },
}));

// ─── Chatbox "live status" loop ──────────────────────────────────────────────
// Owned by the store (a module singleton) so it keeps ticking while VRC Studio
// is open, regardless of which page is mounted.

let chatboxTimer: ReturnType<typeof setInterval> | null = null;
let rotationIndex = 0;

/** Start/stop the recurring chatbox-status sender to match current settings. */
function applyChatboxLoop() {
  if (chatboxTimer) { clearInterval(chatboxTimer); chatboxTimer = null; }
  const s = useOSCStore.getState().chatboxStatus;
  if (!s.enabled) return;
  const tick = () => {
    const st = useOSCStore.getState();
    if (!st.connected) return;
    const msg = composeChatboxStatus(st.chatboxStatus, rotationIndex++);
    if (!msg) return;
    st.send('/chatbox/input', [
      { type: 's', value: msg },
      { type: 'T', value: true },
      { type: 'F', value: false },
    ]).catch(() => {});
  };
  tick();
  chatboxTimer = setInterval(tick, s.intervalSec * 1000);
}

// Resume the loop if it was left enabled in a previous session.
applyChatboxLoop();
