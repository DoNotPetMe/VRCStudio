import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio, MessageSquare, Sliders, Zap, Send, Power, Settings as SettingsIcon,
  AlertCircle, Trash2, ArrowDownToLine, Copy, Check, RotateCw, ChevronDown,
  ChevronRight, Clock, Activity, Plus, Minus,
} from 'lucide-react';
import { useOSCStore, composeChatboxStatus, OSCMessage } from '../stores/oscStore';

type Tab = 'chatbox' | 'params' | 'presets' | 'monitor' | 'config';

export default function OSCPage() {
  const { connected, config, parameters, log, start, stop, send, setConfig, clearLog, clearParameters } = useOSCStore();
  const [tab, setTab] = useState<Tab>('chatbox');
  const [error, setError] = useState<string | null>(null);

  // Auto-start if configured
  useEffect(() => {
    if (config.autoStart && !connected) {
      start().catch(e => setError(e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const toggle = async () => {
    setError(null);
    try {
      if (connected) await stop();
      else await start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio size={22} className="text-accent-400" /> OSC
          </h1>
          <p className="text-xs text-surface-500 mt-1">
            Bidirectional OSC bridge for VRChat &middot; sends to <span className="text-surface-400">{config.sendHost}:{config.sendPort}</span> &middot; listens on <span className="text-surface-400">:{config.recvPort}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
            connected ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-surface-600'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            onClick={toggle}
            className={`text-sm flex items-center gap-1.5 ${connected ? 'btn-secondary' : 'btn-primary'}`}
          >
            <Power size={14} />
            {connected ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-3 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-400 flex-1">{error}</p>
        </div>
      )}

      {!window.electronAPI && (
        <div className="glass-panel-solid border border-amber-500/30 bg-amber-500/10 p-3 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">OSC requires the desktop app — running in a browser, send/receive will not work.</p>
        </div>
      )}

      <div className="flex gap-1 border-b border-surface-800 pb-px overflow-x-auto">
        {([
          { key: 'chatbox' as Tab,  icon: MessageSquare,   label: 'Chatbox' },
          { key: 'params' as Tab,   icon: Sliders,         label: 'Parameters' },
          { key: 'presets' as Tab,  icon: Zap,             label: 'Triggers' },
          { key: 'monitor' as Tab,  icon: ArrowDownToLine, label: `Monitor${log.length > 0 ? ` (${log.length})` : ''}` },
          { key: 'config' as Tab,   icon: SettingsIcon,    label: 'Config' },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {tab === 'chatbox' && <ChatboxTab connected={connected} send={send} />}
      {tab === 'params' && <ParametersTab parameters={parameters} send={send} clear={clearParameters} />}
      {tab === 'presets' && <PresetsTab connected={connected} send={send} />}
      {tab === 'monitor' && <MonitorTab log={log} clear={clearLog} send={send} />}
      {tab === 'config' && <ConfigTab config={config} setConfig={setConfig} connected={connected} restart={async () => { await stop(); await start(); }} />}
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Switch({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-accent-500' : 'bg-surface-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : ''
      }`} />
    </button>
  );
}

// ─── Chatbox ────────────────────────────────────────────────────────────────

function ChatboxTab({ connected, send }: { connected: boolean; send: (a: string, args?: any[]) => Promise<void> }) {
  const [text, setText] = useState('');
  const [silent, setSilent] = useState(true);
  const [showTyping, setShowTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cb = useOSCStore(s => s.chatboxStatus);
  const setChatboxStatus = useOSCStore(s => s.setChatboxStatus);

  // Tick once a second so the live preview clock stays current.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const preview = composeChatboxStatus(cb);

  const sendMsg = async (asTyping = false) => {
    if (!asTyping && !text.trim()) return;
    if (asTyping) {
      await send('/chatbox/typing', [{ type: 'T', value: true }]);
      return;
    }
    await send('/chatbox/input', [
      { type: 's', value: text.trim() },
      { type: 'T', value: true },                  // bypass keyboard (send immediately)
      { type: silent ? 'F' : 'T', value: !silent }, // sfx
    ]);
    setText('');
  };

  const onChange = (v: string) => {
    setText(v);
    if (showTyping) {
      send('/chatbox/typing', [{ type: 'T', value: true }]);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        send('/chatbox/typing', [{ type: 'F', value: false }]);
      }, 1500);
    }
  };

  const clear = async () => {
    await send('/chatbox/input', [
      { type: 's', value: '' },
      { type: 'T', value: true },
      { type: 'F', value: false },
    ]);
  };

  const QUICK = ['👋 Hi!', 'AFK', 'BRB', 'gn ✨', '🎉', 'lol', '💜', '✨ here'];

  return (
    <div className="space-y-4">
      <div className="glass-panel-solid p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Send to in-world chatbox</label>
          <p className="text-[11px] text-surface-500 mt-1">Goes through VRChat's avatar chat bubble at /chatbox/input.</p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
            maxLength={144}
            placeholder="Type a message... (max 144 chars)"
            className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500"
            disabled={!connected}
          />
          <button onClick={() => sendMsg()} disabled={!connected || !text.trim()} className="btn-primary text-sm flex items-center gap-1.5">
            <Send size={14} /> Send
          </button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-surface-400 cursor-pointer">
              <input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)} className="accent-accent-500" />
              Silent (no SFX)
            </label>
            <label className="flex items-center gap-2 text-surface-400 cursor-pointer">
              <input type="checkbox" checked={showTyping} onChange={e => setShowTyping(e.target.checked)} className="accent-accent-500" />
              Show typing indicator
            </label>
          </div>
          <span className="text-surface-500 tabular-nums">{text.length} / 144</span>
          <button onClick={clear} disabled={!connected} className="btn-ghost text-xs flex items-center gap-1">
            <Trash2 size={11} /> Clear chatbox
          </button>
        </div>

        <div>
          <div className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">Quick send</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <button
                key={q}
                onClick={() => { setText(q); setTimeout(() => sendMsg(), 0); }}
                disabled={!connected}
                className="px-2.5 py-1 text-xs bg-surface-800 hover:bg-surface-700 rounded transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live status auto-sender ── */}
      <div className="glass-panel-solid p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-accent-400" />
            <span className="text-sm font-semibold">Live status</span>
            {cb.enabled && (
              <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                every {cb.intervalSec}s
              </span>
            )}
          </div>
          <Switch checked={cb.enabled} onChange={v => setChatboxStatus({ enabled: v })} />
        </div>
        <p className="text-[11px] text-surface-500">
          Keeps your chatbox updated on a timer — a live clock, the date, your session
          uptime, or a custom note. Runs the whole time VRC Studio is open, even on other pages.
        </p>

        <div className="bg-surface-900 border border-surface-800 rounded-lg px-3 py-2">
          <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-0.5">Preview</div>
          <div className="text-sm text-surface-100 break-words min-h-[1.25rem]">
            {preview || <span className="text-surface-600">(nothing enabled)</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
            <input type="checkbox" checked={cb.showClock} onChange={e => setChatboxStatus({ showClock: e.target.checked })} className="accent-accent-500" />
            Clock
          </label>
          <label className={`flex items-center gap-2 text-xs cursor-pointer ${cb.showClock ? 'text-surface-300' : 'text-surface-600'}`}>
            <input type="checkbox" checked={cb.clock24h} disabled={!cb.showClock} onChange={e => setChatboxStatus({ clock24h: e.target.checked })} className="accent-accent-500" />
            24-hour time
          </label>
          <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
            <input type="checkbox" checked={cb.showDate} onChange={e => setChatboxStatus({ showDate: e.target.checked })} className="accent-accent-500" />
            Date
          </label>
          <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
            <input type="checkbox" checked={cb.showUptime} onChange={e => setChatboxStatus({ showUptime: e.target.checked })} className="accent-accent-500" />
            Session uptime
          </label>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            value={cb.customText}
            onChange={e => setChatboxStatus({ customText: e.target.value })}
            maxLength={80}
            placeholder="Custom message (optional)"
            className="flex-1 min-w-[200px] bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
          />
          <label className="flex items-center gap-1.5 text-xs text-surface-400">
            Every
            <input
              type="number" min={3} max={60}
              value={cb.intervalSec}
              onChange={e => setChatboxStatus({ intervalSec: parseInt(e.target.value, 10) || 5 })}
              className="w-14 bg-surface-900 border border-surface-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent-500"
            />
            s
          </label>
        </div>
        {cb.enabled && !connected && (
          <p className="text-[11px] text-amber-400">OSC is stopped — status will start sending once you connect.</p>
        )}
      </div>
    </div>
  );
}

// ─── Parameters ──────────────────────────────────────────────────────────────

const BUILTIN_RE = /^(VRMode|TrackingType|MuteSelf|InStation|Seated|AFK|Earmuffs|IsLocal|Upright|Grounded|Voice|Viseme|Velocity[XYZ]|GestureLeft|GestureRight|GestureLeftWeight|GestureRightWeight|AngularY|AvatarVersion|ScaleModified|ScaleFactor|EyeHeightAsMeters|EyeHeightAsPercent)$/;

function ParametersTab({ parameters, send, clear }: {
  parameters: Record<string, any>;
  send: (a: string, args?: any[]) => Promise<void>;
  clear: () => Promise<void>;
}) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = filter.toLowerCase();
    const entries = Object.entries(parameters).filter(([addr]) =>
      !q || addr.toLowerCase().includes(q)
    );
    const out: Record<string, [string, any][]> = { 'Custom': [], 'Built-in': [] };
    for (const [addr, val] of entries) {
      const name = addr.replace('/avatar/parameters/', '');
      out[BUILTIN_RE.test(name) ? 'Built-in' : 'Custom'].push([addr, val]);
    }
    out['Built-in'].sort();
    out['Custom'].sort();
    return out;
  }, [parameters, filter]);

  const totalCount = Object.keys(parameters).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`Filter ${totalCount} parameter${totalCount !== 1 ? 's' : ''}...`}
          className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500 min-w-0"
        />
        <button onClick={clear} className="btn-ghost text-xs flex items-center gap-1">
          <Trash2 size={12} /> Clear
        </button>
      </div>

      {totalCount === 0 && (
        <div className="glass-panel-solid p-8 text-center text-surface-500 text-sm">
          No parameters received yet. Make sure VRChat is running with OSC enabled, then change avatars or interact in-world to populate this list.
        </div>
      )}

      {totalCount > 0 && (
        <p className="text-[11px] text-surface-500 -mt-1">
          Live values from your avatar. Flip a switch, drag a slider or step an int to drive
          the parameter back into VRChat in real time.
        </p>
      )}

      {Object.entries(grouped).map(([group, entries]) => entries.length > 0 && (
        <div key={group} className="glass-panel-solid overflow-hidden">
          <button
            onClick={() => setCollapsed(c => ({ ...c, [group]: !c[group] }))}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              {collapsed[group] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="text-sm font-semibold">{group}</span>
              <span className="text-[10px] text-surface-500">({entries.length})</span>
            </div>
          </button>
          {!collapsed[group] && (
            <div className="divide-y divide-surface-800/40">
              {entries.map(([addr, val]) => (
                <div key={addr} className="px-4 py-2 flex items-center gap-3 hover:bg-surface-800/30 transition-colors">
                  <code className="text-xs text-surface-300 flex-1 truncate min-w-0" title={addr}>
                    {addr.replace('/avatar/parameters/', '')}
                  </code>
                  <ParamControl addr={addr} value={val} send={send} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ParamControl({ addr, value, send }: {
  addr: string;
  value: any;
  send: (a: string, args?: any[]) => Promise<void>;
}) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-surface-600">—</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-[10px] tabular-nums w-7 text-right ${value ? 'text-green-400' : 'text-surface-500'}`}>
          {value ? 'on' : 'off'}
        </span>
        <Switch checked={value} onChange={v => send(addr, [v])} />
      </div>
    );
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => send(addr, [value - 1])}
            className="w-6 h-6 rounded bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-colors"
          >
            <Minus size={12} />
          </button>
          <code className="text-xs text-surface-100 tabular-nums w-10 text-center">{value}</code>
          <button
            onClick={() => send(addr, [value + 1])}
            className="w-6 h-6 rounded bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
      );
    }
    if (Math.abs(value) <= 1) {
      const min = value < 0 ? -1 : 0;
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min} max={1} step={0.01}
            value={value}
            onChange={e => send(addr, [parseFloat(e.target.value)])}
            className="w-28 accent-accent-500 cursor-pointer"
          />
          <code className="text-xs text-surface-200 tabular-nums w-12 text-right">{value.toFixed(2)}</code>
        </div>
      );
    }
    // Out-of-range floats (Velocity etc.) are telemetry — show value only.
    return <code className="text-xs text-surface-300 tabular-nums">{value.toFixed(3)}</code>;
  }

  return <ParamStringControl addr={addr} value={String(value)} send={send} />;
}

function ParamStringControl({ addr, value, send }: {
  addr: string;
  value: string;
  send: (a: string, args?: any[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(addr, [draft]); } }}
      onBlur={() => { if (draft !== value) send(addr, [draft]); }}
      className="bg-surface-900 border border-surface-700 rounded px-2 py-0.5 text-xs w-40 focus:outline-none focus:border-accent-500"
    />
  );
}

// ─── Triggers (presets) ─────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  address: string;
  args: any[];
  hold?: number; // ms before sending the "off" follow-up (for buttons)
  offArgs?: any[];
}

const PRESET_KEY = 'vrcstudio_osc_presets';

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [
    { id: 'wave',   label: 'Wave',         address: '/avatar/parameters/Wave',  args: [true], offArgs: [false], hold: 1500 },
    { id: 'sit',    label: 'Toggle Sit',   address: '/avatar/parameters/Sit',   args: [true] },
    { id: 'dance',  label: 'Dance',        address: '/avatar/parameters/Dance', args: [1] },
    { id: 'voice0', label: 'Mute Voice',   address: '/input/Voice',             args: [0] },
    { id: 'voice1', label: 'Unmute Voice', address: '/input/Voice',             args: [1] },
    { id: 'jump',   label: 'Jump',         address: '/input/Jump',              args: [1], offArgs: [0], hold: 100 },
  ];
}

function savePresets(p: Preset[]) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch {}
}

function PresetsTab({ connected, send }: { connected: boolean; send: (a: string, args?: any[]) => Promise<void> }) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [editing, setEditing] = useState<Preset | null>(null);

  const triggerPreset = async (p: Preset) => {
    await send(p.address, p.args);
    if (p.hold && p.offArgs) {
      setTimeout(() => send(p.address, p.offArgs!), p.hold);
    }
  };

  const update = (next: Preset[]) => {
    setPresets(next);
    savePresets(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-surface-500">
        One-click OSC triggers — toggle avatar parameters or fire actions. Use "hold" to
        auto-release after a delay (great for emotes).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {presets.map(p => (
          <div key={p.id} className="glass-panel-solid p-3 flex flex-col gap-2">
            <button
              onClick={() => triggerPreset(p)}
              disabled={!connected}
              className="flex-1 text-left"
            >
              <div className="text-sm font-semibold">{p.label}</div>
              <code className="text-[10px] text-surface-500 truncate block">{p.address}</code>
              <code className="text-[10px] text-surface-600">{JSON.stringify(p.args)}{p.hold ? ` → hold ${p.hold}ms` : ''}</code>
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => triggerPreset(p)}
                disabled={!connected}
                className="flex-1 text-xs btn-secondary"
              >
                <Zap size={11} className="inline" /> Trigger
              </button>
              <button onClick={() => setEditing(p)} className="btn-ghost px-1.5"><SettingsIcon size={11} /></button>
              <button
                onClick={() => update(presets.filter(x => x.id !== p.id))}
                className="btn-ghost px-1.5 text-rose-400 hover:text-rose-300"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setEditing({ id: `p_${Date.now()}`, label: 'New trigger', address: '/avatar/parameters/', args: [true] })}
          className="glass-panel border-dashed border-surface-700 p-3 text-sm text-surface-500 hover:text-surface-300 hover:border-accent-500/40 transition-colors"
        >
          + New trigger
        </button>
      </div>

      {editing && (
        <PresetEditor
          preset={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            const exists = presets.some(x => x.id === p.id);
            update(exists ? presets.map(x => x.id === p.id ? p : x) : [...presets, p]);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PresetEditor({ preset, onClose, onSave }: { preset: Preset; onClose: () => void; onSave: (p: Preset) => void }) {
  const [label, setLabel] = useState(preset.label);
  const [address, setAddress] = useState(preset.address);
  const [argsJSON, setArgsJSON] = useState(JSON.stringify(preset.args));
  const [hold, setHold] = useState<string>(preset.hold ? String(preset.hold) : '');
  const [offArgsJSON, setOffArgsJSON] = useState(preset.offArgs ? JSON.stringify(preset.offArgs) : '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      const args = JSON.parse(argsJSON);
      const offArgs = offArgsJSON ? JSON.parse(offArgsJSON) : undefined;
      const holdNum = hold ? parseInt(hold, 10) : undefined;
      onSave({ ...preset, label, address, args, hold: holdNum, offArgs });
    } catch {
      setError('Invalid JSON in args');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="glass-panel-solid w-full max-w-md mx-4 p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold">Edit trigger</h3>
        <Field label="Label">
          <input value={label} onChange={e => setLabel(e.target.value)} className="osc-input" />
        </Field>
        <Field label="OSC address">
          <input value={address} onChange={e => setAddress(e.target.value)} className="osc-input font-mono text-xs" />
        </Field>
        <Field label="Args (JSON array)" hint='e.g. [true]  or  [1.5]  or  ["hi"]'>
          <input value={argsJSON} onChange={e => setArgsJSON(e.target.value)} className="osc-input font-mono text-xs" />
        </Field>
        <Field label="Hold (ms, optional)">
          <input value={hold} onChange={e => setHold(e.target.value)} placeholder="e.g. 1500" className="osc-input" />
        </Field>
        <Field label="Off args (JSON array, sent after hold)">
          <input value={offArgsJSON} onChange={e => setOffArgsJSON(e.target.value)} placeholder="e.g. [false]" className="osc-input font-mono text-xs" />
        </Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} className="btn-primary text-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-surface-400 mb-1">{label}</div>
      {children}
      {hint && <p className="text-[10px] text-surface-600 mt-1">{hint}</p>}
    </label>
  );
}

// ─── Monitor (raw log) ──────────────────────────────────────────────────────

function MonitorTab({ log, clear, send }: { log: OSCMessage[]; clear: () => void; send: (a: string, args?: any[]) => Promise<void> }) {
  const [filter, setFilter] = useState('');
  const [showOutgoing, setShowOutgoing] = useState(true);
  const [showIncoming, setShowIncoming] = useState(true);
  const [rawAddr, setRawAddr] = useState('');
  const [rawArgs, setRawArgs] = useState('');
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    let sent = 0, recv = 0;
    for (const m of log) { if (m.outgoing) sent++; else recv++; }
    return { sent, recv };
  }, [log]);

  const filtered = useMemo(() => {
    return log.filter(m => {
      if (m.outgoing && !showOutgoing) return false;
      if (!m.outgoing && !showIncoming) return false;
      if (filter && !m.address.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [log, filter, showOutgoing, showIncoming]);

  const sendRaw = async () => {
    if (!rawAddr) return;
    let args: any[] = [];
    try {
      args = rawArgs ? JSON.parse(rawArgs) : [];
    } catch {
      alert('Args must be valid JSON, e.g. [true]  or  ["text"]');
      return;
    }
    await send(rawAddr, args);
  };

  const copyAll = () => {
    const text = filtered.map(m => `[${new Date(m.ts).toLocaleTimeString()}] ${m.outgoing ? '→' : '←'} ${m.address} ${JSON.stringify(m.args)}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="glass-panel-solid p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <input
          value={rawAddr}
          onChange={e => setRawAddr(e.target.value)}
          placeholder="/avatar/parameters/MyParam"
          className="osc-input font-mono text-xs"
        />
        <div className="flex gap-2">
          <input
            value={rawArgs}
            onChange={e => setRawArgs(e.target.value)}
            placeholder="[true]"
            className="osc-input font-mono text-xs w-32"
          />
          <button onClick={sendRaw} className="btn-primary text-sm flex items-center gap-1.5"><Send size={12} /> Send</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter address..."
          className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500 min-w-0"
        />
        <label className="flex items-center gap-1 text-xs text-surface-400 cursor-pointer">
          <input type="checkbox" checked={showOutgoing} onChange={e => setShowOutgoing(e.target.checked)} className="accent-accent-500" /> Sent
        </label>
        <label className="flex items-center gap-1 text-xs text-surface-400 cursor-pointer">
          <input type="checkbox" checked={showIncoming} onChange={e => setShowIncoming(e.target.checked)} className="accent-accent-500" /> Received
        </label>
        <button onClick={copyAll} className="btn-ghost text-xs flex items-center gap-1">
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={clear} className="btn-ghost text-xs flex items-center gap-1 text-rose-400 hover:text-rose-300">
          <Trash2 size={11} /> Clear
        </button>
      </div>

      <div className="flex items-center gap-4 text-xs text-surface-500 px-1">
        <span className="flex items-center gap-1"><Activity size={12} className="text-accent-400" /> {log.length} buffered</span>
        <span className="text-accent-400">↑ {stats.sent} sent</span>
        <span className="text-green-400">↓ {stats.recv} received</span>
      </div>

      <div className="glass-panel-solid overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">
            No OSC traffic yet. Sent/received messages will appear here in real time.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-surface-800/40">
            {filtered.map((m, i) => (
              <div key={i} className="px-3 py-1.5 flex items-center gap-3 text-xs hover:bg-surface-800/30 transition-colors">
                <span className="text-surface-600 tabular-nums w-20">{new Date(m.ts).toLocaleTimeString()}</span>
                <span className={`w-4 text-center ${m.outgoing ? 'text-accent-400' : 'text-green-400'}`}>{m.outgoing ? '→' : '←'}</span>
                <code className="flex-1 text-surface-300 truncate">{m.address}</code>
                <code className="text-surface-500 truncate max-w-[40%]">{JSON.stringify(m.args)}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Config ─────────────────────────────────────────────────────────────────

function ConfigTab({ config, setConfig, connected, restart }: {
  config: ReturnType<typeof useOSCStore.getState>['config'];
  setConfig: (patch: any) => void;
  connected: boolean;
  restart: () => Promise<void>;
}) {
  return (
    <div className="glass-panel-solid p-5 space-y-4 max-w-lg">
      <Field label="Send to host" hint="Default 127.0.0.1 — match VRChat's OSC settings">
        <input value={config.sendHost} onChange={e => setConfig({ sendHost: e.target.value })} className="osc-input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Send port" hint="VRChat receives on 9000">
          <input type="number" value={config.sendPort} onChange={e => setConfig({ sendPort: parseInt(e.target.value, 10) || 9000 })} className="osc-input" />
        </Field>
        <Field label="Receive port" hint="VRChat sends from 9001">
          <input type="number" value={config.recvPort} onChange={e => setConfig({ recvPort: parseInt(e.target.value, 10) || 9001 })} className="osc-input" />
        </Field>
      </div>
      <Field label="Log buffer size">
        <input type="number" value={config.logSize} onChange={e => setConfig({ logSize: Math.max(50, parseInt(e.target.value, 10) || 250) })} className="osc-input" />
      </Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={config.autoStart} onChange={e => setConfig({ autoStart: e.target.checked })} className="accent-accent-500" />
        Auto-start OSC when the app launches
      </label>
      <div className="pt-2 flex justify-end">
        <button onClick={restart} className="btn-secondary text-sm flex items-center gap-1.5">
          <RotateCw size={13} /> {connected ? 'Restart with new settings' : 'Apply settings'}
        </button>
      </div>
      <div className="border-t border-surface-800 pt-3">
        <p className="text-[11px] text-surface-500">
          To receive parameters, enable OSC in VRChat's <strong>Action Menu → Options → OSC</strong>. To check what your avatar exposes, look in
          <code className="mx-1 text-surface-400">%APPDATA%\..\LocalLow\VRChat\VRChat\OSC\&lt;userId&gt;\Avatars\</code>
        </p>
      </div>
    </div>
  );
}
