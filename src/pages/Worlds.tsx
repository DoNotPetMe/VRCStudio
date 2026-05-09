import { useState, useEffect } from 'react';
import { Globe, TrendingUp, Clock, Star, Search, Users, Heart, ArrowLeft, LogIn, X } from 'lucide-react';
import { useWorldStore } from '../stores/worldStore';
import { useFriendStore } from '../stores/friendStore';
import SearchInput from '../components/common/SearchInput';
import WorldCard from '../components/common/WorldCard';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import InstanceModal from '../components/InstanceModal';
import type { VRCWorld } from '../types/vrchat';
import { getBestAvatarUrl } from '../utils/avatar';
import api from '../api/vrchat';

type WorldTab = 'search' | 'active' | 'recent' | 'favorites';

interface InstancePicker {
  worldId: string;
  worldName: string;
  worldImage: string;
  instances: [string, number][];
  loading: boolean;
}

function instanceLabel(id: string): string {
  if (id.includes('group(')) {
    if (id.includes('groupAccessType(plus)')) return 'Group+';
    if (id.includes('groupAccessType(members)')) return 'Group';
    return 'Group Public';
  }
  if (id.includes('friends(')) return 'Friends+';
  if (id.includes('hidden('))  return 'Friends';
  if (id.includes('private(')) return 'Invite';
  return 'Public';
}

export default function WorldsPage() {
  const {
    searchResults, activeWorlds, recentWorlds, favoriteWorlds,
    isLoading, searchWorlds, fetchActiveWorlds, fetchRecentWorlds, fetchFavoriteWorlds,
    getWorld, worldCache,
  } = useWorldStore();
  const { onlineFriends } = useFriendStore();

  const [tab, setTab] = useState<WorldTab>('active');
  const [selectedWorld, setSelectedWorld] = useState<VRCWorld | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [instanceModal, setInstanceModal] = useState<{ worldId: string; instanceId: string } | null>(null);
  const [rejoiningInstance, setRejoiningInstance] = useState<string | null>(null);
  const [instancePicker, setInstancePicker] = useState<InstancePicker | null>(null);

  async function openInstancePicker(world: VRCWorld) {
    setInstancePicker({
      worldId: world.id, worldName: world.name,
      worldImage: world.thumbnailImageUrl || world.imageUrl || '',
      instances: [], loading: true,
    });
    try {
      const full = await getWorld(world.id);
      setInstancePicker(p => p ? { ...p, instances: full.instances ?? [], loading: false } : null);
    } catch {
      setInstancePicker(p => p ? { ...p, loading: false } : null);
    }
  }

  async function handleSelfInvite(worldId: string, instanceId: string) {
    if (rejoiningInstance) return;
    setRejoiningInstance(instanceId);
    try {
      await api.selfInvite(worldId, instanceId);
    } catch {}
    setTimeout(() => setRejoiningInstance(null), 3000);
  }

  useEffect(() => {
    fetchActiveWorlds();
    fetchRecentWorlds();
    fetchFavoriteWorlds();
  }, []);

  const handleSearch = () => {
    if (searchInput.trim()) {
      setTab('search');
      searchWorlds(searchInput.trim());
    }
  };

  const openWorldDetail = async (world: VRCWorld) => {
    try {
      const detailed = await getWorld(world.id);
      setSelectedWorld(detailed);
    } catch {
      setSelectedWorld(world);
    }
  };

  const worldList =
    tab === 'search' ? searchResults :
    tab === 'active' ? activeWorlds :
    tab === 'recent' ? recentWorlds :
    favoriteWorlds;

  // For a given world, which friends are there?
  const friendsInWorld = (worldId: string) =>
    onlineFriends.filter(f => f.location?.startsWith(worldId));

  if (selectedWorld) {
    const friends = friendsInWorld(selectedWorld.id);
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <button onClick={() => setSelectedWorld(null)} className="btn-ghost flex items-center gap-1 mb-4 -ml-2">
          <ArrowLeft size={16} /> Back to Worlds
        </button>

        <div className="glass-panel-solid overflow-hidden">
          <div className="relative aspect-video max-h-72">
            <img src={selectedWorld.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900 to-transparent" />
          </div>

          <div className="p-6 -mt-16 relative">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">{selectedWorld.name}</h1>
                <p className="text-surface-400 text-sm">by {selectedWorld.authorName}</p>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-4 flex-wrap">
              <StatPill icon={Users} value={selectedWorld.occupants} label="Online" />
              <StatPill icon={Heart} value={selectedWorld.favorites} label="Favorites" />
              <StatPill icon={Globe} value={selectedWorld.visits} label="Visits" />
              <StatPill icon={Users} value={selectedWorld.capacity} label="Capacity" />
            </div>

            {/* Friends in this world */}
            {friends.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
                  <Users size={14} className="text-green-400" />
                  {friends.length} Friend{friends.length !== 1 ? 's' : ''} Here
                </h3>
                <div className="flex flex-wrap gap-2">
                  {friends.map(f => (
                    <div key={f.id} className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full">
                      <img src={getBestAvatarUrl(f)} alt="" className="w-5 h-5 rounded-full object-cover" />
                      <span className="text-xs font-medium">{f.displayName}</span>
                      <button
                        onClick={() => {
                          const parts = f.location.split(':');
                          if (parts[0] && parts[1]) setInstanceModal({ worldId: parts[0], instanceId: parts[1] });
                        }}
                        className="text-accent-400 hover:text-accent-300 text-xs"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedWorld.description && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Description</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap leading-relaxed">
                  {selectedWorld.description}
                </p>
              </div>
            )}

            {selectedWorld.tags?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedWorld.tags
                    .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
                    .map(tag => (
                      <span key={tag} className="badge bg-surface-800 text-surface-400">
                        {tag.replace('author_tag_', '')}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Instances */}
            {selectedWorld.instances && selectedWorld.instances.length > 0 && (
              <div className="mt-6">
                {(() => {
                  const grouped = selectedWorld.instances.filter(([id]) => id.includes('group('));
                  const other = selectedWorld.instances.filter(([id]) => !id.includes('group('));
                  const Row = ({ id, count }: { id: string; count: number }) => (
                    <div className="glass-panel px-3 py-2.5 flex items-center gap-3 hover:border-accent-500/30 transition-colors">
                      <button
                        className="flex-1 flex items-center gap-2 min-w-0 text-left"
                        onClick={() => setInstanceModal({ worldId: selectedWorld.id, instanceId: id })}
                      >
                        <span className="badge bg-surface-700 text-surface-300 text-[10px] flex-shrink-0">
                          {instanceLabel(id)}
                        </span>
                        <span className="text-xs text-surface-400 flex items-center gap-1 flex-shrink-0 ml-auto">
                          <Users size={11} /> {count}
                        </span>
                      </button>
                      <button
                        onClick={() => handleSelfInvite(selectedWorld.id, id)}
                        disabled={!!rejoiningInstance}
                        className={`flex items-center gap-1 text-xs flex-shrink-0 px-2 py-1 rounded-md transition-colors ${
                          rejoiningInstance === id
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-accent-600/15 text-accent-400 hover:bg-accent-600/25'
                        }`}
                      >
                        <LogIn size={11} />
                        <span className="text-[10px]">{rejoiningInstance === id ? 'Sent!' : 'Invite me'}</span>
                      </button>
                    </div>
                  );
                  return (
                    <>
                      {grouped.length > 0 && (
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
                            <Users size={14} className="text-amber-400" /> Group Instances ({grouped.length})
                          </h3>
                          <div className="space-y-1.5">
                            {grouped.map(([id, count]) => <Row key={id} id={id} count={count} />)}
                          </div>
                        </div>
                      )}
                      {other.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
                            <Globe size={14} /> Other Instances ({other.length})
                          </h3>
                          <div className="space-y-1.5">
                            {other.map(([id, count]) => <Row key={id} id={id} count={count} />)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="mt-4 text-xs text-surface-600">
              Created: {new Date(selectedWorld.created_at).toLocaleDateString()} &middot;
              Updated: {new Date(selectedWorld.updated_at).toLocaleDateString()} &middot;
              v{selectedWorld.version}
            </div>
          </div>
        </div>

        {instanceModal && (
          <InstanceModal
            worldId={instanceModal.worldId}
            instanceId={instanceModal.instanceId}
            onClose={() => setInstanceModal(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Worlds</h1>

      <div className="flex gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          onEnter={handleSearch}
          placeholder="Search worlds..."
          className="flex-1 max-w-md"
        />
        <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
      </div>

      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {[
          { key: 'active' as WorldTab, icon: TrendingUp, label: 'Popular' },
          { key: 'recent' as WorldTab, icon: Clock, label: 'Recent' },
          { key: 'favorites' as WorldTab, icon: Star, label: 'Favorites' },
          ...(searchResults.length > 0 ? [{ key: 'search' as WorldTab, icon: Search, label: 'Search Results' }] : []),
        ].map(({ key, icon: Icon, label }) => (
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

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : worldList.length === 0 ? (
        <EmptyState icon={Globe} title={tab === 'search' ? 'No worlds found' : 'No worlds yet'}
          description={tab === 'search' ? 'Try different search terms' : 'Worlds will appear once loaded'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {worldList.map(world => {
            const friendCount = friendsInWorld(world.id).length;
            return (
              <div key={world.id} className="group relative h-full">
                <WorldCard world={world} onClick={() => openWorldDetail(world)} />
                {friendCount > 0 && (
                  <div className="absolute top-2 left-2 bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded-full
                                  flex items-center gap-1 backdrop-blur-sm font-medium pointer-events-none">
                    <Users size={10} /> {friendCount} friend{friendCount !== 1 ? 's' : ''}
                  </div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); openInstancePicker(world); }}
                  className="absolute bottom-[56px] right-2 bg-black/75 backdrop-blur-sm text-white
                             text-[10px] px-2 py-1 rounded-md flex items-center gap-1
                             opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                >
                  <LogIn size={10} /> Join
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Instance picker modal */}
      {instancePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setInstancePicker(null)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-xl shadow-2xl w-96 max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-surface-800 flex-shrink-0">
              {instancePicker.worldImage && (
                <img src={instancePicker.worldImage} className="w-14 h-10 rounded object-cover flex-shrink-0" alt="" />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate">{instancePicker.worldName}</h2>
                <p className="text-xs text-surface-500">Active instances</p>
              </div>
              <button onClick={() => setInstancePicker(null)} className="btn-ghost p-1 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1.5">
              {instancePicker.loading ? (
                <LoadingSpinner className="py-8" />
              ) : instancePicker.instances.length === 0 ? (
                <p className="text-xs text-surface-500 text-center py-6">No active instances found</p>
              ) : (
                instancePicker.instances.map(([id, count]) => (
                  <div key={id} className="glass-panel px-3 py-2.5 flex items-center gap-3">
                    <span className="badge bg-surface-700 text-surface-300 text-[10px] flex-shrink-0">
                      {instanceLabel(id)}
                    </span>
                    <span className="text-xs text-surface-400 flex items-center gap-1 ml-auto flex-shrink-0">
                      <Users size={11} /> {count}
                    </span>
                    <button
                      onClick={() => handleSelfInvite(instancePicker.worldId, id)}
                      disabled={!!rejoiningInstance}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md flex-shrink-0 transition-colors ${
                        rejoiningInstance === id
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-accent-600/15 text-accent-400 hover:bg-accent-600/25'
                      }`}
                    >
                      <LogIn size={11} />
                      {rejoiningInstance === id ? 'Sent!' : 'Invite me'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, value, label }: { icon: typeof Globe; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-surface-400">
      <Icon size={14} />
      <span className="font-semibold text-white">{value.toLocaleString()}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
