// Tracks which avatar every player in the current instance is wearing,
// plus performance stats parsed from VRChat's [AvatarPerformance] blocks.
//
// IMPORTANT: This store is *deliberately ephemeral*. No localStorage, no
// persistent app data — the user asked for this explicitly. Closing the
// app wipes everything. Switching instances also wipes the player map.

import { create } from 'zustand';
import { vrcdb } from '../api/vrcdb';
import type { VRCDBAvatar } from '../api/vrcdb';

export type PerfRank = 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Very Poor';

export interface AvatarStats {
  triangles?: number;
  materials?: number;
  meshes?: number;
  skinnedMeshes?: number;
  dynamicBones?: number;
  physBones?: number;
  particles?: number;
  audioSources?: number;
  drawCalls?: number;
  bones?: number;
  lights?: number;
  animators?: number;
}

export interface PlayerAvatar {
  playerName: string;
  avatarId?: string;
  avatarName?: string;     // from [AvatarPerformance] block
  rank?: PerfRank;
  stats?: AvatarStats;
  /** Result of vrcdb lookup: undefined = not looked up, null = looked up & no match, object = match. */
  vrcdbMatch?: VRCDBAvatar | null;
  vrcdbLooking?: boolean;  // in-flight
  seenAt: number;
  lastAvatarChangeAt?: number;
}

interface CurrentInstance {
  worldId?: string;
  worldName?: string;
  instanceId?: string;
}

interface State {
  byPlayer: Record<string, PlayerAvatar>;
  instance: CurrentInstance;
  lastResetAt: number;

  setInstanceContext: (ctx: CurrentInstance) => void;
  ingestLines: (lines: string[]) => void;
  lookupOnVrcdb: (avatarId: string) => Promise<void>;
  resetForInstance: () => void;
  removePlayer: (playerName: string) => void;
}

// ── Regex patterns ──────────────────────────────────────────────────────
//
// VRChat's log format is consistent enough that we can match these reliably.
// Some patterns vary by VRChat version — we keep multiple fallbacks.

const TIMESTAMP_RE = /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+\w+\s+-\s+(.+)$/;
const TIMESTAMP_RE_SIMPLE = /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/;

// Player joined / left — used to add/remove from the byPlayer map.
const PLAYER_JOINED_RE = /\[Behaviour\]\s+OnPlayerJoined\s+(.+)/;
const PLAYER_LEFT_RE   = /\[Behaviour\]\s+OnPlayerLeft\s+(.+)/;

// Avatar set/switch. VRChat changes the wording every other update; we keep
// half a dozen variants. All capture (playerName, avatarId).
const AVATAR_PATTERNS = [
  // [AvatarManager] Switching User (usr_xxx) to avatar avtr_xxx
  /\[AvatarManager\]\s+Switching\s+(.+?)\s+\(usr_[a-f0-9-]+\)\s+to\s+avatar\s+(avtr_[a-f0-9-]+)/i,
  // [AvatarManagement] Switching <player> to avatar avtr_xxx
  /\[AvatarManagement\]\s+Switching\s+(.+?)\s+to\s+avatar\s+(avtr_[a-f0-9-]+)/i,
  // [Behaviour] Switching <player> to avatar avtr_xxx
  /\[Behaviour\]\s+Switching\s+(.+?)\s+to\s+avatar\s+(avtr_[a-f0-9-]+)/i,
  // [Behaviour] OnAvatarInstantiated <player> avtr_xxx
  /\[Behaviour\]\s+OnAvatarInstantiated\s+(.+?)\s+(avtr_[a-f0-9-]+)/i,
  // [AvatarLoader] Begin loading avatar avtr_xxx for <player>
  /\[AvatarLoader\]\s+Begin\s+loading\s+avatar\s+(avtr_[a-f0-9-]+)\s+for\s+(.+)/i,
];

// [AvatarPerformance] Avatar Stats for Avatar 'NAME'
const PERF_BLOCK_START_RE = /\[AvatarPerformance\]\s+Avatar Stats for Avatar\s+['"](.+?)['"]/i;
// Performance Rating: Excellent|Good|Medium|Poor|Very Poor
const PERF_RANK_RE = /Performance Rating:\s+(Excellent|Good|Medium|Poor|Very Poor)/i;
// Stat lines: "Stats Total: <Label>: <Number>"
const PERF_STAT_RE = /(?:Stats\s+Total:\s+)?([A-Za-z][A-Za-z ]*?):\s+([\d,]+)/;

// Maps the human label in [AvatarPerformance] to our AvatarStats key.
function statKeyFor(label: string): keyof AvatarStats | null {
  const k = label.toLowerCase().trim();
  if (k.includes('triangle')) return 'triangles';
  if (k.includes('material')) return 'materials';
  if (k.includes('skinned mesh')) return 'skinnedMeshes';
  if (k === 'mesh count' || k.endsWith('mesh count')) return 'meshes';
  if (k.includes('dynamic bone')) return 'dynamicBones';
  if (k.includes('physbone') || k.includes('phys bone')) return 'physBones';
  if (k.includes('particle')) return 'particles';
  if (k.includes('audio source')) return 'audioSources';
  if (k.includes('draw call')) return 'drawCalls';
  if (k === 'bones' || k.includes('bone count')) return 'bones';
  if (k.includes('light')) return 'lights';
  if (k.includes('animator')) return 'animators';
  return null;
}

function parseTs(line: string): { body: string; ts: number } {
  let m = line.match(TIMESTAMP_RE);
  if (!m) m = line.match(TIMESTAMP_RE_SIMPLE);
  if (m) {
    const ts = new Date(m[1].replace(/\./g, '-').replace(' ', 'T')).getTime();
    return { body: m[2], ts: isNaN(ts) ? Date.now() : ts };
  }
  return { body: line, ts: Date.now() };
}

// ── Performance block state machine ─────────────────────────────────────
//
// We see lines one at a time. A perf block looks like:
//
//   [AvatarPerformance] Avatar Stats for Avatar 'Cute Wolf'
//   Stats Total: Triangle Count: 32756
//   Stats Total: Material Count: 4
//   …
//   Performance Rating: Good
//
// The avatar name in the start line is the *avatar's* internal name, NOT
// the player's name. We don't know which player it belongs to from this
// block alone — VRChat doesn't repeat the player name in the perf block.
// We attach the perf info to the most-recent avatar switch the player did
// just before this block by avatar *name* match (when one exists) or by
// keeping a "last switched" pointer per recently-loaded avatar id.

interface PendingPerf {
  avatarName: string;
  stats: AvatarStats;
  rank?: PerfRank;
}

let pendingPerf: PendingPerf | null = null;
// Avatar IDs whose names we've recorded, so we can match perf blocks back
// to the player(s) who switched into them.
const recentAvatarByName = new Map<string, { playerName: string; avatarId?: string; at: number }>();

// ── The store ───────────────────────────────────────────────────────────

export const useInstanceAvatarsStore = create<State>((set, get) => ({
  byPlayer: {},
  instance: {},
  lastResetAt: Date.now(),

  setInstanceContext: (ctx) => {
    const prev = get().instance;
    // If we genuinely changed instance, wipe the player map.
    if (prev.worldId !== ctx.worldId || prev.instanceId !== ctx.instanceId) {
      set({ instance: ctx, byPlayer: {}, lastResetAt: Date.now() });
      pendingPerf = null;
      recentAvatarByName.clear();
    } else {
      set({ instance: ctx });
    }
  },

  resetForInstance: () => {
    set({ byPlayer: {}, lastResetAt: Date.now() });
    pendingPerf = null;
    recentAvatarByName.clear();
  },

  removePlayer: (playerName) => {
    const map = { ...get().byPlayer };
    delete map[playerName];
    set({ byPlayer: map });
  },

  ingestLines: (lines) => {
    const map = { ...get().byPlayer };
    let changed = false;

    for (const raw of lines) {
      const { body, ts } = parseTs(raw);

      // ── World transition: reset the map ──
      if (/\[Behaviour\]\s+Entering Room:/.test(body) || /Joining\s+wrld_/.test(body)) {
        // Don't reset here — setInstanceContext handles it from the
        // instanceHistoryStore side. Just clear the perf block in flight.
        pendingPerf = null;
        continue;
      }

      // ── Player joined ──
      let m = body.match(PLAYER_JOINED_RE);
      if (m) {
        const name = m[1].trim().replace(/\s*\(usr_[a-f0-9-]+\)\s*$/, '');
        if (!map[name]) {
          map[name] = { playerName: name, seenAt: ts };
          changed = true;
        }
        continue;
      }

      // ── Player left ──
      m = body.match(PLAYER_LEFT_RE);
      if (m) {
        const name = m[1].trim().replace(/\s*\(usr_[a-f0-9-]+\)\s*$/, '');
        if (map[name]) {
          delete map[name];
          changed = true;
        }
        continue;
      }

      // ── Avatar switch ──
      let avatarMatched = false;
      for (let i = 0; i < AVATAR_PATTERNS.length; i++) {
        m = body.match(AVATAR_PATTERNS[i]);
        if (!m) continue;
        avatarMatched = true;

        // Pattern 4 ([AvatarLoader]) has (avatarId, playerName) order.
        const isLoader = i === 4;
        const playerName = (isLoader ? m[2] : m[1]).trim();
        const avatarId = isLoader ? m[1] : m[2];

        const existing = map[playerName];
        map[playerName] = {
          ...(existing ?? { playerName, seenAt: ts }),
          avatarId,
          lastAvatarChangeAt: ts,
          // Clear any previous match so the next render triggers a fresh lookup.
          vrcdbMatch: existing?.avatarId === avatarId ? existing.vrcdbMatch : undefined,
          vrcdbLooking: false,
          // Keep perf stats only if same avatar; otherwise stale.
          rank: existing?.avatarId === avatarId ? existing.rank : undefined,
          stats: existing?.avatarId === avatarId ? existing.stats : undefined,
          avatarName: existing?.avatarId === avatarId ? existing.avatarName : undefined,
        };
        changed = true;
        break;
      }
      if (avatarMatched) continue;

      // ── Performance block: start ──
      m = body.match(PERF_BLOCK_START_RE);
      if (m) {
        pendingPerf = { avatarName: m[1].trim(), stats: {} };
        continue;
      }

      // ── Performance block: stat lines (only while a block is open) ──
      if (pendingPerf) {
        m = body.match(PERF_RANK_RE);
        if (m) {
          pendingPerf.rank = m[1] as PerfRank;

          // Finalize: attach to any players currently wearing an avatar
          // with this internal name. We don't have a direct avatarId →
          // name mapping from the log, so we match by name when possible,
          // and as a fallback attach to the most recent avatar swap on
          // record.
          const targetName = pendingPerf.avatarName;
          for (const k of Object.keys(map)) {
            const p = map[k];
            // Match by recorded avatarName, OR if this player just swapped
            // and has no rank yet, attach the new perf data.
            const matchesName = p.avatarName === targetName;
            const recentlySwapped = p.lastAvatarChangeAt &&
              ts - p.lastAvatarChangeAt < 12_000 &&
              p.rank == null;
            if (matchesName || recentlySwapped) {
              map[k] = {
                ...p,
                avatarName: targetName,
                rank: pendingPerf.rank,
                stats: { ...(p.stats ?? {}), ...pendingPerf.stats },
              };
              changed = true;
            }
          }
          pendingPerf = null;
          continue;
        }

        const statM = body.match(PERF_STAT_RE);
        if (statM) {
          const key = statKeyFor(statM[1]);
          const value = parseInt(statM[2].replace(/,/g, ''), 10);
          if (key && !isNaN(value)) {
            pendingPerf.stats[key] = value;
          }
        }
      }
    }

    if (changed) set({ byPlayer: map });
  },

  lookupOnVrcdb: async (avatarId) => {
    // Find first player with this avatarId
    const state = get();
    const playerKey = Object.keys(state.byPlayer).find(
      k => state.byPlayer[k].avatarId === avatarId,
    );
    if (!playerKey) return;
    if (state.byPlayer[playerKey].vrcdbLooking) return;
    if (state.byPlayer[playerKey].vrcdbMatch !== undefined) return;

    // Mark in-flight
    set({
      byPlayer: {
        ...get().byPlayer,
        [playerKey]: { ...get().byPlayer[playerKey], vrcdbLooking: true },
      },
    });

    try {
      const results = await vrcdb.getById(avatarId);
      const match = results.find(r => r.id === avatarId) ?? results[0] ?? null;

      // Apply match to ALL players currently wearing this avatar
      const next = { ...get().byPlayer };
      for (const k of Object.keys(next)) {
        if (next[k].avatarId === avatarId) {
          next[k] = { ...next[k], vrcdbMatch: match ?? null, vrcdbLooking: false };
        }
      }
      set({ byPlayer: next });
    } catch {
      const next = { ...get().byPlayer };
      for (const k of Object.keys(next)) {
        if (next[k].avatarId === avatarId) {
          next[k] = { ...next[k], vrcdbMatch: null, vrcdbLooking: false };
        }
      }
      set({ byPlayer: next });
    }
  },
}));
