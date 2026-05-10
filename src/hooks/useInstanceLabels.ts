// Resolves names for group/user IDs embedded in VRChat instance strings.
//
// Instance ID examples:
//   Public:        "12345~region(us)"
//   Group public:  "12345~group(grp_xxx)~groupAccessType(public)~region(us)"
//   Group+:        "12345~group(grp_xxx)~groupAccessType(plus)~region(us)"
//   Group members: "12345~group(grp_xxx)~groupAccessType(members)~region(us)"
//   Friends+:      "12345~hidden(usr_xxx)~region(us)"
//   Friends:       "12345~friends(usr_xxx)~region(us)"
//   Invite:        "12345~private(usr_xxx)~canRequestInvite~region(us)"
//
// We extract the embedded grp_/usr_ id, fetch the human-readable name once
// per session, and serve it back from the in-module cache thereafter.

import { useEffect, useState } from 'react';
import api from '../api/vrchat';

const groupNameCache = new Map<string, string>();
const userNameCache = new Map<string, string>();
const inflightGroup = new Map<string, Promise<string | null>>();
const inflightUser = new Map<string, Promise<string | null>>();

export function extractGroupId(instanceId: string): string | null {
  const m = instanceId.match(/group\((grp_[a-f0-9-]+)\)/i);
  return m ? m[1] : null;
}

export function extractOwnerId(instanceId: string): string | null {
  // friends(...)/hidden(...)/private(...) all carry an owner user id
  const m = instanceId.match(/(?:friends|hidden|private)\((usr_[a-f0-9-]+)\)/i);
  return m ? m[1] : null;
}

async function fetchGroupName(groupId: string): Promise<string | null> {
  if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
  if (inflightGroup.has(groupId)) return inflightGroup.get(groupId)!;
  const p = (async () => {
    try {
      const g: any = await api.getGroup(groupId);
      const name = g?.name || g?.shortCode || null;
      if (name) groupNameCache.set(groupId, name);
      return name;
    } catch {
      return null;
    } finally {
      inflightGroup.delete(groupId);
    }
  })();
  inflightGroup.set(groupId, p);
  return p;
}

async function fetchUserName(userId: string): Promise<string | null> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  if (inflightUser.has(userId)) return inflightUser.get(userId)!;
  const p = (async () => {
    try {
      const u = await api.getUser(userId);
      const name = u?.displayName || null;
      if (name) userNameCache.set(userId, name);
      return name;
    } catch {
      return null;
    } finally {
      inflightUser.delete(userId);
    }
  })();
  inflightUser.set(userId, p);
  return p;
}

export interface InstanceLabel {
  groupName?: string;
  ownerName?: string;
}

/**
 * For a given list of instance IDs, resolves any embedded group/user IDs
 * to human names. Re-renders as names come in. Cached across the session.
 */
export function useInstanceLabels(instanceIds: string[]): Record<string, InstanceLabel> {
  const [labels, setLabels] = useState<Record<string, InstanceLabel>>({});

  useEffect(() => {
    let alive = true;

    const seen = new Set<string>();
    for (const id of instanceIds) {
      if (seen.has(id)) continue;
      seen.add(id);

      const groupId = extractGroupId(id);
      const ownerId = extractOwnerId(id);

      // Seed from cache immediately
      const seed: InstanceLabel = {};
      if (groupId && groupNameCache.has(groupId)) seed.groupName = groupNameCache.get(groupId);
      if (ownerId && userNameCache.has(ownerId)) seed.ownerName = userNameCache.get(ownerId);
      if (Object.keys(seed).length > 0) {
        setLabels(prev => ({ ...prev, [id]: { ...prev[id], ...seed } }));
      }

      if (groupId && !groupNameCache.has(groupId)) {
        fetchGroupName(groupId).then(name => {
          if (!alive || !name) return;
          setLabels(prev => ({ ...prev, [id]: { ...prev[id], groupName: name } }));
        });
      }
      if (ownerId && !userNameCache.has(ownerId)) {
        fetchUserName(ownerId).then(name => {
          if (!alive || !name) return;
          setLabels(prev => ({ ...prev, [id]: { ...prev[id], ownerName: name } }));
        });
      }
    }

    return () => { alive = false; };
  }, [instanceIds.join('|')]);

  return labels;
}
