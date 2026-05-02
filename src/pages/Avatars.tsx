import { useState, useEffect } from 'react';
import {
  Shirt, Search, ArrowLeft, Heart, AlertCircle, RotateCw,
  Pin, PinOff, Zap, Copy, Check, Database, ExternalLink,
} from 'lucide-react';
import api from '../api/vrchat';
import { vrcdb, VRCDB_PROVIDERS, getProviderId, setProviderId } from '../api/vrcdb';
import type { ProviderId, VRCDBAvatar } from '../api/vrcdb';
import SearchInput from '../components/common/SearchInput';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCAvatar } from '../types/vrchat';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';

type AvatarTab = 'own' | 'favorites' | 'vrc_search' | 'vrcdb';

export default function AvatarsPage() {
  const { togglePin, isPinned, toggle: openSwitcher } = useAvatarSwitcherStore();
  const [tab, setTab] = useState<AvatarTab>('own');
  const [favoriteAvatars, setFavoriteAvatars] = useState<VRCAvatar[]>([]);
  const [ownAvatars, setOwnAvatars] = useState<VRCAvatar[]>([]);
  const [vrcSearchResults, setVrcSearchResults] = useState<VRCAvatar[]>([]);
  const [vrcdbResults, setVrcdbResults] = useState<VRCDBAvatar[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [ownLoading, setOwnLoading] = useState(false);
  const [vrcSearchLoading, setVrcSearchLoading] = useState(false);
  const [vrcdbLoading, setVrcdbLoading] = useState(false);
  const [vrcdbError, setVrcdbError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<VRCAvatar | null>(null);
  const [switching, setSwitching] = useState(false);
  const [ownAvatarsError, setOwnAvatarsError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [providerId, setProviderIdState] = useState<ProviderId>(getProviderId());

  useEffect(() => {
    loadFavoriteAvatars();
    loadOwnAvatars();
  }, []);

  const loadFavoriteAvatars = async () => {
    setFavLoading(true);
    try {
      const favorites = await api.getFavorites('avatar', 100);
      const results = await Promise.all(favorites.map(f => api.getAvatar(f.favoriteId).catch(() => null)));
      setFavoriteAvatars(results.filter((a): a is VRCAvatar => a !== null));
    } catch {}
    setFavLoading(false);
  };

  const loadOwnAvatars = async () => {
    setOwnLoading(true);
    try {
      setOwnAvatarsError(null);
      const avatars = await api.getOwnAvatars();
      setOwnAvatars(Array.isArray(avatars) ? avatars : []);
    } catch (err) {
      setOwnAvatarsError(err instanceof Error ? err.message : 'Failed to load uploaded avatars');
    }
    setOwnLoading(false);
  };

  const handleSearch = async () => {
    const q = searchInput.trim();
    if (!q) return;
    if (tab === 'vrcdb') {
      searchVrcdb(q);
    } else {
      setTab('vrc_search');
      setVrcSearchLoading(true);
      try {
        setVrcSearchResults(await api.searchAvatars({ query: q, count: 30 }));
      } catch {}
      setVrcSearchLoading(false);
    }
  };

  const searchVrcdb = async (q: string) => {
    setVrcdbLoading(true);
    setVrcdbError(null);
    try {
      const results = await vrcdb.search(q, 40);
      setVrcdbResults(results);
      if (results.length === 0) setVrcdbError(null);
    } catch (err) {
      setVrcdbError(err instanceof Error ? err.message : 'Search failed');
    }
    setVrcdbLoading(false);
  };

  const handleSelect = async (avatarId: string) => {
    setSwitching(true);
    try { await api.selectAvatar(avatarId); } catch {}
    setSwitching(false);
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const changeProvider = (id: ProviderId) => {
    setProviderId(id);
    setProviderIdState(id);
    setVrcdbResults([]);
    setVrcdbError(null);
  };


  const searchPlaceholder = tab === 'vrcdb'
    ? 'Search VRCDB — name, author, or avtr_ ID...'
    : 'Search avatars...';

  const vrcAvatars = tab === 'own' ? ownAvatars : tab === 'favorites' ? favoriteAvatars : vrcSearchResults;
  const vrcLoading = tab === 'own' ? ownLoading : tab === 'favorites' ? favLoading : vrcSearchLoading;

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <button onClick={() => setSelected(null)} className="btn-ghost flex items-center gap-1 mb-4 -ml-2">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="glass-panel-solid overflow-hidden">
          <div className="aspect-video max-h-80">
            <img src={selected.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="p-6">
            <h1 className="text-xl font-bold">{selected.name}</h1>
            <p className="text-surface-400 text-sm mt-1">by {selected.authorName}</p>
            {selected.description && (
              <p className="text-sm text-surface-400 mt-4 whitespace-pre-wrap">{selected.description}</p>
            )}
            {selected.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {selected.tags
                  .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
                  .map(tag => (
                    <span key={tag} className="badge bg-surface-800 text-surface-400">
                      {tag.replace('author_tag_', '')}
                    </span>
                  ))}
              </div>
            )}
            <div className="mt-4 text-xs text-surface-600">
              Version {selected.version} &middot; Updated: {new Date(selected.updated_at).toLocaleDateString()}
            </div>
            <div className="mt-4">
              <button onClick={() => handleSelect(selected.id)} disabled={switching} className="btn-primary text-sm">
                {switching ? 'Switching...' : 'Switch to this Avatar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Avatars</h1>
        <button
          onClick={openSwitcher}
          className="btn-secondary text-xs flex items-center gap-1.5"
          title="Open quick avatar switcher (Ctrl+Shift+A)"
        >
          <Zap size={13} /> Quick Switch
        </button>
      </div>

      <div className="flex gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          onEnter={handleSearch}
          placeholder={searchPlaceholder}
          className="flex-1 max-w-md"
        />
        <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'own'        as AvatarTab, icon: Shirt,    label: `My Uploads${ownAvatars.length ? ` (${ownAvatars.length})` : ''}` },
          { key: 'favorites'  as AvatarTab, icon: Heart,    label: `Favorites${favoriteAvatars.length ? ` (${favoriteAvatars.length})` : ''}` },
          ...(vrcSearchResults.length > 0 ? [{ key: 'vrc_search' as AvatarTab, icon: Search,   label: `VRChat (${vrcSearchResults.length})` }] : []),
          { key: 'vrcdb'      as AvatarTab, icon: Database, label: `VRCDB${vrcdbResults.length ? ` (${vrcdbResults.length})` : ''}` },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── VRCDB tab content ── */}
      {tab === 'vrcdb' ? (
        <VrcdbPanel
          results={vrcdbResults}
          loading={vrcdbLoading}
          error={vrcdbError}
          copiedId={copiedId}
          providerId={providerId}
          onCopy={copyId}
          onWear={handleSelect}
          onChangeProvider={changeProvider}
          onSearch={() => searchVrcdb(searchInput.trim())}
          hasQuery={!!searchInput.trim()}
        />
      ) : (
        /* ── VRChat tabs content ── */
        vrcLoading ? (
          <LoadingSpinner className="py-16" />
        ) : tab === 'own' && ownAvatarsError ? (
          <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-400">Error loading uploaded avatars</p>
              <p className="text-xs text-rose-400/80 mt-1">{ownAvatarsError}</p>
            </div>
            <button onClick={loadOwnAvatars} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0">
              <RotateCw size={14} /> Retry
            </button>
          </div>
        ) : vrcAvatars.length === 0 ? (
          <EmptyState
            icon={tab === 'vrc_search' ? Search : tab === 'favorites' ? Heart : Shirt}
            title={tab === 'vrc_search' ? 'No avatars found' : tab === 'favorites' ? 'No favorited avatars' : 'No uploaded avatars'}
            description={
              tab === 'vrc_search' ? 'Try different search terms'
              : tab === 'favorites' ? 'Avatars you favorite in VRChat will appear here'
              : "Avatars you've uploaded to VRChat will appear here"
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vrcAvatars.map(avatar => {
              const pinned = isPinned(avatar.id);
              return (
                <div key={avatar.id} className="relative group">
                  <button
                    onClick={() => setSelected(avatar)}
                    className="glass-panel-solid overflow-hidden card-hover group text-left w-full"
                  >
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={avatar.thumbnailImageUrl || avatar.imageUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                      <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                    </div>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
                    className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                      pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                    }`}
                    title={pinned ? 'Remove from Quick Switch pins' : 'Pin to Quick Switch'}
                  >
                    {pinned ? <Pin size={11} /> : <PinOff size={11} />}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── VRCDB Panel ────────────────────────────────────────────────────────────────

function VrcdbPanel({
  results, loading, error, copiedId, providerId,
  onCopy, onWear, onChangeProvider, onSearch, hasQuery,
}: {
  results: VRCDBAvatar[];
  loading: boolean;
  error: string | null;
  copiedId: string | null;
  providerId: ProviderId;
  onCopy: (id: string) => void;
  onWear: (id: string) => void;
  onChangeProvider: (id: ProviderId) => void;
  onSearch: () => void;
  hasQuery: boolean;
}) {
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [wornId, setWornId] = useState<string | null>(null);

  const handleWear = async (id: string) => {
    setWearingId(id);
    await onWear(id);
    setWornId(id);
    setWearingId(null);
    setTimeout(() => setWornId(null), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Provider selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-surface-500">
          <Database size={12} /> Provider:
        </div>
        <div className="flex gap-1">
          {VRCDB_PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => onChangeProvider(p.id as ProviderId)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                providerId === p.id
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-surface-700 bg-surface-800 text-surface-500 hover:text-surface-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-surface-600 ml-auto">Community-run public avatar index</p>
      </div>

      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : error ? (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg text-sm text-rose-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          {hasQuery && (
            <button onClick={onSearch} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0">
              <RotateCw size={12} /> Retry
            </button>
          )}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-surface-500">
          <Database size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">{hasQuery ? 'No avatars found' : 'Search the VRCDB'}</p>
          <p className="text-xs mt-1 text-surface-600">
            {hasQuery ? 'Try a different name, author, or paste an avtr_ ID'
              : 'Type a name or author in the search bar above and press Search'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map(avatar => {
            const isWearing = wearingId === avatar.id;
            const isWorn = wornId === avatar.id;
            const wasCopied = copiedId === avatar.id;
            const imgUrl = avatar.thumbnailImageUrl || avatar.imageUrl;

            return (
              <div key={avatar.id} className="glass-panel-solid overflow-hidden flex flex-col">
                <div className="aspect-square overflow-hidden bg-surface-800">
                  {imgUrl ? (
                    <img src={imgUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Shirt size={32} className="text-surface-700" />
                    </div>
                  )}
                </div>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div>
                    <h3 className="text-sm font-semibold truncate" title={avatar.name}>{avatar.name}</h3>
                    <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                  </div>

                  {avatar.description && (
                    <p className="text-[11px] text-surface-500 line-clamp-2 leading-relaxed">{avatar.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 mt-auto pt-1">
                    <button
                      onClick={() => handleWear(avatar.id)}
                      disabled={!!wearingId}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${
                        isWorn ? 'bg-green-500/20 text-green-400' : 'btn-primary'
                      }`}
                    >
                      {isWorn ? <><Check size={11} /> Worn</> : isWearing ? 'Switching...' : 'Wear'}
                    </button>
                    <button
                      onClick={() => onCopy(avatar.id)}
                      className="p-1.5 rounded-lg border border-surface-700 hover:border-surface-500 transition-colors text-surface-400 hover:text-surface-200"
                      title="Copy avatar ID"
                    >
                      {wasCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    <a
                      href={`https://vrchat.com/home/avatar/${avatar.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => {
                        if (window.electronAPI?.openExternal) {
                          e.preventDefault();
                          window.electronAPI.openExternal(`https://vrchat.com/home/avatar/${avatar.id}`);
                        }
                      }}
                      className="p-1.5 rounded-lg border border-surface-700 hover:border-surface-500 transition-colors text-surface-400 hover:text-surface-200"
                      title="Open on VRChat website"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
