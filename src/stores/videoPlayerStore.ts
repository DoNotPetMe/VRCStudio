// Tracks video URLs played in VRChat video players, pinned to the instance
// they were played in.
//
// We don't try to detect which player picked the video (master, queue, etc.)
// — VRChat's log just records the URL the player is about to load. So we
// treat "played video" as "URL that appeared in [Video Playback] (URL ...)".
//
// Data lives keyed by `<worldId>:<instanceId>` so visiting the same instance
// twice merges its histories; visiting a different instance of the same
// world keeps them separate.

import { create } from 'zustand';

export interface PlayedVideo {
  id: string;
  url: string;
  timestamp: number;
  worldId?: string;
  worldName?: string;
  instanceId?: string;
  /** Best-effort display name from the URL (YouTube ID, filename, host). */
  label?: string;
}

const STORAGE_KEY = 'vrcstudio_video_history';
const MAX_PER_INSTANCE = 200;
const MAX_INSTANCES_KEPT = 100;

interface PersistShape {
  history: Record<string, PlayedVideo[]>; // keyed by `${worldId}:${instanceId}`
}

function loadPersisted(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { history: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.history) return parsed;
    return { history: {} };
  } catch {
    return { history: {} };
  }
}

function savePersisted(state: PersistShape) {
  try {
    // Cap the number of instances we keep to avoid unbounded growth.
    const keys = Object.keys(state.history);
    if (keys.length > MAX_INSTANCES_KEPT) {
      // Drop the oldest ones (lowest latest timestamp).
      const sorted = keys.map(k => ({
        k,
        latest: Math.max(0, ...state.history[k].map(v => v.timestamp)),
      })).sort((a, b) => b.latest - a.latest);
      const keep = sorted.slice(0, MAX_INSTANCES_KEPT);
      const trimmed: PersistShape['history'] = {};
      for (const { k } of keep) trimmed[k] = state.history[k];
      state = { history: trimmed };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Tries to pull a human-readable label out of a video URL.
 * Prefers YouTube IDs, then file paths, then host name.
 */
function labelForUrl(url: string): string {
  try {
    const u = new URL(url);
    // YouTube
    if (/youtube\.com|youtu\.be/.test(u.hostname)) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop();
      return id ? `YouTube · ${id}` : 'YouTube';
    }
    // Twitch
    if (/twitch\.tv/.test(u.hostname)) return 'Twitch · ' + (u.pathname.split('/').filter(Boolean)[0] ?? '');
    // Vimeo
    if (/vimeo\.com/.test(u.hostname)) return 'Vimeo · ' + (u.pathname.split('/').filter(Boolean).pop() ?? '');
    // Generic media file
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && /\.(mp4|webm|mov|m3u8|mpd|mp3|ogg|wav)$/i.test(last)) {
      return `${u.hostname} · ${decodeURIComponent(last)}`;
    }
    return u.hostname;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '…' : url;
  }
}

/**
 * Parses one VRChat log line for either a video URL or a world transition
 * (so we can keep the "current instance" context up to date).
 *
 * Returns either:
 *   { kind: 'video',  url, timestamp }
 *   { kind: 'enter',  worldId, instanceId, timestamp }
 *   null
 */
interface ParsedVideoLine  { kind: 'video';  url: string; timestamp: number; }
interface ParsedEnterLine  { kind: 'enter';  worldId: string; instanceId: string; timestamp: number; }
type ParsedLine = ParsedVideoLine | ParsedEnterLine | null;

const TIMESTAMP_RE = /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/;
const VIDEO_URL_RE = /\[Video Playback\][^\n]*?(https?:\/\/[^\s"'<>]+)/i;
const USHARP_VIDEO_URL_RE = /\[USharpVideo\][^\n]*?(https?:\/\/[^\s"'<>]+)/i;
const VIDEO_URL_GENERIC_RE = /Attempting to resolve URL [`'"](https?:\/\/[^\s"'`<>]+)[`'"]/i;
const JOIN_ROOM_RE = /Joining\s+(wrld_[a-f0-9-]+):([^\s]+)/i;

function parseLine(line: string): ParsedLine {
  const tsm = line.match(TIMESTAMP_RE);
  const ts = tsm
    ? new Date(tsm[1].replace(/\./g, '-').replace(' ', 'T')).getTime()
    : Date.now();
  const body = tsm ? tsm[2] : line;

  let m: RegExpMatchArray | null;
  if ((m = body.match(VIDEO_URL_RE)) ||
      (m = body.match(USHARP_VIDEO_URL_RE)) ||
      (m = body.match(VIDEO_URL_GENERIC_RE))) {
    return { kind: 'video', url: m[1], timestamp: ts || Date.now() };
  }
  if ((m = body.match(JOIN_ROOM_RE))) {
    return { kind: 'enter', worldId: m[1], instanceId: m[2], timestamp: ts || Date.now() };
  }
  return null;
}

interface CurrentCtx {
  worldId?: string;
  worldName?: string;
  instanceId?: string;
}

interface VideoPlayerState {
  history: Record<string, PlayedVideo[]>;
  /** Most recent video played anywhere — treated as "now playing". */
  current: PlayedVideo | null;
  /** Context we pin newly-parsed videos to. Updated by external callers
   *  whenever the instance changes (websocket / instance store). */
  ctx: CurrentCtx;
  /** True when log tailing has been started successfully. */
  tailingActive: boolean;
  tailingPath?: string;

  setContext: (ctx: CurrentCtx) => void;
  ingestLines: (lines: string[]) => void;
  getForInstance: (worldId: string, instanceId: string) => PlayedVideo[];
  getRecent: (limit?: number) => PlayedVideo[];
  clearHistory: () => void;
  clearCurrent: () => void;
  setTailingStatus: (active: boolean, path?: string) => void;
}

let videoCounter = 0;

export const useVideoPlayerStore = create<VideoPlayerState>((set, get) => ({
  history: loadPersisted().history,
  current: null,
  ctx: {},
  tailingActive: false,
  tailingPath: undefined,

  setContext: (ctx) => set({ ctx: { ...get().ctx, ...ctx } }),

  setTailingStatus: (tailingActive, tailingPath) => set({ tailingActive, tailingPath }),

  ingestLines: (lines) => {
    let { current, history, ctx } = get();
    let mutated = false;

    for (const line of lines) {
      const p = parseLine(line);
      if (!p) continue;

      if (p.kind === 'enter') {
        // Update context from log — fills in worldId/instanceId even if the
        // websocket-driven instance store hasn't caught up yet.
        ctx = { ...ctx, worldId: p.worldId, instanceId: p.instanceId };
        continue;
      }

      // p.kind === 'video'
      const wid = ctx.worldId;
      const iid = ctx.instanceId;
      const key = wid && iid ? `${wid}:${iid}` : '__unknown__';

      const entry: PlayedVideo = {
        id: `vid_${Date.now()}_${videoCounter++}`,
        url: p.url,
        timestamp: p.timestamp,
        worldId: wid,
        worldName: ctx.worldName,
        instanceId: iid,
        label: labelForUrl(p.url),
      };

      // De-dupe: if the same URL was just played within the last 8 seconds
      // in this instance, skip it (VRChat often logs the same URL twice).
      const bucket = history[key] ?? [];
      const dupe = bucket.find(v => v.url === entry.url && Math.abs(v.timestamp - entry.timestamp) < 8000);
      if (dupe) {
        current = dupe;
        continue;
      }

      const newBucket = [entry, ...bucket].slice(0, MAX_PER_INSTANCE);
      history = { ...history, [key]: newBucket };
      current = entry;
      mutated = true;
    }

    set({ history, current, ctx });
    if (mutated) savePersisted({ history });
  },

  getForInstance: (worldId, instanceId) => {
    if (!worldId || !instanceId) return [];
    return get().history[`${worldId}:${instanceId}`] ?? [];
  },

  getRecent: (limit = 25) => {
    const all: PlayedVideo[] = [];
    for (const arr of Object.values(get().history)) all.push(...arr);
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  },

  clearHistory: () => {
    set({ history: {}, current: null });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },

  clearCurrent: () => set({ current: null }),
}));
