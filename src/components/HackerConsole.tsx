// Floating "live console" panel that's only mounted when the Hacker
// premium theme is active. Streams a small log of what's happening in
// the app as code-style entries:
//
//   12:43:01  > router.navigate('/friends')
//   12:43:02  // friends.online == 14
//   12:43:05  + friend.online: ShadowFox
//
// Pulls signals from existing stores (router location, friend store,
// instance store, video player store). Tail of last ~40 lines, ring-buffer
// style — kept fully in-memory so closing the app wipes it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Terminal, X } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';

type LineKind = 'route' | 'event' | 'comment';
interface ConsoleLine {
  id: number;
  ts: Date;
  kind: LineKind;
  text: string;
}

const MAX_LINES = 50;
let lineCounter = 0;

function fmtTime(d: Date) {
  return d.toTimeString().slice(0, 8);
}

export default function HackerConsole() {
  const isHacker = useThemeStore(s => s.theme.premiumTheme === 'hacker');
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const onlineFriends = useFriendStore(s => s.onlineFriends);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const currentVideo = useVideoPlayerStore(s => s.current);
  const livePlayerCount = useInstanceAvatarsStore(s => Object.keys(s.byPlayer).length);

  const [lines, setLines] = useState<ConsoleLine[]>(() => [
    { id: lineCounter++, ts: new Date(), kind: 'comment', text: '// VRCStudio TUI shell — read-only feed' },
  ]);
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Refs to remember last-seen values so we only emit deltas, not state
  // dumps on every render.
  const lastRoute = useRef<string | null>(null);
  const lastOnlineNames = useRef<Set<string>>(new Set());
  const lastInstanceId = useRef<string | null>(null);
  const lastVideoUrl = useRef<string | null>(null);
  const lastPlayerCount = useRef<number>(0);

  const push = (line: Omit<ConsoleLine, 'id' | 'ts'>) => {
    setLines(prev => {
      const next = [...prev, { ...line, id: lineCounter++, ts: new Date() }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  };

  // Route changes
  useEffect(() => {
    if (!isHacker) return;
    if (lastRoute.current === location.pathname) return;
    lastRoute.current = location.pathname;
    push({ kind: 'route', text: `> router.navigate('${location.pathname}')` });
  }, [location.pathname, isHacker]);

  // Friend online/offline diffs
  useEffect(() => {
    if (!isHacker) return;
    const current = new Set(onlineFriends.map(f => f.displayName));
    const prev = lastOnlineNames.current;
    // Joined
    for (const name of current) {
      if (!prev.has(name)) push({ kind: 'event', text: `+ friend.online: ${name}` });
    }
    // Left
    for (const name of prev) {
      if (!current.has(name)) push({ kind: 'event', text: `- friend.offline: ${name}` });
    }
    lastOnlineNames.current = current;
  }, [onlineFriends, isHacker]);

  // Instance changes
  useEffect(() => {
    if (!isHacker) return;
    const id = currentInstance?.id ?? null;
    if (id === lastInstanceId.current) return;
    lastInstanceId.current = id;
    if (currentInstance) {
      push({
        kind: 'event',
        text: `> instance.join('${currentInstance.worldName || currentInstance.worldId}')`,
      });
    } else {
      push({ kind: 'comment', text: '// instance.leave()' });
    }
  }, [currentInstance?.id, isHacker]);

  // Video player firehose
  useEffect(() => {
    if (!isHacker) return;
    const url = currentVideo?.url ?? null;
    if (url === lastVideoUrl.current) return;
    lastVideoUrl.current = url;
    if (currentVideo) {
      push({
        kind: 'event',
        text: `> videoPlayer.load('${currentVideo.label ?? currentVideo.url}')`,
      });
    }
  }, [currentVideo?.url, isHacker]);

  // Player-count delta in current instance
  useEffect(() => {
    if (!isHacker) return;
    const prev = lastPlayerCount.current;
    if (livePlayerCount !== prev) {
      lastPlayerCount.current = livePlayerCount;
      if (prev !== 0 || livePlayerCount !== 0) {
        push({ kind: 'comment', text: `// instance.players.length = ${livePlayerCount}` });
      }
    }
  }, [livePlayerCount, isHacker]);

  // Auto-scroll to bottom on new line
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines.length]);

  // Status line at the bottom (live state summary, not a log entry)
  const statusLine = useMemo(() => {
    const parts = [
      user?.displayName ? `user: ${user.displayName}` : 'user: null',
      `online: ${onlineFriends.length}`,
      `route: ${location.pathname}`,
    ];
    return parts.join(' | ');
  }, [user?.displayName, onlineFriends.length, location.pathname]);

  if (!isHacker) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="hacker-console-pill"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 9000,
          background: 'rgba(0, 5, 2, 0.92)',
          border: '1px solid rgba(0, 255, 100, 0.4)',
          color: 'rgb(120, 255, 160)',
          fontFamily: '"JetBrains Mono", "Consolas", monospace',
          fontSize: 11,
          padding: '4px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer',
          boxShadow: '0 0 14px rgba(0, 255, 100, 0.18)',
        }}
        title="Open console"
      >
        <Terminal size={11} />
        $_
      </button>
    );
  }

  return (
    <div className="hacker-console">
      <div className="hacker-console-header">
        <span>
          <Terminal size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 6 }} />
          vrcstudio.sh — live
        </span>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgb(120, 255, 160)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
          }}
          title="Hide"
        >
          <X size={11} />
        </button>
      </div>

      <div className="hacker-console-body" ref={bodyRef}>
        {lines.map(line => (
          <div key={line.id} className="hacker-console-row">
            <span className="hacker-console-time">{fmtTime(line.ts)}</span>
            <span className={`hacker-console-${line.kind}`}>{line.text}</span>
          </div>
        ))}
        <div className="hacker-console-row">
          <span className="hacker-console-time">{fmtTime(new Date())}</span>
          <span className="hacker-console-comment hacker-cursor">// awaiting input</span>
        </div>
      </div>

      <div style={{
        padding: '3px 8px',
        borderTop: '1px solid rgba(0, 255, 100, 0.25)',
        fontSize: 9.5,
        color: 'rgba(120, 255, 160, 0.55)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {statusLine}
      </div>
    </div>
  );
}
