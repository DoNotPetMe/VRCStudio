import { useState } from 'react';
import { X } from 'lucide-react';
import { useTourStore } from '../stores/tourStore';

const HELPER_KEY = 'vrcstudio_helper_dismissed';

const TAB_DESCRIPTIONS = [
  { label: 'Dashboard',  route: '/',            desc: 'Overview of your VRChat status, recent activity, and quick links.' },
  { label: 'Friends',    route: '/friends',      desc: 'See which friends are online, in worlds, or offline. Click any friend for details.' },
  { label: 'Worlds',     route: '/worlds',       desc: 'Browse and search VRChat worlds. Click one to open it in VRChat.' },
  { label: 'Avatars',    route: '/avatars',      desc: 'Manage your uploaded avatars, favorites, and search the VRCDB.' },
  { label: 'Groups',     route: '/groups',       desc: 'View your VRChat groups and open them in the browser.' },
  { label: 'Friend Log', route: '/friend-log',   desc: 'See friend join/leave events, world changes, and your game history.' },
  { label: 'Settings',   route: '/settings',     desc: 'Customize themes, visualizer, Discord presence, privacy, and more.' },
];

export default function TutorialHelper() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(HELPER_KEY));
  const [open, setOpen] = useState(false);
  const [tourStep, setTourStepState] = useState<number | null>(null);
  const [tourDone, setTourDone] = useState(false);
  const setActiveRoute = useTourStore(s => s.set);

  if (dismissed) return null;

  const setTourStep = (step: number | null) => {
    setTourStepState(step);
    setActiveRoute(step !== null ? (TAB_DESCRIPTIONS[step]?.route ?? null) : null);
  };

  const dismiss = () => {
    localStorage.setItem(HELPER_KEY, '1');
    setDismissed(true);
    setOpen(false);
    setActiveRoute(null);
  };

  const startTour = () => {
    setOpen(false);
    setTourStep(0);
  };

  const stopTour = () => {
    setTourStep(null);
    setTourDone(false);
  };

  const advance = () => {
    if (tourStep === null) return;
    if (tourStep < TAB_DESCRIPTIONS.length - 1) {
      setTourStep(tourStep + 1);
    } else {
      setTourStep(null);
      setTourDone(true);
      setTimeout(() => setTourDone(false), 2500);
    }
  };

  return (
    <>
      {!open && tourStep === null && (
        <button
          onClick={() => setOpen(true)}
          className="mx-2 mb-1 text-[10px] text-surface-500 border border-dashed border-surface-700 bg-surface-900/60 px-2 py-1 rounded hover:border-surface-500 hover:text-surface-300 transition-colors w-[calc(100%-1rem)] text-center"
        >
          - - Lost? click here - -
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={() => setOpen(false)} />
          <div className="relative pointer-events-auto w-72 h-full bg-surface-900 border-l border-surface-800/60 flex flex-col shadow-2xl animate-slide-in-right">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800/60">
              <span className="text-sm font-semibold flex-1">Getting Started</span>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-surface-800 rounded text-surface-500 hover:text-surface-200">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-surface-400">This helper explains what each section of VRCStudio does.</p>
              <div className="space-y-2">
                {TAB_DESCRIPTIONS.map(({ label, desc }) => (
                  <div key={label} className="p-2.5 rounded-lg bg-surface-800/50">
                    <div className="text-xs font-semibold text-surface-200 mb-0.5">{label}</div>
                    <div className="text-[11px] text-surface-500">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-surface-800/40 space-y-2">
              <button onClick={startTour} className="btn-primary w-full text-xs py-2">Start Tour</button>
              <button onClick={dismiss} className="btn-secondary w-full text-xs py-2">Got it, don't show again</button>
            </div>
          </div>
        </div>
      )}

      {tourStep !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-800 border border-surface-700 rounded-xl shadow-2xl px-5 py-4 w-80 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-surface-500 tabular-nums">
              Step {tourStep + 1} / {TAB_DESCRIPTIONS.length}
            </span>
            <button onClick={stopTour} className="text-[10px] text-surface-500 hover:text-surface-300 flex items-center gap-1">
              <X size={10} /> Stop
            </button>
          </div>
          <div className="text-sm font-semibold text-surface-100 mb-1.5">
            {TAB_DESCRIPTIONS[tourStep].label}
          </div>
          <div className="text-xs text-surface-400 leading-relaxed">
            {TAB_DESCRIPTIONS[tourStep].desc}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={advance}
              className="text-xs px-3 py-1.5 rounded bg-accent-600/20 text-accent-400 hover:bg-accent-600/30 font-medium transition-colors"
            >
              {tourStep < TAB_DESCRIPTIONS.length - 1 ? 'Next →' : 'Finish'}
            </button>
          </div>
        </div>
      )}

      {tourDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-500/20 border border-green-500/30 rounded-xl px-5 py-3 text-sm text-green-400 animate-fade-in">
          Tour complete! You're all set.
        </div>
      )}
    </>
  );
}
