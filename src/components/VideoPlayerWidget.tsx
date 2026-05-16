// Compact widget showing what's currently playing on a video player in the
// active instance, plus what's been played earlier in this session and in
// past sessions of the same instance.
//
// Mounted on the Dashboard. Renders nothing useful when no videos have ever
// been seen — quietly stays out of the way.

import { useMemo, useState } from 'react';
import { Video, Copy, ExternalLink, Trash2, Play, History, Check } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useVideoPlayerStore, type PlayedVideo } from '../stores/videoPlayerStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

type Tab = 'now' | 'session' | 'all';

export default function VideoPlayerWidget() {
  const current = useVideoPlayerStore(s => s.current);
  const history = useVideoPlayerStore(s => s.history);
  const tailingActive = useVideoPlayerStore(s => s.tailingActive);
  const clearHistory = useVideoPlayerStore(s => s.clearHistory);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);

  const [tab, setTab] = useState<Tab>('now');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Videos for the active instance (this play-session of it)
  const instanceVideos = useMemo<PlayedVideo[]>(() => {
    if (!currentInstance) return [];
    const key = `${currentInstance.worldId}:${currentInstance.instanceId}`;
    return history[key] ?? [];
  }, [history, currentInstance?.worldId, currentInstance?.instanceId]);

  // All videos across all instances, newest first
  const allVideos = useMemo<PlayedVideo[]>(() => {
    const flat: PlayedVideo[] = [];
    for (const arr of Object.values(history)) flat.push(...arr);
    flat.sort((a, b) => b.timestamp - a.timestamp);
    return flat.slice(0, 50);
  }, [history]);

  const hasAny = allVideos.length > 0 || !!current;

  // Don't render at all on first launch — nothing useful to show
  if (!hasAny && tailingActive === false) return null;

  const open = (url: string) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  const copyUrl = (v: PlayedVideo) => {
    navigator.clipboard?.writeText(v.url);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const tabs: { id: Tab; label: string; icon: typeof Play; count?: number }[] = [
    { id: 'now', label: 'Now', icon: Play },
    { id: 'session', label: 'This Instance', icon: History, count: instanceVideos.length },
    { id: 'all', label: 'All', icon: Video, count: allVideos.length },
  ];

  return (
    <div className="glass-panel-solid p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Video size={16} className="text-purple-400" />
        <h3 className="text-sm font-semibold flex-1">Video Player</h3>
        {tailingActive && (
          <span className="flex items-center gap-1 text-[10px] text-green-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
          </span>
        )}
        {Object.keys(history).length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all video player history? This cannot be undone.')) clearHistory();
            }}
            className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors"
            title="Clear history"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {!tailingActive ? (
        <p className="text-xs text-surface-500 leading-relaxed">
          Live video tracking is unavailable — VRChat's log file couldn't be found.
          Launch VRChat at least once and reopen this app.
        </p>
      ) : (
        <>
          {/* Tab strip */}
          <div className="flex gap-1 border-b border-surface-800/60 -mx-1 px-1">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === id
                    ? 'text-accent-400 border-accent-500'
                    : 'text-surface-500 hover:text-surface-300 border-transparent'
                }`}
              >
                <Icon size={11} />
                {label}
                {count != null && count > 0 && (
                  <span className="text-[10px] text-surface-600 tabular-nums">{count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'now' && (
            current ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Play size={14} className="text-purple-400 mt-0.5 flex-shrink-0" fill="currentColor" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{current.label || current.url}</div>
                    <div className="text-[10px] text-surface-600 mt-0.5">
                      {formatDistanceToNow(current.timestamp, { addSuffix: true })}
                      {current.worldName && <> · in {current.worldName}</>}
                    </div>
                    <a
                      href={current.url}
                      onClick={e => { e.preventDefault(); open(current.url); }}
                      className="text-[10px] text-purple-400 hover:underline break-all block mt-0.5"
                    >
                      {current.url}
                    </a>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => copyUrl(current)} className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300" title="Copy">
                      {copiedId === current.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    <button onClick={() => open(current.url)} className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300" title="Open">
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-500 py-4 text-center">
                No video has been played yet this session.
              </p>
            )
          )}

          {tab === 'session' && (
            instanceVideos.length === 0 ? (
              <p className="text-xs text-surface-500 py-4 text-center">
                {currentInstance
                  ? 'No videos played in this instance yet.'
                  : 'Join an instance to see videos played there.'}
              </p>
            ) : (
              <VideoList videos={instanceVideos} onCopy={copyUrl} onOpen={open} copiedId={copiedId} />
            )
          )}

          {tab === 'all' && (
            allVideos.length === 0 ? (
              <p className="text-xs text-surface-500 py-4 text-center">No video history yet.</p>
            ) : (
              <VideoList videos={allVideos} onCopy={copyUrl} onOpen={open} copiedId={copiedId} showWorld />
            )
          )}
        </>
      )}
    </div>
  );
}

function VideoList({ videos, onCopy, onOpen, copiedId, showWorld }: {
  videos: PlayedVideo[];
  onCopy: (v: PlayedVideo) => void;
  onOpen: (url: string) => void;
  copiedId: string | null;
  showWorld?: boolean;
}) {
  return (
    <div className="max-h-72 overflow-y-auto -mx-2">
      {videos.map(v => (
        <div
          key={v.id}
          className="group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-surface-800/50 transition-colors"
        >
          <Video size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{v.label || v.url}</div>
            <div className="text-[10px] text-surface-600 flex items-center gap-1.5 flex-wrap">
              <span>{format(v.timestamp, 'MMM d HH:mm')}</span>
              {showWorld && v.worldName && (
                <>
                  <span className="text-surface-700">·</span>
                  <span className="truncate">{v.worldName}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onCopy(v)} className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-200" title="Copy">
              {copiedId === v.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            </button>
            <button onClick={() => onOpen(v.url)} className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-200" title="Open">
              <ExternalLink size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
