import { useState, useMemo } from 'react';
import { Flame, Calendar, Clock, Globe, TrendingUp, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import { format, startOfWeek, addDays, subDays, differenceInDays, startOfDay, isThisMonth, isThisWeek } from 'date-fns';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS_TO_SHOW = 26;

const intensityColors = [
  'bg-surface-800',
  'bg-emerald-900/60',
  'bg-emerald-700/70',
  'bg-emerald-500/80',
  'bg-emerald-400',
];

function getIntensity(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  if (minutes < 180) return 3;
  return 4;
}

function fmtMins(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export default function ActivityHeatmapPage() {
  const { history } = useInstanceHistoryStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<{ day: string; minutes: number; visits: number; x: number; y: number } | null>(null);

  // Build per-day stats from actual instance history
  const dailyStats = useMemo(() => {
    const map: Record<string, { minutes: number; visits: number; worldIds: Set<string> }> = {};
    for (const inst of history) {
      const day = format(inst.joinedAt, 'yyyy-MM-dd');
      if (!map[day]) map[day] = { minutes: 0, visits: 0, worldIds: new Set() };
      map[day].visits++;
      map[day].worldIds.add(inst.worldId);
      if (inst.leftAt) {
        map[day].minutes += (inst.leftAt - inst.joinedAt) / 60000;
      }
    }
    return map;
  }, [history]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (history.length === 0) return null;

    const totalMs = history.reduce((acc, h) => acc + (h.leftAt ? h.leftAt - h.joinedAt : 0), 0);
    const thisMonthMs = history.filter(h => isThisMonth(new Date(h.joinedAt)))
      .reduce((acc, h) => acc + (h.leftAt ? h.leftAt - h.joinedAt : 0), 0);
    const thisWeekMs = history.filter(h => isThisWeek(new Date(h.joinedAt), { weekStartsOn: 1 }))
      .reduce((acc, h) => acc + (h.leftAt ? h.leftAt - h.joinedAt : 0), 0);

    // Longest session
    const longest = history.reduce((best, h) => {
      const dur = h.leftAt ? h.leftAt - h.joinedAt : 0;
      return dur > (best?.dur ?? 0) ? { dur, worldName: h.worldName, joinedAt: h.joinedAt } : best;
    }, null as { dur: number; worldName: string; joinedAt: number } | null);

    // Active days
    const activeDays = new Set(history.map(h => format(h.joinedAt, 'yyyy-MM-dd'))).size;

    // Streak
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;
    const today = startOfDay(new Date());
    for (let i = 0; i < 365; i++) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      if (dailyStats[d]?.visits > 0) {
        streak++;
        if (i === currentStreak) currentStreak = streak;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 0;
      }
    }
    longestStreak = Math.max(longestStreak, streak);

    return { totalMs, thisMonthMs, thisWeekMs, longest, activeDays, currentStreak, longestStreak };
  }, [history, dailyStats]);

  // Top worlds by time
  const topWorlds = useMemo(() => {
    const worldTime: Record<string, { worldId: string; worldName: string; worldImage: string; ms: number; visits: number }> = {};
    for (const inst of history) {
      if (!worldTime[inst.worldId]) {
        worldTime[inst.worldId] = { worldId: inst.worldId, worldName: inst.worldName || inst.worldId, worldImage: inst.worldImage, ms: 0, visits: 0 };
      }
      worldTime[inst.worldId].visits++;
      if (inst.leftAt) worldTime[inst.worldId].ms += inst.leftAt - inst.joinedAt;
      // Prefer the entry with the real name
      if (inst.worldName && inst.worldName !== inst.worldId) {
        worldTime[inst.worldId].worldName = inst.worldName;
      }
      if (inst.worldImage) worldTime[inst.worldId].worldImage = inst.worldImage;
    }
    return Object.values(worldTime).sort((a, b) => b.ms - a.ms).slice(0, 5);
  }, [history]);

  // Hourly breakdown (by minutes played, not event count)
  const hourlyActivity = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const inst of history) {
      const h = new Date(inst.joinedAt).getHours();
      hours[h] += inst.leftAt ? (inst.leftAt - inst.joinedAt) / 60000 : 30;
    }
    const max = Math.max(...hours, 1);
    return hours.map((mins, hour) => ({ hour, mins: Math.round(mins), pct: (mins / max) * 100 }));
  }, [history]);

  // Peak hours description
  const peakHoursLabel = useMemo(() => {
    const sorted = [...hourlyActivity].sort((a, b) => b.mins - a.mins);
    const topHours = sorted.slice(0, 3).map(h => h.hour).sort((a, b) => a - b);
    if (topHours.length === 0) return null;
    const fmt = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    return `${fmt(topHours[0])} – ${fmt(topHours[topHours.length - 1])}`;
  }, [hourlyActivity]);

  // Day of week breakdown (by minutes played)
  const dayOfWeekActivity = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = new Array(7).fill(0);
    for (const inst of history) {
      const d = new Date(inst.joinedAt).getDay();
      totals[d] += inst.leftAt ? (inst.leftAt - inst.joinedAt) / 60000 : 30;
    }
    const max = Math.max(...totals, 1);
    return days.map((name, i) => ({ name, mins: Math.round(totals[i]), pct: (totals[i] / max) * 100 }));
  }, [history]);

  const peakDayLabel = useMemo(() => {
    if (!dayOfWeekActivity.some(d => d.mins > 0)) return null;
    return dayOfWeekActivity.reduce((best, d) => d.mins > best.mins ? d : best).name;
  }, [dayOfWeekActivity]);

  // Build heatmap grid
  const grid = useMemo(() => {
    const today = new Date();
    const baseDate = subDays(today, weekOffset * 7);
    const endDate = baseDate;
    const startDate = subDays(startOfWeek(endDate, { weekStartsOn: 1 }), (WEEKS_TO_SHOW - 1) * 7);
    const weeks: { date: Date; minutes: number; visits: number; day: string }[][] = [];
    let current = startDate;
    while (differenceInDays(endDate, current) >= 0) {
      const weekIndex = Math.floor(differenceInDays(current, startDate) / 7);
      if (!weeks[weekIndex]) weeks[weekIndex] = [];
      const dayStr = format(current, 'yyyy-MM-dd');
      const data = dailyStats[dayStr];
      weeks[weekIndex].push({ date: current, minutes: data ? Math.round(data.minutes) : 0, visits: data?.visits ?? 0, day: dayStr });
      current = addDays(current, 1);
    }
    return { weeks, startDate, endDate };
  }, [dailyStats, weekOffset]);

  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    grid.weeks.forEach((week, i) => {
      if (week.length > 0) {
        const month = week[0].date.getMonth();
        if (month !== lastMonth) {
          labels.push({ label: format(week[0].date, 'MMM'), weekIndex: i });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [grid]);

  if (history.length === 0) {
    return (
      <div className="max-w-6xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
          <Flame size={24} className="text-emerald-400" /> Activity
        </h1>
        <div className="glass-panel-solid p-16 text-center">
          <Flame size={48} className="mx-auto mb-3 text-surface-700" />
          <p className="font-semibold text-surface-300">No activity recorded yet</p>
          <p className="text-xs text-surface-500 mt-1">Join some VRChat worlds and your stats will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flame size={24} className="text-emerald-400" /> Activity
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">Your playtime and world visit history</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Timer size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-surface-100 tabular-nums">{fmtMins(stats.thisMonthMs)}</div>
              <div className="text-xs text-surface-500">This month</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Timer size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-surface-100 tabular-nums">{fmtMins(stats.thisWeekMs)}</div>
              <div className="text-xs text-surface-500">This week</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Flame size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-surface-100 tabular-nums">{stats.currentStreak}</div>
              <div className="text-xs text-surface-500">Day streak</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 flex-shrink-0">
              <Calendar size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-surface-100 tabular-nums">{stats.activeDays}</div>
              <div className="text-xs text-surface-500">Active days total</div>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap */}
      <div className="glass-panel-solid p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-300">Playtime Calendar</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w + WEEKS_TO_SHOW)} className="btn-ghost p-1">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setWeekOffset(0)} className="btn-ghost text-xs px-2 py-1" disabled={weekOffset === 0}>Today</button>
            <button onClick={() => setWeekOffset(w => Math.max(0, w - WEEKS_TO_SHOW))} className="btn-ghost p-1" disabled={weekOffset === 0}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex ml-8" style={{ gap: 0 }}>
          {monthLabels.map(({ label, weekIndex }, i) => (
            <div key={i} className="text-[10px] text-surface-500" style={{ position: 'relative', left: weekIndex * (CELL_SIZE + CELL_GAP), width: 0, whiteSpace: 'nowrap' }}>
              {label}
            </div>
          ))}
        </div>

        <div className="flex gap-0 mt-2 relative">
          <div className="flex flex-col flex-shrink-0 mr-2" style={{ gap: CELL_GAP }}>
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="text-[10px] text-surface-500 flex items-center justify-end" style={{ height: CELL_SIZE, width: 24 }}>
                {label}
              </div>
            ))}
          </div>
          <div className="flex overflow-x-auto" style={{ gap: CELL_GAP }}>
            {grid.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                {week.map(({ minutes, visits, day }) => (
                  <div
                    key={day}
                    className={`rounded-sm cursor-pointer transition-all hover:ring-1 hover:ring-surface-400 ${intensityColors[getIntensity(minutes)]}`}
                    style={{ width: CELL_SIZE, height: CELL_SIZE }}
                    onMouseEnter={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setHoveredCell({ day, minutes, visits, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                ))}
              </div>
            ))}
          </div>
          {hoveredCell && (
            <div className="fixed z-50 glass-panel px-2.5 py-1.5 text-xs pointer-events-none" style={{ left: hoveredCell.x - 40, top: hoveredCell.y - 44 }}>
              <div className="font-semibold">{format(new Date(hoveredCell.day), 'MMM d, yyyy')}</div>
              <div className="text-surface-400">
                {hoveredCell.minutes > 0 ? `${fmtMins(hoveredCell.minutes * 60000)} · ${hoveredCell.visits} visit${hoveredCell.visits !== 1 ? 's' : ''}` : 'No activity'}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-4 justify-end">
          <span className="text-[10px] text-surface-500">Less</span>
          {intensityColors.map((color, i) => <div key={i} className={`rounded-sm ${color}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />)}
          <span className="text-[10px] text-surface-500">More</span>
        </div>
      </div>

      {/* Top worlds + insights row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top worlds */}
        <div className="glass-panel-solid p-5">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-4">
            <Globe size={14} /> Top Worlds by Time
          </h2>
          {topWorlds.length === 0 ? (
            <p className="text-xs text-surface-600">No data yet</p>
          ) : (
            <div className="space-y-3">
              {topWorlds.map((w, i) => {
                const maxMs = topWorlds[0].ms || 1;
                return (
                  <div key={w.worldId} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-surface-600 w-4 text-right">{i + 1}</span>
                    {w.worldImage ? (
                      <img src={w.worldImage} alt="" className="w-9 h-7 rounded object-cover flex-shrink-0 bg-surface-800" />
                    ) : (
                      <div className="w-9 h-7 rounded bg-surface-800 flex items-center justify-center flex-shrink-0">
                        <Globe size={12} className="text-surface-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{w.worldName}</div>
                      <div className="mt-1 bg-surface-800 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${(w.ms / maxMs) * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold text-surface-300">{fmtMins(w.ms)}</div>
                      <div className="text-[10px] text-surface-600">{w.visits} visit{w.visits !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="space-y-4">
          {/* Hourly */}
          <div className="glass-panel-solid p-5">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-3">
              <Clock size={14} /> Play by Hour
              {peakHoursLabel && <span className="ml-auto text-[10px] text-emerald-400 font-normal">Peak: {peakHoursLabel}</span>}
            </h2>
            <div className="flex items-end gap-[2px] h-20">
              {hourlyActivity.map(({ hour, mins, pct }) => (
                <div key={hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="w-full bg-accent-500/50 rounded-t-sm transition-all group-hover:bg-accent-400" style={{ height: `${Math.max(pct, 2)}%` }} />
                  {hour % 6 === 0 && <span className="text-[8px] text-surface-700 tabular-nums">{hour}h</span>}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 glass-panel px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {mins > 0 ? `${fmtMins(mins * 60000)} at ${hour}:00` : 'No activity'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Day of week */}
          <div className="glass-panel-solid p-5">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-3">
              <Calendar size={14} /> Play by Day
              {peakDayLabel && <span className="ml-auto text-[10px] text-emerald-400 font-normal">Most: {peakDayLabel}s</span>}
            </h2>
            <div className="space-y-1.5">
              {dayOfWeekActivity.map(({ name, mins, pct }) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-[10px] text-surface-500 w-7 text-right">{name}</span>
                  <div className="flex-1 bg-surface-800 rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-accent-500/60 rounded-full transition-all flex items-center justify-end pr-1.5" style={{ width: `${Math.max(pct, 2)}%` }}>
                      {pct > 20 && <span className="text-[9px] text-white/70">{fmtMins(mins * 60000)}</span>}
                    </div>
                  </div>
                  {pct <= 20 && <span className="text-[10px] text-surface-500 w-10 tabular-nums">{mins > 0 ? fmtMins(mins * 60000) : '—'}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Extra insights row */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="glass-panel-solid p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <TrendingUp size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold">{fmtMins(stats.totalMs)}</div>
              <div className="text-[11px] text-surface-500">All-time playtime</div>
            </div>
          </div>
          {stats.longest && stats.longest.dur > 0 && (
            <div className="glass-panel-solid p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
                <Timer size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{fmtMins(stats.longest.dur)}</div>
                <div className="text-[11px] text-surface-500 truncate">
                  Longest session · {stats.longest.worldName !== stats.longest.worldName.startsWith('wrld_') ? stats.longest.worldName : 'Unknown world'}
                </div>
              </div>
            </div>
          )}
          <div className="glass-panel-solid p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Flame size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold">{stats.longestStreak} day{stats.longestStreak !== 1 ? 's' : ''}</div>
              <div className="text-[11px] text-surface-500">Longest streak ever</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
