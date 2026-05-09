import { useState, useEffect } from 'react';
import { Search as SearchIcon, Users, Globe, Shirt, Heart, Database, Pin, PinOff } from 'lucide-react';
import api from '../api/vrchat';
import { vrcdb, VRCDB_PROVIDERS, getProviderId, setProviderId } from '../api/vrcdb';
import type { ProviderId, VRCDBAvatar } from '../api/vrcdb';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import WorldCard from '../components/common/WorldCard';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { VrcdbPanel } from './Avatars';
import type { VRCUser, VRCWorld, VRCAvatar } from '../types/vrchat';
import { getBestAvatarUrl } from '../utils/avatar';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';

type SearchCategory = 'users' | 'worlds' | 'avatars';
type AvatarSubTab = 'vrc' | 'own' | 'favorites' | 'database';

export default function SearchPage() {
  const { togglePin, isPinned } = useAvatarSwitcherStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('users');
  const [avatarSubTab, setAvatarSubTab] = useState<AvatarSubTab>('vrc');
  const [isLoading, setIsLoading] = useState(false);
  const [userResults, setUserResults] = useState<VRCUser[]>([]);
  const [worldResults, setWorldResults] = useState<VRCWorld[]>([]);
  const [avatarResults, setAvatarResults] = useState<VRCAvatar[]>([]);
  const [ownAvatars, setOwnAvatars] = useState<VRCAvatar[]>([]);
  const [favoriteAvatars, setFavoriteAvatars] = useState<VRCAvatar[]>([]);
  const [vrcdbResults, setVrcdbResults] = useState<VRCDBAvatar[]>([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [vrcdbLoading, setVrcdbLoading] = useState(false);
  const [vrcdbError, setVrcdbError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [providerId, setProviderIdState] = useState<ProviderId>(getProviderId());
  const [hasSearched, setHasSearched] = useState(false);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);

  // Load own/favorite avatars once when the avatars category is first opened
  useEffect(() => {
    if (category === 'avatars' && !avatarsLoaded) {
      setAvatarsLoaded(true);
      loadOwnAvatars();
      loadFavoriteAvatars();
    }
  }, [category, avatarsLoaded]);

  const loadOwnAvatars = async () => {
    setOwnLoading(true);
    try {
      const avatars = await api.getOwnAvatars();
      setOwnAvatars(Array.isArray(avatars) ? avatars : []);
    } catch {}
    setOwnLoading(false);
  };

  const loadFavoriteAvatars = async () => {
    setFavLoading(true);
    try {
      const favorites = await api.getFavorites('avatar', 100);
      const results = await Promise.all(
        favorites.map(f => api.getAvatar(f.favoriteId).catch(() => null))
      );
      setFavoriteAvatars(results.filter((a): a is VRCAvatar => a !== null));
    } catch {}
    setFavLoading(false);
  };

  const searchVrcdb = async (q: string) => {
    setVrcdbLoading(true);
    setVrcdbError(null);
    try {
      const results = await vrcdb.search(q);
      setVrcdbResults(results);
    } catch (err) {
      setVrcdbError(err instanceof Error ? err.message : 'Search failed');
    }
    setVrcdbLoading(false);
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

  const detectQueryType = (q: string): { type: 'id' | 'text'; category?: SearchCategory; id?: string } => {
    const trimmed = q.trim();
    if (trimmed.startsWith('usr_')) return { type: 'id', category: 'users', id: trimmed };
    if (trimmed.startsWith('wrld_')) return { type: 'id', category: 'worlds', id: trimmed };
    if (trimmed.startsWith('avtr_')) return { type: 'id', category: 'avatars', id: trimmed };
    const urlMatch = trimmed.match(/vrchat\.com\/home\/(world|user|avatar)\/(wrld_|usr_|avtr_)([a-f0-9-]+)/);
    if (urlMatch) {
      const typeMap: Record<string, SearchCategory> = { world: 'worlds', user: 'users', avatar: 'avatars' };
      return { type: 'id', category: typeMap[urlMatch[1]], id: `${urlMatch[2]}${urlMatch[3]}` };
    }
    return { type: 'text' };
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    // Database sub-tab: route to vrcdb
    if (category === 'avatars' && avatarSubTab === 'database') {
      searchVrcdb(q);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    const detection = detectQueryType(q);

    try {
      if (detection.type === 'id' && detection.id) {
        switch (detection.category) {
          case 'users': {
            const user = await api.getUser(detection.id);
            setUserResults([user]);
            setWorldResults([]);
            setAvatarResults([]);
            setCategory('users');
            break;
          }
          case 'worlds': {
            const world = await api.getWorld(detection.id);
            setWorldResults([world]);
            setUserResults([]);
            setAvatarResults([]);
            setCategory('worlds');
            break;
          }
          case 'avatars': {
            const avatar = await api.getAvatar(detection.id);
            setAvatarResults([avatar]);
            setUserResults([]);
            setWorldResults([]);
            setCategory('avatars');
            setAvatarSubTab('vrc');
            break;
          }
        }
      } else {
        const [users, worlds, avatars] = await Promise.allSettled([
          api.searchUsers(q, 20),
          api.searchWorlds({ query: q, count: 20 }),
          api.searchAvatars({ query: q, count: 20 }),
        ]);
        setUserResults(users.status === 'fulfilled' ? users.value : []);
        setWorldResults(worlds.status === 'fulfilled' ? worlds.value : []);
        setAvatarResults(avatars.status === 'fulfilled' ? avatars.value : []);
        if (category === 'avatars') setAvatarSubTab('vrc');
      }
    } catch (err) {
      console.error('Search failed:', err);
    }

    setIsLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Search</h1>
      <p className="text-sm text-surface-400 -mt-2">
        Search by name, or paste a VRChat URL or ID (usr_, wrld_, avtr_) for direct lookup
      </p>

      <div className="flex gap-2">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            onEnter={handleSearch}
            placeholder={
              category === 'avatars' && avatarSubTab === 'database'
                ? 'Search Database — name, author, or avtr_ ID...'
                : 'Search users, worlds, avatars... or paste an ID/URL'
            }
            autoFocus
          />
        </div>
        <button onClick={handleSearch} className="btn-primary text-sm">
          Search
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'users' as SearchCategory,   icon: Users,  label: `Users (${userResults.length})` },
          { key: 'worlds' as SearchCategory,  icon: Globe,  label: `Worlds (${worldResults.length})` },
          { key: 'avatars' as SearchCategory, icon: Shirt,  label: `Avatars` },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              category === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Avatar sub-tabs */}
      {category === 'avatars' && (
        <div className="flex gap-1 border-b border-surface-700/60 pb-px -mt-2">
          {([
            { key: 'vrc'      as AvatarSubTab, icon: SearchIcon, label: `VRChat${avatarResults.length ? ` (${avatarResults.length})` : ''}` },
            { key: 'own'      as AvatarSubTab, icon: Shirt,      label: `My Uploads${ownAvatars.length ? ` (${ownAvatars.length})` : ''}` },
            { key: 'favorites'as AvatarSubTab, icon: Heart,      label: `Favorites${favoriteAvatars.length ? ` (${favoriteAvatars.length})` : ''}` },
            { key: 'database' as AvatarSubTab, icon: Database,   label: `Database${vrcdbResults.length ? ` (${vrcdbResults.length})` : ''}` },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setAvatarSubTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                avatarSubTab === key ? 'tab-active' : 'tab-inactive'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : category !== 'avatars' && !hasSearched ? (
        <EmptyState
          icon={SearchIcon}
          title="Start searching"
          description="Enter a name, ID, or VRChat URL to find users, worlds, and avatars"
        />
      ) : (
        <div className="space-y-1">
          {category === 'users' && (
            userResults.length === 0 ? (
              <EmptyState icon={SearchIcon} title="No users found" description="Try a different name or user ID" />
            ) : userResults.map(user => (
              <div key={user.id} className="glass-panel-solid p-3 flex items-center gap-3 card-hover">
                <UserAvatar src={getBestAvatarUrl(user)} status={user.status} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{user.displayName}</div>
                  <div className="text-xs text-surface-500 truncate">{user.statusDescription || user.status}</div>
                </div>
                <div className="text-xs text-surface-600 font-mono">{user.id}</div>
                {user.isFriend && <span className="badge bg-green-500/15 text-green-400">Friend</span>}
              </div>
            ))
          )}

          {category === 'worlds' && (
            worldResults.length === 0 ? (
              <EmptyState icon={Globe} title="No worlds found" description="Try a different world name or world ID" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {worldResults.map(world => (
                  <div key={world.id} className="h-full"><WorldCard world={world} /></div>
                ))}
              </div>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'vrc' && (
            avatarResults.length === 0 && !hasSearched ? (
              <EmptyState icon={SearchIcon} title="Search for avatars" description="Enter a name in the search bar above" />
            ) : avatarResults.length === 0 ? (
              <EmptyState icon={SearchIcon} title="No avatars found" description="Try different search terms" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {avatarResults.map(avatar => {
                  const pinned = isPinned(avatar.id);
                  return (
                    <div key={avatar.id} className="relative group glass-panel-solid overflow-hidden card-hover">
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
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                          pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title={pinned ? 'Unpin' : 'Pin to Quick Switch'}
                      >
                        {pinned ? <Pin size={11} /> : <PinOff size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'own' && (
            ownLoading ? <LoadingSpinner className="py-16" /> :
            ownAvatars.length === 0 ? (
              <EmptyState icon={Shirt} title="No uploaded avatars" description="Avatars you've uploaded to VRChat will appear here" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {ownAvatars.map(avatar => {
                  const pinned = isPinned(avatar.id);
                  return (
                    <div key={avatar.id} className="relative group glass-panel-solid overflow-hidden card-hover">
                      <div className="aspect-square overflow-hidden">
                        <img src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                        <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                          pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title={pinned ? 'Unpin' : 'Pin to Quick Switch'}
                      >
                        {pinned ? <Pin size={11} /> : <PinOff size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'favorites' && (
            favLoading ? <LoadingSpinner className="py-16" /> :
            favoriteAvatars.length === 0 ? (
              <EmptyState icon={Heart} title="No favorited avatars" description="Avatars you favorite in VRChat will appear here" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {favoriteAvatars.map(avatar => {
                  const pinned = isPinned(avatar.id);
                  return (
                    <div key={avatar.id} className="relative group glass-panel-solid overflow-hidden card-hover">
                      <div className="aspect-square overflow-hidden">
                        <img src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                        <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                          pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title={pinned ? 'Unpin' : 'Pin to Quick Switch'}
                      >
                        {pinned ? <Pin size={11} /> : <PinOff size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'database' && (
            <VrcdbPanel
              results={vrcdbResults}
              loading={vrcdbLoading}
              error={vrcdbError}
              copiedId={copiedId}
              providerId={providerId}
              onCopy={copyId}
              onWear={async (id) => { try { await api.selectAvatar(id); } catch {} }}
              onChangeProvider={changeProvider}
              onSearch={() => searchVrcdb(query.trim())}
              hasQuery={!!query.trim()}
              onFindByAuthor={async (authorId, authorName) => {
                setVrcdbLoading(true);
                setVrcdbError(null);
                try {
                  const r = await vrcdb.getByAuthor(authorId);
                  setVrcdbResults(r.length > 0 ? r : await vrcdb.search(authorName));
                } catch (err) {
                  setVrcdbError(err instanceof Error ? err.message : 'Search failed');
                }
                setVrcdbLoading(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
