import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useMediaDetection, useSystemAudio } from '../hooks/useAudioVisualizer';

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

    function getColor(i: number, total: number): string {
      if (cfg.color === 'rainbow') {
        const hue = (i / total) * 360 + (Date.now() * 0.05) % 360;
        return `hsl(${hue}, 80%, 65%)`;
      }
      if (cfg.color === 'accent') {
        const [r, g, b] = accentMap[accentColor] || accentMap.blue;
        return `rgb(${r},${g},${b})`;
      }
      return '#ffffff';
    }

    function getBarValue(i: number, bars: number, data: Uint8Array | null): number {
      if (data) {
        const len = data.length;
        const ranges: Record<typeof cfg.focus, [number, number]> = {
          all:    [4, Math.floor(len * 0.7)],
          bass:   [2, Math.floor(len * 0.12)],
          mids:   [Math.floor(len * 0.1), Math.floor(len * 0.45)],
          treble: [Math.floor(len * 0.4), Math.floor(len * 0.85)],
        };
        const [lo, hi] = ranges[cfg.focus];
        const idx = Math.floor(lo + (i / bars) * (hi - lo));
        return Math.max(0.02, Math.min(1, (data[idx] / 255) * cfg.sensitivity));
      }
      fakePhase.current += 0.0002;
      return Math.max(0.02, Math.min(1, (
        0.3 + 0.25 * Math.sin(i * 0.18 + fakePhase.current * 1000) +
        0.15 * Math.sin(i * 0.45 + fakePhase.current * 1700)
      ) * cfg.sensitivity * 0.6));
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const data = getFrequencyData();
      const bars = cfg.barCount;

      if (cfg.style === 'bars') {
        const barW = W / bars;
        const gap = barW * 0.25;
        const drawW = barW - gap;
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const barH = v * H * 0.4;
          ctx.fillStyle = getColor(i, bars);
          ctx.fillRect(i * barW + gap / 2, H - barH, drawW, barH);
        }

      } else if (cfg.style === 'blocks') {
        // Retro segmented hollow-block equalizer
        const barW = W / bars;
        const gap = barW * 0.3;
        const drawW = barW - gap;
        const blockH = Math.max(4, H * 0.022);
        const blockGap = Math.max(2, blockH * 0.3);
        const blockTotal = blockH + blockGap;
        ctx.lineWidth = 1.5;

        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const numBlocks = Math.max(1, Math.floor(v * H * 0.42 / blockTotal));
          const x = i * barW + gap / 2;
          ctx.strokeStyle = getColor(i, bars);
          for (let b = 0; b < numBlocks; b++) {
            ctx.strokeRect(x + 1, H - (b + 1) * blockTotal + blockGap / 2, drawW - 2, blockH);
          }
        }

      } else if (cfg.style === 'wave') {
        const step = W / bars;
        // Filled wave shape
        ctx.beginPath();
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const x = i * step + step / 2;
          const y = H * 0.72 - v * H * 0.42;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = bars - 1; i >= 0; i--) {
          const v = getBarValue(i, bars, data);
          ctx.lineTo(i * step + step / 2, H * 0.72 + v * H * 0.15);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, getColor(Math.floor(i * bars / 8), bars));
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Glowing top edge
        ctx.beginPath();
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const x = i * step + step / 2;
          const y = H * 0.72 - v * H * 0.42;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = getColor(bars >> 1, bars);
        ctx.lineWidth = 2;
        ctx.stroke();

      } else if (cfg.style === 'radial') {
        const cx = W / 2, cy = H / 2;
        const minDim = Math.min(W, H);
        const innerR = minDim * 0.12;
        const maxBarLen = minDim * 0.28;
        const barThick = Math.max(1.5, (2 * Math.PI * innerR / bars) * 0.65);

        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const outerR = innerR + v * maxBarLen;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
          ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
          ctx.strokeStyle = getColor(i, bars);
          ctx.lineWidth = barThick;
          ctx.stroke();
        }
        // Subtle inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, innerR * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = getColor(0, bars);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;

      } else if (cfg.style === 'dots') {
        const barW = W / bars;
        const dotR = Math.max(2, barW * 0.28);
        const trailLen = H * 0.08;

        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const cx = i * barW + barW / 2;
          const cy = H - v * H * 0.42;
          const color = getColor(i, bars);

          // Downward trail (gradient fade)
          const grad = ctx.createLinearGradient(0, cy, 0, cy + trailLen);
          grad.addColorStop(0, color + '55');
          grad.addColorStop(1, color + '00');
          ctx.fillStyle = grad;
          ctx.fillRect(cx - dotR, cy, dotR * 2, trailLen);

          // Dot
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [visible, cfg.style, cfg.barCount, cfg.sensitivity, cfg.focus, cfg.color, accentColor, getFrequencyData]);

  if (!visible) return null;
  return <canvas ref={canvasRef} className="audio-visualizer-canvas" aria-hidden="true" />;
}
