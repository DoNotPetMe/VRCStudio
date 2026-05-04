import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useMediaDetection, useSystemAudio } from '../hooks/useAudioVisualizer';

/**
 * Old-school equaliser — small white blocks bobbing up and down to whatever
 * the system is playing. Renders behind the app shell.
 *
 * If `onlyWithMedia` is on, the canvas is only mounted while Spotify or
 * YouTube is detected. Audio capture is attempted via desktopCapturer; if
 * it fails (no permission, etc.) we fall back to a procedural animation
 * that at least matches the vibe of the music.
 */
export default function AudioVisualizer() {
  const cfg = useThemeStore(s => s.theme.visualizer);
  const accentColor = useThemeStore(s => s.theme.accentColor);
  const media = useMediaDetection();
  const visible = cfg.enabled && (!cfg.onlyWithMedia || media.active);

  const { getFrequencyData } = useSystemAudio(visible);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const fakePhase = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);

    const accentMap: Record<string, [number, number, number]> = {
      blue:   [96, 165, 250],
      purple: [192, 132, 252],
      green:  [74, 222, 128],
      rose:   [251, 113, 133],
      amber:  [251, 191, 36],
      cyan:   [34, 211, 238],
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const data = getFrequencyData();
      const bars = cfg.barCount;
      // Slice frequency band based on focus
      // Frequency bins span 0..nyquist linearly. With fftSize 1024 → 512 bins.
      // We pick a sub-range matching the focus.
      const slice = (() => {
        if (!data) return null;
        const len = data.length;
        const ranges: Record<typeof cfg.focus, [number, number]> = {
          all:    [4, Math.floor(len * 0.7)],
          bass:   [2, Math.floor(len * 0.12)],
          mids:   [Math.floor(len * 0.1), Math.floor(len * 0.45)],
          treble: [Math.floor(len * 0.4), Math.floor(len * 0.85)],
        };
        const [lo, hi] = ranges[cfg.focus];
        return { data, lo, hi };
      })();

      const barW = W / bars;
      const gap = barW * 0.25;
      const drawW = barW - gap;

      for (let i = 0; i < bars; i++) {
        let v: number;
        if (slice) {
          const t = i / bars;
          const idx = Math.floor(slice.lo + t * (slice.hi - slice.lo));
          v = (slice.data[idx] / 255) * cfg.sensitivity;
        } else {
          // procedural fallback — gentle wave
          fakePhase.current += 0.0002;
          v = (
            0.3 + 0.25 * Math.sin(i * 0.18 + fakePhase.current * 1000) +
            0.15 * Math.sin(i * 0.45 + fakePhase.current * 1700)
          ) * cfg.sensitivity * 0.6;
        }
        v = Math.max(0.02, Math.min(1, v));

        const barH = v * H * 0.4;
        const x = i * barW + gap / 2;
        const y = H - barH;

        if (cfg.color === 'rainbow') {
          const hue = (i / bars) * 360 + (Date.now() * 0.05) % 360;
          ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
        } else if (cfg.color === 'accent') {
          const [r, g, b] = accentMap[accentColor] || accentMap.blue;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          ctx.fillStyle = '#ffffff';
        }

        ctx.fillRect(x, y, drawW, barH);
      }
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [visible, cfg.barCount, cfg.sensitivity, cfg.focus, cfg.color, accentColor, getFrequencyData]);

  if (!visible) return null;
  return <canvas ref={canvasRef} className="audio-visualizer-canvas" aria-hidden="true" />;
}
