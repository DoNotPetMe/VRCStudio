import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useSystemAudio } from '../hooks/useAudioVisualizer';

export default function AudioVisualizer() {
  const cfg = useThemeStore(s => s.theme.visualizer);
  const accentColor = useThemeStore(s => s.theme.accentColor);
  const visible = cfg.enabled;

  const { getFrequencyData } = useSystemAudio(visible);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const fakePhase = useRef(0);

  // Per-bar peak hold buffer (for dots style)
  const peaksRef = useRef<Float32Array | null>(null);

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

    function getRGB(i: number, total: number): [number, number, number] {
      if (cfg.color === 'rainbow') {
        const hue = ((i / total) * 360 + (Date.now() * 0.05) % 360) % 360;
        return hslToRgb(hue, 0.8, 0.65);
      }
      if (cfg.color === 'accent') {
        return accentMap[accentColor] || accentMap.blue;
      }
      return [255, 255, 255];
    }

    function rgbCss([r, g, b]: [number, number, number], a = 1): string {
      return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
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

    if (!peaksRef.current || peaksRef.current.length !== cfg.barCount) {
      peaksRef.current = new Float32Array(cfg.barCount);
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const data = getFrequencyData();
      const bars = cfg.barCount;
      const peaks = peaksRef.current!;

      // Decay peaks each frame
      for (let i = 0; i < peaks.length; i++) peaks[i] = Math.max(0, peaks[i] - 0.008);

      function getColor(i: number, total: number): string {
        return rgbCss(getRGB(i, total));
      }

      if (cfg.style === 'bars') {
        const barW = W / bars;
        const gap = barW * 0.25;
        const drawW = barW - gap;
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const barH = v * H * 0.4;
          ctx.fillStyle = rgbCss(getRGB(i, bars));
          ctx.fillRect(i * barW + gap / 2, H - barH, drawW, barH);
        }

      } else if (cfg.style === 'blocks') {
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
        const wGrad = ctx.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 8; i++) wGrad.addColorStop(i / 8, getColor(Math.floor(i * bars / 8), bars));
        ctx.fillStyle = wGrad;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
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
        ctx.beginPath();
        ctx.arc(cx, cy, innerR * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = getColor(0, bars);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;


      } else if (cfg.style === 'dots') {
        // Connected oscilloscope-style dots with peak ripples + glow trails
        const barW = W / bars;
        const dotR = Math.max(2.5, barW * 0.32);
        const baseY = H * 0.62;
        const amplitude = H * 0.32;

        // Compute positions
        const points: Array<{ x: number; y: number; v: number; rgb: [number, number, number] }> = [];
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          if (v > peaks[i]) peaks[i] = v;
          points.push({
            x: i * barW + barW / 2,
            y: baseY - v * amplitude,
            v,
            rgb: getRGB(i, bars),
          });
        }

        // Glow line connecting all points
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i], p2 = points[i + 1];
          const cx = (p1.x + p2.x) / 2;
          ctx.quadraticCurveTo(p1.x, p1.y, cx, (p1.y + p2.y) / 2);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        const lineRGB = getRGB(bars >> 1, bars);
        ctx.shadowColor = rgbCss(lineRGB, 0.8);
        ctx.shadowBlur = 14;
        ctx.strokeStyle = rgbCss(lineRGB, 0.6);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Vertical drop trails per dot (gradient using rgba — works for all colour modes)
        for (const p of points) {
          const grad = ctx.createLinearGradient(0, p.y, 0, baseY + 30);
          grad.addColorStop(0, rgbCss(p.rgb, 0.35));
          grad.addColorStop(1, rgbCss(p.rgb, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(p.x - dotR, p.y, dotR * 2, baseY + 30 - p.y);
        }

        // Dots themselves with halos
        for (const p of points) {
          // Outer halo
          const haloGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dotR * 3);
          haloGrad.addColorStop(0, rgbCss(p.rgb, 0.8));
          haloGrad.addColorStop(0.4, rgbCss(p.rgb, 0.25));
          haloGrad.addColorStop(1, rgbCss(p.rgb, 0));
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotR * 3, 0, Math.PI * 2);
          ctx.fill();

          // Solid dot
          ctx.fillStyle = rgbCss(p.rgb);
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Peak-hold rings (faded ripples)
        for (let i = 0; i < bars; i++) {
          if (peaks[i] < 0.15) continue;
          const py = baseY - peaks[i] * amplitude;
          const rippleR = (1 - peaks[i] / 1) * dotR * 4 + dotR;
          ctx.strokeStyle = rgbCss(points[i].rgb, peaks[i] * 0.3);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(points[i].x, py, rippleR, 0, Math.PI * 2);
          ctx.stroke();
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

// HSL → RGB helper. h: 0-360, s/l: 0-1
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
