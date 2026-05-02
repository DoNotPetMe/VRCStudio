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

function parseLocation(location: string): { worldId: string; instanceId: string } | null {
  if (!location || location === 'offline' || location === 'private') return null;
  const parts = location.split(':');
  if (parts.length < 2) return null;
  const worldId = parts[0];
  const instanceId = parts[1].split('~')[0];
  if (!worldId.startsWith('wrld_')) return null;
  return { worldId, instanceId };
}

export function useLocationTracking() {
  const prevLocationRef = useRef<string | null>(null);
  const { settings } = useSettingsStore();
  const intervalMs = (settings.polling.friendsInterval || 30) * 1000;

  useEffect(() => {
    const check = async () => {
      const authStore = useAuthStore.getState();
      if (!authStore.isLoggedIn) return;

      try {
        await authStore.refreshUser();
      } catch {
        return;
      }

      const user = useAuthStore.getState().user;
      if (!user) return;

      const newLocation = user.location || '';
      const prevLocation = prevLocationRef.current;

      if (prevLocation === null) {
        // First run — just initialise the ref
        prevLocationRef.current = newLocation;

        // If the user is currently in a world, start tracking it
        const parsed = parseLocation(newLocation);
        if (parsed) {
          const instanceStore = useInstanceHistoryStore.getState();
          // Only track if we don't already have a current instance recorded
          if (!instanceStore.currentInstance) {
            const instanceType = parseInstanceType(newLocation);
            instanceStore.trackJoin({
              worldId: parsed.worldId,
              instanceId: parsed.instanceId,
              worldName: parsed.worldId,
              worldImage: '',
              instanceType,
            });

            // Enrich with world name/image in background
            api.getWorld(parsed.worldId).then(world => {
              if (world?.name) {
                // Update the current entry with real world name
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

      if (newLocation === prevLocation) return;

      prevLocationRef.current = newLocation;

      const instanceStore = useInstanceHistoryStore.getState();

      // Close the previous visit
      const prevParsed = parseLocation(prevLocation);
      if (prevParsed) {
        logWorldExit(prevParsed.worldId).catch(() => {});
      }
      instanceStore.trackLeave();

      // Start tracking the new location
      const parsed = parseLocation(newLocation);
      if (parsed) {
        const instanceType = parseInstanceType(newLocation);
        instanceStore.trackJoin({
          worldId: parsed.worldId,
          instanceId: parsed.instanceId,
          worldName: parsed.worldId,
          worldImage: '',
          instanceType,
        });

        // Fetch real world info in background
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
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
