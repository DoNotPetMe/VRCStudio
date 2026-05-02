import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pin, PinOff, Shirt, RotateCw, Search, Check, Clock } from 'lucide-react';
import api from '../api/vrchat';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';
import { useAuthStore } from '../stores/authStore';
import type { VRCAvatar } from '../types/vrchat';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AvatarSwitcher({ open, onClose }: Props) {
  const {
    pinnedIds, recentIds, cachedAvatars,
    togglePin, recordSwitch, setCache, isCacheStale, isPinned,
  } = useAvatarSwitcherStore();
  const { user } = useAuthStore();

  const [filter, setFilter] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [wornId, setWornId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const fetchAvatars = useCallback(async () => {
    setIsFetching(true);
    try {
      const [ownRes, favRes] = await Promise.allSettled([
        api.getOwnAvatars(100),
        api.getFavorites('avatar', 100).then(favs =>
          Promise.all(favs.map(f => api.getAvatar(f.favoriteId).catch(() => null)))
        ),
      ]);

      const own = ownRes.status === 'fulfilled' ? ownRes.value : [];
      const favsFull = favRes.status === 'fulfilled' ? favRes.value.filter((a): a is VRCAvatar => a !== null) : [];

      // Merge, dedup by ID, own avatars take priority
      const seen = new Set<string>();
      const merged: VRCAvatar[] = [];
      for (const a of [...own, ...favsFull]) {
        if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      }
      setCache(merged);
    } catch {}
    setIsFetching(false);
  }, [setCache]);

  // Fetch when panel opens if cache is stale
  useEffect(() => {
    if (open) {
      if (cachedAvatars.length === 0 || isCacheStale()) fetchAvatars();
      setTimeout(() => filterRef.current?.focus(), 80);
    }
  }, [open]);

  // Close on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose]);

  const handleWear = async (avatar: VRCAvatar) => {
    if (wearingId) return;
    setWearingId(avatar.id);
    try {
      await api.selectAvatar(avatar.id);
      recordSwitch(avatar.id);
      setWornId(avatar.id);
      setTimeout(() => setWornId(null), 3000);
    } catch {}
    setWearingId(null);
  };

  if (!open) return null;

  const q = filter.toLowerCase();
  const allAvatars = cachedAvatars.filter(a =>
    !q || a.name.toLowerCase().includes(q) || a.authorName.toLowerCase().includes(q)
  );

  const byId = new Map(cachedAvatars.map(a => [a.id, a]));

  // Sections — only include avatars that exist in the cache
  const pinnedAvatars = pinnedIds.map(id => byId.get(id)).filter((a): a is VRCAvatar => !!a)
    .filter(a => !q || a.name.toLowerCase().includes(q));
  const recentAvatars = recentIds.map(id => byId.get(id)).filter((a): a is VRCAvatar => !!a)
    .filter(a => !q || a.name.toLowerCase().includes(q))
    .slice(0, 5);
  const pinnedSet = new Set(pinnedIds);
  const recentSet = new Set(recentIds.slice(0, 5));
  const restAvatars = allAvatars
    .filter(a => !pinnedSet.has(a.id) && !recentSet.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentAvatarId = user?.currentAvatar;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative pointer-events-auto w-80 h-full bg-surface-900 border-l border-surface-800/60 flex flex-col shadow-2xl animate-slide-in-right"
        style={{ maxHeight: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800/60 flex-shrink-0">
          <Shirt size={15} className="text-accent-400" />
          <span className="text-sm font-semibold flex-1">Quick Switch</span>
          <span className="text-xs text-surface-600 tabular-nums">{cachedAvatars.length}</span>
          <button
            onClick={fetchAvatars}
            disabled={isFetching}
            className="p-1 hover:bg-surface-800 rounded transition-colors text-surface-500 hover:text-surface-200"
            title="Refresh avatar list"
          >
            <RotateCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-800 rounded transition-colors text-surface-500 hover:text-surface-200"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0 border-b border-surface-800/40">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            <input
              ref={filterRef}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter avatars..."
              className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isFetching && cachedAvatars.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-surface-500 text-sm gap-2">
              <RotateCw size={14} className="animate-spin" /> Loading avatars...
            </div>
          ) : cachedAvatars.length === 0 ? (
            <div className="text-center py-16 text-surface-500">
              <Shirt size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No avatars found</p>
              <button onClick={fetchAvatars} className="btn-secondary text-xs mt-3">Refresh</button>
            </div>
          ) : (
            <div className="py-2">
              {pinnedAvatars.length > 0 && (
                <Section label="Pinned">
                  {pinnedAvatars.map(a => (
                    <AvatarRow
                      key={a.id}
                      avatar={a}
                      isCurrent={a.id === currentAvatarId}
                      isPinned={isPinned(a.id)}
                      isWearing={wearingId === a.id}
                      isWorn={wornId === a.id}
                      onWear={() => handleWear(a)}
                      onTogglePin={() => togglePin(a.id)}
                    />
                  ))}
                </Section>
              )}

              {recentAvatars.length > 0 && (
                <Section label="Recent">
                  {recentAvatars.map(a => (
                    <AvatarRow
                      key={a.id}
                      avatar={a}
                      isCurrent={a.id === currentAvatarId}
                      isPinned={isPinned(a.id)}
                      isWearing={wearingId === a.id}
                      isWorn={wornId === a.id}
                      onWear={() => handleWear(a)}
                      onTogglePin={() => togglePin(a.id)}
                      showRecent
                      recentIds={recentIds}
                    />
                  ))}
                </Section>
              )}

              {restAvatars.length > 0 && (
                <Section label={pinnedAvatars.length || recentAvatars.length ? 'All Avatars' : ''}>
                  {restAvatars.map(a => (
                    <AvatarRow
                      key={a.id}
                      avatar={a}
                      isCurrent={a.id === currentAvatarId}
                      isPinned={isPinned(a.id)}
                      isWearing={wearingId === a.id}
                      isWorn={wornId === a.id}
                      onWear={() => handleWear(a)}
                      onTogglePin={() => togglePin(a.id)}
                    />
                  ))}
                </Section>
              )}

              {allAvatars.length === 0 && filter && (
                <div className="text-center py-10 text-surface-500 text-sm">
                  No avatars match "{filter}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-surface-800/40 flex-shrink-0">
          <p className="text-[10px] text-surface-700 text-center">Press Esc to close · Ctrl+Shift+A to toggle</p>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      {label ? (
        <div className="px-4 py-1.5 text-[10px] font-semibold text-surface-600 uppercase tracking-widest">
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function AvatarRow({
  avatar, isCurrent, isPinned, isWearing, isWorn,
  onWear, onTogglePin, showRecent, recentIds,
}: {
  avatar: VRCAvatar;
  isCurrent: boolean;
  isPinned: boolean;
  isWearing: boolean;
  isWorn: boolean;
  onWear: () => void;
  onTogglePin: () => void;
  showRecent?: boolean;
  recentIds?: string[];
}) {
  const imgUrl = avatar.thumbnailImageUrl || avatar.imageUrl;

  return (
    <div className={`group flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-800/60 transition-colors ${isCurrent ? 'bg-accent-500/8' : ''}`}>
      <div className="relative flex-shrink-0">
        <img
          src={imgUrl}
          alt=""
          className="w-9 h-9 rounded-lg object-cover bg-surface-800"
          loading="lazy"
        />
        {isCurrent && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-surface-900 flex items-center justify-center">
            <Check size={7} strokeWidth={3} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate leading-tight">{avatar.name}</div>
        {showRecent && recentIds ? (
          <div className="text-[10px] text-surface-600 flex items-center gap-1 mt-0.5">
            <Clock size={9} />
            worn recently
          </div>
        ) : (
          <div className="text-[10px] text-surface-600 truncate">{avatar.authorName}</div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onTogglePin}
          className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${
            isPinned
              ? 'text-accent-400 opacity-100'
              : 'text-surface-600 hover:text-surface-300'
          }`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          {isPinned ? <Pin size={11} /> : <PinOff size={11} />}
        </button>
        <button
          onClick={onWear}
          disabled={isWearing || isCurrent}
          className={`text-[11px] px-2 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
            isWorn
              ? 'bg-green-500/20 text-green-400'
              : isCurrent
              ? 'text-surface-600 cursor-default'
              : 'bg-accent-600/20 text-accent-400 hover:bg-accent-600/30'
          }`}
        >
          {isWorn ? <><Check size={10} /> Worn</> : isWearing ? '...' : isCurrent ? 'Current' : 'Wear'}
        </button>
      </div>
    </div>
  );
}
