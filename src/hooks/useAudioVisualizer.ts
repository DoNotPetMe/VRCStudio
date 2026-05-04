import { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';

export interface MediaInfo {
  active: boolean;
  source: 'spotify' | 'youtube' | null;
  title: string | null;
}

/**
 * Polls Electron main process for Spotify/YouTube playback status.
 * Falls back to "always active" when running outside Electron.
 */
export function useMediaDetection(): MediaInfo {
  const [info, setInfo] = useState<MediaInfo>({ active: false, source: null, title: null });

  useEffect(() => {
    if (!window.electronAPI?.detectMedia) {
      // browser fallback — assume always-on so the visualizer is at least visible during dev
      setInfo({ active: true, source: null, title: null });
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await window.electronAPI!.detectMedia();
        if (!cancelled) setInfo(next);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return info;
}

/**
 * Captures system audio (when supported) and exposes a frequency-bin getter.
 * Resolves once a stream is established. Caller should poll `getFrequencyData`
 * inside requestAnimationFrame.
 */
export function useSystemAudio(enabled: boolean) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const smoothing = useThemeStore(s => s.theme.visualizer.smoothing);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      try {
        const sources = window.electronAPI?.getDesktopSources
          ? await window.electronAPI.getDesktopSources()
          : [];

        // Prefer Spotify-named source, fall back to first screen source.
        const spotify = sources.find(s => /spotify/i.test(s.name));
        const screen  = sources.find(s => /entire screen|screen/i.test(s.name));
        const chosen  = spotify || screen || sources[0];

        const constraints: any = chosen
          ? {
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: chosen.id,
                },
              },
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: chosen.id,
                  maxWidth: 1, maxHeight: 1,
                },
              },
            }
          : { audio: true, video: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        // Throw away the dummy video track if we asked for one.
        stream.getVideoTracks().forEach(t => t.stop());

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = smoothing;
        src.connect(analyser);
        // Don't connect to ctx.destination — we don't want to re-play the audio.

        ctxRef.current = ctx;
        analyserRef.current = analyser;
        streamRef.current = stream;
        setReady(true);
      } catch (err) {
        setError((err as Error).message || 'Audio capture failed');
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close();
      analyserRef.current = null;
      ctxRef.current = null;
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled, smoothing]);

  return {
    ready,
    error,
    getFrequencyData: () => {
      const a = analyserRef.current;
      if (!a) return null;
      const data = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(data);
      return data;
    },
  };
}
