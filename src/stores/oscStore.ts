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

const CFG_KEY = 'vrcstudio_osc_config';

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

interface OSCState {
  connected: boolean;
  config: OSCConfig;
  parameters: Record<string, any>;
  log: OSCMessage[];

  start: () => Promise<void>;
  stop: () => Promise<void>;
  send: (address: string, args?: any[]) => Promise<void>;
  setConfig: (patch: Partial<OSCConfig>) => void;
  ingest: (msg: OSCMessage) => void;
  setStatus: (s: { connected: boolean }) => void;
  clearLog: () => void;
  clearParameters: () => Promise<void>;
}

let listenersAttached = false;

export const useOSCStore = create<OSCState>((set, get) => ({
  connected: false,
  config: loadConfig(),
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
