// Watches the logged-in user's VRChat location and feeds the instance
// history store. Two sources of churn this hook used to suffer from:
//
//   1. VRChat returns the location in slightly different shapes between
//      polls (sometimes with ~region(), sometimes without; sometimes with
//      the full `worldId:instanceId~tags`, sometimes just `worldId`).
//      Direct string compare was treating cosmetically-different versions
//      of the SAME instance as a transition → spammy join/leave loop.
//
//   2. We were mirroring the resolved location back into authStore on
//      every poll. That fired our own auth-store subscriber, which called
//      check() again, which set state again. Re-entrancy.
//
// Fixes:
//   - Normalize every location string down to `worldId:instanceId` (no
//     tags) before comparing.
//   - Only push the resolved values into authStore when they actually
//     differ from what's already there.
//   - The authStore subscriber compares NORMALIZED locations too, so it
//     doesn't re-trigger when only the cosmetic tail changed.
//   - A 2s debounce on consecutive check() calls keeps polling + auth
//     subscription from stomping on each other.

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { logWorldVisit, logWorldExit } from '../utils/worldAnalytics';
import api from '../api/vrchat';

function parseInstanceType(location: string): string {
  if (location.includes('~friends(')) return 'friends';
  if (location.includes('~hidden(')) return 'hidden';
  if (location.includes('~private(')) return 'private';
  if (location.includes('~group(')) return 'group';
  return 'public';
}

function parseGroupId(location: string): string | undefined {
  const m = location.match(/~group\((grp_[^)]+)\)/);
  return m?.[1];
}

function parseLocation(location: string): { worldId: string; instanceId: string; groupId?: string } | null {
  if (!location || location === 'offline' || location === 'private' || location === 'traveling') return null;
  const parts = location.split(':');
  if (parts.length < 2) return null;
  const worldId = parts[0];
  const instanceId = parts[1].split('~')[0];
  if (!worldId.startsWith('wrld_')) return null;
  return { worldId, instanceId, groupId: parseGroupId(location) };
}

/**
 * Reduce any location string to a canonical `worldId:instanceId` form, or
 * an empty string for non-locations (offline, private, traveling, etc.).
 * Cosmetic differences (~region, ~groupAccessType, etc.) are stripped so
 * the same instance always normalizes to the same key.
 */
function normalize(location: string): string {
  const parsed = parseLocation(location);
  return parsed ? `${parsed.worldId}:${parsed.instanceId}` : '';
}

export function useLocationTracking() {
  const prevNormalizedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const { settings } = useSettingsStore();
  const intervalMs = (settings.polling.friendsInterval || 30) * 1000;

  useEffect(() => {
    const check = async () => {
      // Debounce: don't run two checks within 1.5s of each other.
      const now = Date.now();
      if (now - lastCheckAtRef.current < 1500) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      lastCheckAtRef.current = now;

      try {
        const authStore = useAuthStore.getState();
        if (!authStore.isLoggedIn) return;

        try {
          await authStore.refreshUser();
        } catch {
          return;
        }

        const user = useAuthStore.getState().user;
        if (!user) return;

        // /auth/user often omits location/worldId/instanceId. Fetch /users/{me}
        // directly — that endpoint reliably exposes the current location.
        let liveLocation = user.location || '';
        let liveWorldId = user.worldId || '';
        let liveInstanceId = user.instanceId || '';
        if (user.id) {
          try {
            const self: any = await api.getUser(user.id);
            if (self?.location) liveLocation = self.location;
            if (self?.worldId) liveWorldId = self.worldId;
            if (self?.instanceId) liveInstanceId = self.instanceId;
          } catch {}
        }

        let newLocation = liveLocation;
        if (!newLocation.startsWith('wrld_') && liveWorldId.startsWith('wrld_')) {
          newLocation = liveInstanceId ? `${liveWorldId}:${liveInstanceId}` : liveWorldId;
        }

        // Only update authStore when the *normalized* location actually
        // changed — otherwise the auth subscriber re-fires this hook for
        // no reason.
        const currentInAuth = normalize(user.location || '');
        const candidate = normalize(newLocation);
        if (candidate !== currentInAuth) {
          useAuthStore.setState({
            user: { ...user, location: newLocation, worldId: liveWorldId, instanceId: liveInstanceId },
          });
        }

        const prevNorm = prevNormalizedRef.current;

        // First run: seed without firing trackJoin if we already have a
        // current instance recorded (e.g. restored from localStorage on a
        // hot reload).
        if (prevNorm === null) {
          prevNormalizedRef.current = candidate;

          const parsed = parseLocation(newLocation);
          if (parsed) {
            const instanceStore = useInstanceHistoryStore.getState();
            const sameAsCurrent =
              instanceStore.currentInstance?.worldId === parsed.worldId &&
              instanceStore.currentInstance?.instanceId === parsed.instanceId;

            if (!sameAsCurrent) {
              const instanceType = parseInstanceType(newLocation);
              instanceStore.trackJoin({
                worldId: parsed.worldId,
                instanceId: parsed.instanceId,
                worldName: parsed.worldId,
                worldImage: '',
                instanceType,
                groupId: parsed.groupId,
              });

              api.getWorld(parsed.worldId).then(world => {
                if (world?.name) {
                  useInstanceHistoryStore.setState(state => ({
                    history: state.history.map(h =>
                      h.worldId === parsed.worldId && !h.leftAt
                        ? { ...h, worldName: world.name, worldImage: world.thumbnailImageUrl || '' }
                        : h
                    ),
                    currentInstance: state.currentInstance?.worldId === parsed.worldId
                      ? { ...state.currentInstance, worldName: world.name, worldImage: world.thumbnailImageUrl || '' }
                      : state.currentInstance,
                  }));
                }
              }).catch(() => {});
            }
          }
          return;
        }

        // Same instance — nothing to do.
        if (candidate === prevNorm) return;

        prevNormalizedRef.current = candidate;

        const instanceStore = useInstanceHistoryStore.getState();

        // Close the previous visit (if there was one)
        const prevParsed = parseLocation(prevNorm);
        if (prevParsed) logWorldExit(prevParsed.worldId).catch(() => {});
        instanceStore.trackLeave();

        const parsed = parseLocation(newLocation);
        if (!parsed) return;

        const instanceType = parseInstanceType(newLocation);
        instanceStore.trackJoin({
          worldId: parsed.worldId,
          instanceId: parsed.instanceId,
          worldName: parsed.worldId,
          worldImage: '',
          instanceType,
          groupId: parsed.groupId,
        });

        api.getWorld(parsed.worldId).then(world => {
          if (world?.name) {
            logWorldVisit(parsed.worldId, world.name, Date.now()).catch(() => {});
            useInstanceHistoryStore.setState(state => ({
              history: state.history.map(h =>
                h.worldId === parsed.worldId && !h.leftAt
                  ? { ...h, worldName: world.name, worldImage: world.thumbnailImageUrl || '' }
                  : h
              ),
              currentInstance: state.currentInstance?.worldId === parsed.worldId
                ? { ...state.currentInstance, worldName: world.name, worldImage: world.thumbnailImageUrl || '' }
                : state.currentInstance,
            }));
          }
        }).catch(() => {});
      } finally {
        inFlightRef.current = false;
      }
    };

    check();
    const id = setInterval(check, intervalMs);

    // React to user-update WebSocket events: when authStore.user changes
    // location, re-evaluate immediately instead of waiting for the next
    // poll tick. We compare NORMALIZED locations so the cosmetic-only
    // changes don't re-trigger.
    let lastSubscriberNorm: string | null = null;
    const unsubAuth = useAuthStore.subscribe((s, prev) => {
      const cur = normalize(s.user?.location ?? '');
      const old = normalize(prev.user?.location ?? '');
      if (cur === old) return;
      if (cur === lastSubscriberNorm) return;
      lastSubscriberNorm = cur;
      check();
    });

    return () => {
      clearInterval(id);
      unsubAuth();
    };
  }, [intervalMs]);
}
