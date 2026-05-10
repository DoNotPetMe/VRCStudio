import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import api from '../api/vrchat';

// Listens for status-change requests from the tray right-click menu.
// The tray menu sends raw status strings like 'join me' / 'active' / 'busy' / 'ask me' / 'offline'.
export function useTrayStatus() {
  const { user, refreshUser } = useAuthStore();

  useEffect(() => {
    if (!window.electronAPI?.onTraySetStatus) return;
    if (!user?.id) return;

    const off = window.electronAPI.onTraySetStatus(async (status: string) => {
      try {
        // Preserve existing statusDescription
        await api.updateStatus(user.id, status, user.statusDescription || '');
        await refreshUser();
      } catch (err) {
        console.warn('[Tray] Failed to apply status:', err);
      }
    });
    return off;
  }, [user?.id, user?.statusDescription, refreshUser]);
}
