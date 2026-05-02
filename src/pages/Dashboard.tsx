import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Globe,
  Activity,
  UserPlus,
  UserMinus,
  MapPin,
  CircleDot,
  Wifi,
  WifiOff,
  TrendingUp,
  History,
  Send,
  RotateCcw,
  Thermometer,
  CloudRain,
  Sun,
  Cloud,
  Snowflake,
  Wind,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useFeedStore } from '../stores/feedStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import UserAvatar from '../components/common/UserAvatar';
import api from '../api/vrchat';
import type { FeedEvent, UserStatus } from '../types/vrchat';
import { getBestAvatarUrl } from '../utils/avatar';
import WorldAnalyticsPanel from '../components/WorldAnalyticsPanel';

const eventIcons: Record<FeedEvent['type'], typeof Activity> = {
  friend_online: UserPlus,
  friend_offline: UserMinus,
  friend_location: MapPin,
  friend_status: CircleDot,
  friend_avatar: CircleDot,
  friend_add: UserPlus,
  friend_remove: UserMinus,
  world_visit: Globe,
};

const eventColors: Record<FeedEvent['type'], string> = {
  friend_online: 'text-green-400 bg-green-500/10',
  friend_offline: 'text-surface-500 bg-surface-500/10',
  friend_location: 'text-blue-400 bg-blue-500/10',
  friend_status: 'text-amber-400 bg-amber-500/10',
  friend_avatar: 'text-purple-400 bg-purple-500/10',
  friend_add: 'text-green-400 bg-green-500/10',
  friend_remove: 'text-red-400 bg-red-500/10',
  world_visit: 'text-blue-400 bg-blue-500/10',
};

function eventMessage(event: FeedEvent): string {
  switch (event.type) {
    case 'friend_online': return 'came online';
    case 'friend_offline': return 'went offline';
    case 'friend_location': return event.details || 'changed location';
    case 'friend_status': return `changed status to ${event.newValue}`;
    case 'friend_avatar': return 'changed avatar';
    case 'friend_add': return 'was added as friend';
    case 'friend_remove': return 'was removed as friend';
    case 'world_visit': return `visited ${event.worldName}`;
    default: return '';
  }
}

const statusColors: Record<string, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { events } = useFeedStore();
  const { history } = useInstanceHistoryStore();
  const [rejoining, setRejoining] = useState<string | null>(null);
  const [rejoined, setRejoined] = useState<Set<string>>(new Set());

  const handleRejoin = async (worldId: string, instanceId: string) => {
    const key = `${worldId}:${instanceId}`;
    setRejoining(key);
    try {
      await api.selfInvite(worldId, instanceId);
      setRejoined(prev => new Set(prev).add(key));
    } catch {}
    setRejoining(null);
  };

  const recentInstances = history.slice(0, 8);

  // Build a map for O(1) friend avatar lookup in the activity feed
  const friendAvatarMap = new Map<string, string>();
  for (const f of [...onlineFriends, ...offlineFriends]) {
    friendAvatarMap.set(f.id, getBestAvatarUrl(f));
  }

  const statusGroups: Record<string, typeof onlineFriends> = {
    'join me': [],
    'active': [],
    'ask me': [],
    'busy': [],
  };
  for (const f of onlineFriends) {
    if (statusGroups[f.status]) {
      statusGroups[f.status].push(f);
    }
  }

  const todayEvents = events.filter(e => Date.now() - e.timestamp < 86400000);
  const recentEvents = events.slice(0, 40);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <DashboardGreeting />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Wifi}
          label="Online"
          value={onlineFriends.length}
          accent="text-green-400"
          bg="bg-green-500/10"
          detail={`of ${onlineFriends.length + offlineFriends.length} friends`}
        />
        <StatCard
          icon={Users}
          label="Total Friends"
          value={onlineFriends.length + offlineFriends.length}
          accent="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={Globe}
          label="Join Me"
          value={statusGroups['join me'].length}
          accent="text-status-joinme"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={TrendingUp}
          label="Events Today"
          value={todayEvents.length}
          accent="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Status breakdown */}
      <div className="glass-panel-solid p-4">
        <div className="flex items-center gap-6">
          {Object.entries(statusGroups).map(([status, friends]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
              <span className="text-xs text-surface-400 capitalize">{status}</span>
              <span className="text-xs font-semibold text-surface-200 tabular-nums">{friends.length}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-offline" />
            <span className="text-xs text-surface-400">Offline</span>
            <span className="text-xs font-semibold text-surface-200 tabular-nums">{offlineFriends.length}</span>
          </div>
        </div>
      </div>

      {/* Recent Instances / Rejoin */}
      {recentInstances.length > 0 && (
        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <History size={14} />
              Recent Instances
            </h2>
            <span className="text-xs text-surface-600">Rejoin private worlds</span>
          </div>
          <div className="divide-y divide-surface-800/30 max-h-64 overflow-y-auto">
            {recentInstances.map(inst => {
              const key = `${inst.worldId}:${inst.instanceId}`;
              const isRejoining = rejoining === key;
              const hasRejoined = rejoined.has(key);
              const isPrivate = inst.instanceType !== 'public';
              return (
                <div key={inst.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors">
                  {inst.worldImage ? (
                    <img src={inst.worldImage} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0 bg-surface-800" />
                  ) : (
                    <div className="w-10 h-7 rounded bg-surface-800 flex items-center justify-center flex-shrink-0">
                      <Globe size={12} className="text-surface-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate text-surface-200">{inst.worldName}</div>
                    <div className="text-[11px] text-surface-500 flex items-center gap-1.5">
                      <span className={`capitalize ${isPrivate ? 'text-amber-400/70' : ''}`}>{inst.instanceType}</span>
                      <span>&middot;</span>
                      <span>{formatDistanceToNow(inst.joinedAt, { addSuffix: true })}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRejoin(inst.worldId, inst.instanceId)}
                    disabled={isRejoining || hasRejoined}
                    className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1 flex-shrink-0 transition-colors ${
                      hasRejoined
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-accent-600/15 text-accent-400 hover:bg-accent-600/25'
                    }`}
                    title={isPrivate ? 'Rejoin this private instance' : 'Join this instance'}
                  >
                    {hasRejoined ? (
                      <>Sent!</>
                    ) : isRejoining ? (
                      <>Joining...</>
                    ) : (
                      <><RotateCcw size={11} /> Rejoin</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Feed */}
        <div className="lg:col-span-2 glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Activity size={14} />
              Activity Feed
            </h2>
            <span className="text-xs text-surface-600">{todayEvents.length} today</span>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-surface-500 text-sm py-12 text-center">
              No activity yet. Events will appear as friends come online and move around.
            </p>
          ) : (
            <div className="divide-y divide-surface-800/30 max-h-[520px] overflow-y-auto">
              {recentEvents.map(event => {
                const Icon = eventIcons[event.type] || Activity;
                const colorClasses = eventColors[event.type] || 'text-surface-400 bg-surface-500/10';
                const [textColor, bgColor] = colorClasses.split(' ');
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={13} className={textColor} />
                    </div>
                    {(friendAvatarMap.get(event.userId) || event.userAvatar) && (
                      <UserAvatar src={friendAvatarMap.get(event.userId) || event.userAvatar || ''} size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px]">
                        <span className="font-medium text-surface-200">{event.userName}</span>{' '}
                        <span className="text-surface-500">{eventMessage(event)}</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-surface-600 flex-shrink-0 tabular-nums">
                      {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Online Friends sidebar */}
        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Users size={14} />
              Online Now
            </h2>
            <span className="text-xs font-medium text-green-400 tabular-nums">{onlineFriends.length}</span>
          </div>
          {onlineFriends.length === 0 ? (
            <div className="py-12 text-center">
              <WifiOff size={24} className="mx-auto text-surface-700 mb-2" />
              <p className="text-surface-500 text-sm">No friends online</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-800/20 max-h-[520px] overflow-y-auto">
              {onlineFriends.slice(0, 40).map(friend => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-800/30 transition-colors"
                >
                  <UserAvatar
                    src={getBestAvatarUrl(friend)}
                    status={friend.status}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate text-surface-200">{friend.displayName}</div>
                    <div className="text-[11px] text-surface-500 truncate">
                      {friend.statusDescription || friend.status}
                    </div>
                  </div>
                </div>
              ))}
              {onlineFriends.length > 40 && (
                <p className="text-xs text-surface-600 text-center py-2.5">
                  +{onlineFriends.length - 40} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* World Analytics */}
      <div className="glass-panel-solid p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
            <Globe size={14} />
            World Activity
          </h2>
          <span className="text-xs text-surface-600">Auto-tracked</span>
        </div>
        <WorldAnalyticsPanel limit={8} />
      </div>
    </div>
  );
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

interface WeatherInfo {
  temp: number;
  condition: string;
  icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'wind';
}

function wmoToWeather(code: number): Omit<WeatherInfo, 'temp'> {
  if (code === 0) return { condition: 'Clear sky', icon: 'sun' };
  if (code <= 3)  return { condition: 'Partly cloudy', icon: 'cloud' };
  if (code <= 48) return { condition: 'Foggy', icon: 'fog' };
  if (code <= 55) return { condition: 'Drizzle', icon: 'rain' };
  if (code <= 67) return { condition: 'Rainy', icon: 'rain' };
  if (code <= 77) return { condition: 'Snowy', icon: 'snow' };
  if (code <= 82) return { condition: 'Rain showers', icon: 'rain' };
  if (code <= 86) return { condition: 'Snow showers', icon: 'snow' };
  if (code <= 99) return { condition: 'Thunderstorm', icon: 'storm' };
  return { condition: 'Windy', icon: 'wind' };
}

const weatherIconMap: Record<WeatherInfo['icon'], typeof Sun> = {
  sun: Sun, cloud: Cloud, rain: CloudRain, snow: Snowflake, storm: Zap, fog: Wind, wind: Wind,
};

const weatherColorMap: Record<WeatherInfo['icon'], string> = {
  sun: 'text-amber-400', cloud: 'text-surface-400', rain: 'text-blue-400',
  snow: 'text-cyan-300', storm: 'text-yellow-300', fog: 'text-surface-500', wind: 'text-surface-400',
};

function getTimeOfDay(h: number) {
  if (h >= 5 && h < 12)  return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

// ─── Dashboard Greeting component ─────────────────────────────────────────────

function DashboardGreeting() {
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const { onlineFriends } = useFriendStore();

  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayName = settings.profile.nickname.trim() || user?.displayName || 'Traveler';

  // Live clock — ticks every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch weather once if enabled
  useEffect(() => {
    if (!settings.profile.showWeather || !settings.profile.greetingEnabled) return;
    navigator.geolocation?.getCurrentPosition(
      async ({ coords }) => {
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          const code: number = data.current.weather_code;
          const temp = Math.round(data.current.temperature_2m);
          setWeather({ temp, ...wmoToWeather(code) });
        } catch {}
      },
      () => {}
    );
  }, [settings.profile.showWeather, settings.profile.greetingEnabled]);

  const joinMeFriends = useMemo(
    () => onlineFriends.filter(f => f.status === 'join me'),
    [onlineFriends]
  );

  const tickerMessages = useMemo(() => {
    const msgs: Array<{ text: string; sub?: string }> = [];
    // 1. Date & time
    msgs.push({ text: format(now, 'EEEE, MMMM d'), sub: format(now, 'h:mm a') });
    // 2. Friends status
    if (onlineFriends.length === 0) {
      msgs.push({ text: 'No friends online right now', sub: 'The perfect time to explore new worlds' });
    } else {
      msgs.push({
        text: `${onlineFriends.length} friend${onlineFriends.length === 1 ? '' : 's'} online`,
        sub: onlineFriends.length === 1
          ? `${onlineFriends[0].displayName} is online`
          : `Including ${onlineFriends[0].displayName} and ${onlineFriends.length - 1} more`,
      });
    }
    // 3. Join-me friends
    if (joinMeFriends.length > 0) {
      const names = joinMeFriends.slice(0, 2).map(f => f.displayName).join(' & ');
      msgs.push({
        text: joinMeFriends.length === 1 ? `${names} is inviting you to join!` : `${joinMeFriends.length} friends want you to join`,
        sub: joinMeFriends.length > 2 ? `${names} and ${joinMeFriends.length - 2} more` : names,
      });
    }
    // 4. Weather (if fetched)
    if (weather) {
      msgs.push({ text: `${weather.condition}`, sub: `${weather.temp}°C outside right now` });
    }
    return msgs;
  }, [now, onlineFriends, joinMeFriends, weather]);

  // Rotate ticker every 8 seconds
  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (tickerMessages.length <= 1) return;
    tickerRef.current = setInterval(() => {
      setTickerIndex(i => (i + 1) % tickerMessages.length);
    }, 8_000);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
  }, [tickerMessages.length]);

  const safeTicker = tickerIndex % Math.max(tickerMessages.length, 1);
  const currentTicker = tickerMessages[safeTicker] ?? tickerMessages[0];

  if (!settings.profile.greetingEnabled) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-surface-100">
          Welcome back, <span className="text-gradient">{displayName}</span>
        </h1>
        <p className="text-surface-500 text-sm mt-0.5">Here's what's happening in your VRChat world</p>
      </div>
    );
  }

  const WeatherIcon = weather ? weatherIconMap[weather.icon] : Thermometer;
  const weatherColor = weather ? weatherColorMap[weather.icon] : 'text-surface-500';
  const hour = now.getHours();

  return (
    <div className="flex items-start justify-between gap-6 w-full">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-surface-100">
          {getTimeOfDay(hour)}, <span className="text-gradient">{displayName}</span>
        </h1>
        {/* Animated ticker */}
        <div className="mt-1.5 h-9 overflow-hidden">
          <div key={safeTicker} className="animate-fade-in">
            <p className="text-sm text-surface-300 leading-tight">{currentTicker?.text}</p>
            {currentTicker?.sub && (
              <p className="text-xs text-surface-500 mt-0.5 leading-tight">{currentTicker.sub}</p>
            )}
          </div>
        </div>
        {/* Ticker dots */}
        {tickerMessages.length > 1 && (
          <div className="flex items-center gap-1 mt-1">
            {tickerMessages.map((_, i) => (
              <button
                key={i}
                onClick={() => setTickerIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === safeTicker ? 'bg-accent-400 w-3' : 'bg-surface-700 hover:bg-surface-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {/* Weather badge */}
      {settings.profile.showWeather && weather && (
        <div className="flex-shrink-0 glass-panel px-3 py-2 flex items-center gap-2 text-sm">
          <WeatherIcon size={16} className={weatherColor} />
          <div className="text-right">
            <div className="text-surface-200 font-medium tabular-nums">{weather.temp}°C</div>
            <div className="text-xs text-surface-500">{weather.condition}</div>
          </div>
        </div>
      )}
      {settings.profile.showWeather && !weather && (
        <div className="flex-shrink-0 glass-panel px-3 py-2 flex items-center gap-2 text-sm opacity-50">
          <Thermometer size={16} className="text-surface-500" />
          <div className="text-xs text-surface-500">Fetching weather…</div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, bg, detail }: {
  icon: typeof Activity; label: string; value: number; accent: string; bg: string; detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${accent} flex-shrink-0`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-surface-100 tabular-nums">{value}</div>
        <div className="text-xs text-surface-500">{label}</div>
        {detail && <div className="text-[10px] text-surface-600 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}
