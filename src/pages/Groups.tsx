import { useState, useEffect, useMemo } from 'react';
import {
  UsersRound, ArrowLeft, Hash, AlertCircle, RotateCw, ExternalLink,
  Search as SearchIcon, ArrowUpDown, Megaphone, Globe, LogIn, Send, Star, Sparkles,
} from 'lucide-react';
import api from '../api/vrchat';
import { useAuthStore } from '../stores/authStore';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';
import type { VRCGroup } from '../types/vrchat';

type SortKey = 'name' | 'members' | 'recent';

interface GroupInstance {
  instanceId: string;
  worldId: string;
  worldName?: string;
  worldImage?: string;
  memberCount?: number;
  type?: string;
}

export default function GroupsPage() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<VRCGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<VRCGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [representedId, setRepresentedId] = useState<string | null>(null);

  // Detail-state
  const [groupInstances, setGroupInstances] = useState<GroupInstance[]>([]);
  const [groupInstancesLoading, setGroupInstancesLoading] = useState(false);
  const [announcement, setAnnouncement] = useState<{ title?: string; text?: string; createdAt?: string } | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [representing, setRepresenting] = useState(false);

  useEffect(() => { loadGroups(); }, []);

  useEffect(() => {
    if (!user?.id) return;
    api.getRepresentedGroup(user.id).then(g => setRepresentedId(g?.id || g?.groupId || null)).catch(() => {});
  }, [user?.id]);

  const loadGroups = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!user?.id) {
        setError('User not authenticated');
        setIsLoading(false);
        return;
      }
      const data = await api.getUserGroups(user.id);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    }
    setIsLoading(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = !q ? [...groups] : groups.filter(g =>
      g.name?.toLowerCase().includes(q) ||
      g.shortCode?.toLowerCase().includes(q) ||
      g.description?.toLowerCase().includes(q)
    );
    if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'members') list.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
    return list;
  }, [groups, query, sort]);

  const totalMembers = useMemo(
    () => groups.reduce((acc, g) => acc + (g.memberCount || 0), 0),
    [groups]
  );

  const openGroup = async (group: VRCGroup) => {
    setSelectedGroup(group);
    setGroupInstances([]);
    setAnnouncement(null);
    setGroupInstancesLoading(true);
    const [inst, ann] = await Promise.allSettled([
      api.getGroupInstances(group.id),
      api.getGroupAnnouncement(group.id),
    ]);
    if (inst.status === 'fulfilled' && Array.isArray(inst.value)) {
      setGroupInstances(inst.value.map((i: any) => ({
        instanceId: i.instanceId,
        worldId: i.world?.id || i.worldId,
        worldName: i.world?.name,
        worldImage: i.world?.thumbnailImageUrl || i.world?.imageUrl,
        memberCount: i.memberCount,
        type: i.world?.tags?.includes('groupAccessType(plus)') ? 'Group+' : 'Group',
      })));
    }
    if (ann.status === 'fulfilled' && ann.value) {
      setAnnouncement({
        title: ann.value.title,
        text: ann.value.text,
        createdAt: ann.value.createdAt,
      });
    }
    setGroupInstancesLoading(false);
  };

  const handleVisitGroup = (group: VRCGroup) => {
    const url = group.shortCode && group.discriminator
      ? `https://vrchat.com/home/group/${group.shortCode}.${group.discriminator}`
      : `https://vrchat.com/home/group/${group.id}`;
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  const handleSelfInvite = async (worldId: string, instanceId: string) => {
    if (!worldId || !instanceId) return;
    setInviting(instanceId);
    try { await api.selfInvite(worldId, instanceId); } catch {}
    setTimeout(() => setInviting(null), 3000);
  };

  const handleRepresent = async (group: VRCGroup) => {
    setRepresenting(true);
    try {
      await api.setRepresentedGroup(group.id);
      setRepresentedId(group.id);
    } catch {}
    setRepresenting(false);
  };

  if (selectedGroup) {
    const isRepresenting = representedId === selectedGroup.id;
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelectedGroup(null)} className="btn-ghost flex items-center gap-1 -ml-2">
            <ArrowLeft size={16} /> Back to Groups
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleRepresent(selectedGroup)}
              disabled={representing || isRepresenting}
              className={`text-sm flex items-center gap-1.5 ${isRepresenting ? 'btn-secondary text-amber-400' : 'btn-secondary'}`}
              title={isRepresenting ? 'You are representing this group' : 'Set as your represented group'}
            >
              <Star size={14} className={isRepresenting ? 'fill-current' : ''} />
              {isRepresenting ? 'Representing' : representing ? 'Setting...' : 'Represent'}
            </button>
            <button
              onClick={() => handleVisitGroup(selectedGroup)}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> Visit Page
            </button>
          </div>
        </div>

        <div className="glass-panel-solid overflow-hidden">
          {selectedGroup.bannerUrl && (
            <div className="h-48 overflow-hidden relative">
              <img src={selectedGroup.bannerUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-transparent" />
            </div>
          )}
          <div className="p-6 -mt-16 relative">
            <div className="flex items-start gap-4">
              {selectedGroup.iconUrl ? (
                <img
                  src={selectedGroup.iconUrl}
                  alt=""
                  className="w-20 h-20 rounded-xl object-cover bg-surface-800 flex-shrink-0 ring-4 ring-surface-900"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-surface-800 flex items-center justify-center flex-shrink-0 ring-4 ring-surface-900">
                  <UsersRound size={28} className="text-surface-500" />
                </div>
              )}
              <div className="flex-1 min-w-0 pt-2">
                <h1 className="text-2xl font-bold truncate">{selectedGroup.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-surface-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Hash size={13} />{selectedGroup.shortCode}.{selectedGroup.discriminator}
                  </span>
                  <span className="flex items-center gap-1">
                    <UsersRound size={13} />{(selectedGroup.memberCount ?? 0).toLocaleString()} members
                  </span>
                </div>
              </div>
            </div>

            {announcement && (announcement.title || announcement.text) && (
              <div className="mt-6 glass-panel p-4 border-l-2 border-amber-500/60">
                <div className="flex items-start gap-2">
                  <Megaphone size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {announcement.title && (
                      <h3 className="text-sm font-semibold text-amber-300">{announcement.title}</h3>
                    )}
                    {announcement.text && (
                      <p className="text-sm text-surface-300 mt-1 whitespace-pre-wrap">{announcement.text}</p>
                    )}
                    {announcement.createdAt && (
                      <p className="text-[10px] text-surface-500 mt-2">
                        {new Date(announcement.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
                <Globe size={14} className="text-accent-400" /> Active Group Instances
                {groupInstances.length > 0 && (
                  <span className="text-[10px] text-surface-500 ml-1">({groupInstances.length})</span>
                )}
              </h3>
              {groupInstancesLoading ? (
                <LoadingSpinner className="py-6" />
              ) : groupInstances.length === 0 ? (
                <p className="text-xs text-surface-500 py-3">No active instances right now.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupInstances.map(inst => (
                    <div
                      key={inst.instanceId}
                      className="glass-panel p-3 flex items-center gap-3 hover:border-accent-500/30 transition-colors"
                    >
                      {inst.worldImage && (
                        <img
                          src={inst.worldImage}
                          alt=""
                          className="w-14 h-10 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{inst.worldName || 'Unknown world'}</span>
                          {inst.type && (
                            <span className="badge bg-amber-500/15 text-amber-400 text-[10px] flex-shrink-0">
                              {inst.type}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-surface-500 mt-0.5">
                          <UsersRound size={11} />
                          {inst.memberCount ?? '?'} present
                        </div>
                      </div>
                      <a
                        href={`vrchat://launch?ref=vrcstudio&id=${inst.worldId}:${inst.instanceId}`}
                        className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"
                        title="Launch directly into this instance"
                      >
                        <ExternalLink size={11} /> Launch
                      </a>
                      <button
                        onClick={() => handleSelfInvite(inst.worldId, inst.instanceId)}
                        disabled={!!inviting}
                        className={`text-xs flex items-center gap-1 px-2 py-1 rounded-md flex-shrink-0 transition-colors ${
                          inviting === inst.instanceId
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-accent-600/15 text-accent-400 hover:bg-accent-600/25'
                        }`}
                      >
                        <Send size={11} />
                        {inviting === inst.instanceId ? 'Sent!' : 'Invite Me'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedGroup.description && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Description</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap">{selectedGroup.description}</p>
              </div>
            )}

            {selectedGroup.rules && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Rules</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap">{selectedGroup.rules}</p>
              </div>
            )}

            {selectedGroup.tags && selectedGroup.tags.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroup.tags.map(tag => (
                    <span key={tag} className="badge bg-surface-800 text-surface-400">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          {!isLoading && groups.length > 0 && (
            <p className="text-xs text-surface-500 mt-1">
              {groups.length} group{groups.length !== 1 ? 's' : ''} &middot; {totalMembers.toLocaleString()} total members
              {representedId && (
                <>
                  {' '}&middot;{' '}
                  <span className="text-amber-400 inline-flex items-center gap-1">
                    <Sparkles size={11} /> Representing {groups.find(g => g.id === representedId)?.name || 'group'}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter groups..."
            className="w-56"
          />
          <button
            onClick={() => setSort(sort === 'name' ? 'members' : 'name')}
            className="btn-ghost text-xs flex items-center gap-1"
            title="Toggle sort"
          >
            <ArrowUpDown size={13} />
            {sort === 'name' ? 'Name' : 'Members'}
          </button>
          <button
            onClick={loadGroups}
            disabled={isLoading}
            className="btn-ghost p-1.5"
            title="Refresh"
          >
            <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-400">Error loading groups</p>
            <p className="text-xs text-rose-400/80 mt-1">{error}</p>
          </div>
          <button
            onClick={loadGroups}
            disabled={isLoading}
            className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"
          >
            <RotateCw size={14} /> Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No groups"
          description="Groups you belong to will appear here"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No matches"
          description={`No groups match "${query}"`}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(group => {
            const isRepresenting = representedId === group.id;
            return (
              <button
                key={group.id}
                onClick={() => openGroup(group)}
                className={`glass-panel-solid overflow-hidden card-hover text-left relative ${
                  isRepresenting ? 'ring-1 ring-amber-500/40' : ''
                }`}
              >
                {isRepresenting && (
                  <div className="absolute top-2 right-2 z-10 bg-amber-500/90 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star size={10} className="fill-current" /> Representing
                  </div>
                )}
                {group.bannerUrl && (
                  <div className="h-20 overflow-hidden">
                    <img src={group.bannerUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3 flex items-start gap-3">
                  {group.iconUrl ? (
                    <img src={group.iconUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface-800 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                      <UsersRound size={20} className="text-surface-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate">{group.name}</h3>
                    <div className="text-xs text-surface-500 mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Hash size={11} />{group.shortCode}.{group.discriminator}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersRound size={11} />{(group.memberCount ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {group.description && (
                      <p className="text-xs text-surface-500 mt-1.5 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
