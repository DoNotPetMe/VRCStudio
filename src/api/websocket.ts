import api from './vrchat';
import { useFeedStore } from '../stores/feedStore';
import { useFriendStore } from '../stores/friendStore';
import { useAuthStore } from '../stores/authStore';
import { logWorldVisit, logWorldExit } from '../utils/worldAnalytics';
import { useReportStore } from '../stores/reportStore';

type WSEventType =
  | 'friend-online'
  | 'friend-offline'
  | 'friend-active'
  | 'friend-update'
  | 'friend-location'
  | 'friend-add'
  | 'friend-delete'
  | 'notification'
  | 'user-update';

interface WSMessage {
  type: WSEventType;
  content: string;
}

class VRChatWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 5000;
  private maxReconnectDelay = 60000;
  private isConnected = false;
  private listeners: Array<(type: WSEventType, data: any) => void> = [];

  connect() {
    const cookies = api.getAuthCookies();
    if (!cookies.auth) return;

    this.disconnect();

    try {
      this.ws = new WebSocket(
        `wss://pipeline.vrchat.cloud/?authToken=authcookie_${cookies.auth}`
      );

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectDelay = 5000;
        console.log('[WS] Connected to VRChat pipeline');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          const data = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          this.handleEvent(msg.type, data);
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log('[WS] Disconnected, scheduling reconnect...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Error:', err);
      };
    } catch (err) {
      console.warn('[WS] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  private handleEvent(type: WSEventType, data: any) {
    const feed = useFeedStore.getState();
    const friendStore = useFriendStore.getState();

    switch (type) {
      case 'friend-online':
        feed.addEvent({
          type: 'friend_online',
          userId: data.userId,
          userName: data.user?.displayName || data.userId,
          userAvatar: data.user?.currentAvatarThumbnailImageUrl,
        });
        friendStore.fetchOnlineFriends();
        break;

      case 'friend-offline':
        feed.addEvent({
          type: 'friend_offline',
          userId: data.userId,
          userName: data.user?.displayName || data.userId,
          userAvatar: data.user?.currentAvatarThumbnailImageUrl,
        });
        friendStore.fetchOnlineFriends();
        break;

      case 'friend-location':
        if (data.location && data.location !== 'private') {
          const worldId = data.worldId || data.location?.split(':')[0];
          const worldName = data.world?.name || worldId;

          feed.addEvent({
            type: 'friend_location',
            userId: data.userId,
            userName: data.user?.displayName || data.userId,
            userAvatar: data.user?.currentAvatarThumbnailImageUrl,
            worldId,
            details: data.world?.name ? `Joined ${data.world.name}` : 'Changed location',
            newValue: data.location,
          });

          // Track world visit (non-blocking)
          logWorldVisit(worldId, worldName, Date.now())
            .catch(e => console.warn('[Analytics] Failed to track world visit:', e));
        } else if (data.location === 'private' || !data.location) {
          // User went offline or private - log exit from previous world
          const previousFriend = friendStore.getFriend(data.userId);
          if (previousFriend?.location && previousFriend.location !== 'private') {
            const previousWorldId = previousFriend.location.split(':')[0];
            logWorldExit(previousWorldId)
              .catch(e => console.warn('[Analytics] Failed to track world exit:', e));
          }
        }
        break;

      case 'friend-update':
        if (data.user) {
          feed.addEvent({
            type: 'friend_status',
            userId: data.userId,
            userName: data.user.displayName,
            userAvatar: data.user.currentAvatarThumbnailImageUrl,
            newValue: data.user.status,
            details: data.user.statusDescription,
          });
        }
        break;

      case 'friend-add':
        feed.addEvent({
          type: 'friend_add',
          userId: data.userId,
          userName: data.user?.displayName || data.userId,
          userAvatar: data.user?.currentAvatarThumbnailImageUrl,
        });
        friendStore.fetchOnlineFriends();
        break;

      case 'friend-delete':
        feed.addEvent({
          type: 'friend_remove',
          userId: data.userId,
          userName: data.userId,
        });
        friendStore.fetchOnlineFriends();
        break;

      case 'user-update': {
        // Current user's data changed (status, location, avatar, etc.).
        // Merge into authStore so location-tracking and Discord RPC react
        // immediately instead of waiting for the next polling tick.
        const auth = useAuthStore.getState();
        if (auth.user && data) {
          useAuthStore.setState({ user: { ...auth.user, ...data } });
        }
        break;
      }

      case 'notification': {
        // Check for moderation action notifications and correlate with filed reports
        const notifType = (data.type || '').toLowerCase();
        const notifMsg = (data.message || '').toLowerCase();
        const isModerationNotif =
          notifType.includes('moderat') ||
          notifType.includes('action') ||
          notifMsg.includes('action has been taken') ||
          notifMsg.includes('we have taken action');
        if (isModerationNotif) {
          useReportStore.getState().handleModerationNotification(data);
        }
        break;
      }
    }

    for (const listener of this.listeners) {
      listener(type, data);
    }
  }

  onEvent(listener: (type: WSEventType, data: any) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getStatus() {
    return this.isConnected;
  }
}

export const vrchatWS = new VRChatWebSocket();
export default vrchatWS;
