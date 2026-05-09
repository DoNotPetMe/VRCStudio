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

  // Per-bar peak hold buffer (for blocks/dots styles)
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
        // Retro segmented LCD equalizer with peak-hold caps and subtle glow
        const barW = W / bars;
        const gap = barW * 0.32;
        const drawW = barW - gap;
        const blockH = Math.max(4, H * 0.022);
        const blockGap = Math.max(2, blockH * 0.32);
        const blockTotal = blockH + blockGap;
        const maxBlocks = Math.floor(H * 0.6 / blockTotal);

        ctx.lineWidth = 1.5;

        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          if (v > peaks[i]) peaks[i] = v;
          const numBlocks = Math.max(1, Math.floor(v * H * 0.42 / blockTotal));
          const peakBlock = Math.max(1, Math.floor(peaks[i] * H * 0.42 / blockTotal));
          const x = i * barW + gap / 2;

          for (let b = 0; b < numBlocks; b++) {
            // Colour shift: cool at the bottom, hot at the top
            const heat = b / Math.max(1, maxBlocks - 1);
            let rgb = getRGB(i, bars);
            if (cfg.color !== 'rainbow') {
              // Blend with hot color near peaks for the LCD vibe
              const hot: [number, number, number] = [255, 80, 60];
              rgb = [
                Math.round(rgb[0] * (1 - heat) + hot[0] * heat),
                Math.round(rgb[1] * (1 - heat) + hot[1] * heat * 0.4),
                Math.round(rgb[2] * (1 - heat) + hot[2] * heat * 0.3),
              ];
            }
            const y = H - (b + 1) * blockTotal + blockGap / 2;
            ctx.strokeStyle = rgbCss(rgb, 0.95);
            ctx.shadowColor = rgbCss(rgb, 0.55);
            ctx.shadowBlur = b > numBlocks - 4 ? 10 : 3;
            ctx.strokeRect(x + 1, y, drawW - 2, blockH);
          }
          // Peak-hold cap
          if (peakBlock > numBlocks) {
            const py = H - peakBlock * blockTotal + blockGap / 2;
            ctx.fillStyle = rgbCss([255, 255, 255], 0.85);
            ctx.shadowColor = 'rgba(255,255,255,0.7)';
            ctx.shadowBlur = 8;
            ctx.fillRect(x + 1, py, drawW - 2, Math.max(2, blockH * 0.5));
          }
        }
        ctx.shadowBlur = 0;

      } else if (cfg.style === 'wave') {
        // Layered oscilloscope-style waves with mirrored fill + glow
        const baseY = H * 0.55;
        const amplitude = H * 0.22;
        const layers: Array<{ scale: number; alpha: number; yOffset: number }> = [
          { scale: 1.0, alpha: 0.55, yOffset: 0 },
          { scale: 0.7, alpha: 0.35, yOffset: -H * 0.06 },
          { scale: 0.45, alpha: 0.25, yOffset: H * 0.05 },
        ];

        // Smooth bezier curve through points helper
        const drawCurve = (yFn: (i: number) => number) => {
          ctx.beginPath();
          const xStep = W / (bars - 1);
          ctx.moveTo(0, yFn(0));
          for (let i = 0; i < bars - 1; i++) {
            const x1 = i * xStep, x2 = (i + 1) * xStep;
            const y1 = yFn(i), y2 = yFn(i + 1);
            const cx = (x1 + x2) / 2;
            ctx.quadraticCurveTo(x1, y1, cx, (y1 + y2) / 2);
          }
          ctx.lineTo(W, yFn(bars - 1));
        };

        // Glow gradient fill base
        for (const layer of layers) {
          const yFn = (i: number) => baseY + layer.yOffset - getBarValue(i, bars, data) * amplitude * layer.scale;
          drawCurve(yFn);
          ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();

          const grad = ctx.createLinearGradient(0, baseY - amplitude, 0, H);
          for (let s = 0; s <= 6; s++) {
            const i = Math.floor(s * bars / 6);
            const rgb = getRGB(i, bars);
            grad.addColorStop(s / 6, rgbCss(rgb, layer.alpha * (1 - s * 0.12)));
          }
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Mirrored bottom (subtle reflection)
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.scale(1, -1);
        ctx.translate(0, -H * 1.95);
        const yFnMirror = (i: number) => baseY - getBarValue(i, bars, data) * amplitude;
        drawCurve(yFnMirror);
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        const mirrorGrad = ctx.createLinearGradient(0, baseY - amplitude, 0, H);
        mirrorGrad.addColorStop(0, rgbCss(getRGB(bars >> 1, bars), 0.6));
        mirrorGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mirrorGrad;
        ctx.fill();
        ctx.restore();

        // Glowing top edge stroke
        const topYFn = (i: number) => baseY - getBarValue(i, bars, data) * amplitude;
        drawCurve(topYFn);
        ctx.shadowColor = rgbCss(getRGB(bars >> 1, bars), 0.9);
        ctx.shadowBlur = 18;
        ctx.strokeStyle = rgbCss(getRGB(bars >> 1, bars));
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

      } else if (cfg.style === 'radial') {
        // Concentric reactive rings + outer + inner + pulsing core
        const cx = W / 2, cy = H / 2;
        const minDim = Math.min(W, H);
        const innerR = minDim * 0.13;
        const maxBarLen = minDim * 0.22;
        const barThick = Math.max(2, (2 * Math.PI * innerR / bars) * 0.7);

        // Outer bars (radiating outward)
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const outerR = innerR + v * maxBarLen;
          const rgb = getRGB(i, bars);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
          ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
          ctx.strokeStyle = rgbCss(rgb, 0.9);
          ctx.shadowColor = rgbCss(rgb, 0.65);
          ctx.shadowBlur = 12;
          ctx.lineWidth = barThick;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Inner bars (radiating inward, half length, half opacity)
        for (let i = 0; i < bars; i++) {
          const v = getBarValue(i, bars, data);
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const inner2 = innerR - v * maxBarLen * 0.45;
          if (inner2 < innerR * 0.1) continue;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * (innerR - 2), cy + Math.sin(angle) * (innerR - 2));
          ctx.lineTo(cx + Math.cos(angle) * inner2, cy + Math.sin(angle) * inner2);
          ctx.strokeStyle = rgbCss(getRGB(i, bars), 0.45);
          ctx.lineWidth = barThick * 0.6;
          ctx.stroke();
        }

        // Pulsing core circle — driven by overall energy
        let energy = 0;
        for (let i = 0; i < bars; i++) energy += getBarValue(i, bars, data);
        energy /= bars;
        const coreR = innerR * (0.35 + energy * 0.5);
        const coreRGB = getRGB(0, bars);
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, rgbCss(coreRGB, 0.7));
        coreGrad.addColorStop(0.6, rgbCss(coreRGB, 0.25));
        coreGrad.addColorStop(1, rgbCss(coreRGB, 0));
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        // Inner ring outline
        ctx.beginPath();
        ctx.arc(cx, cy, innerR * 0.92, 0, Math.PI * 2);
        ctx.strokeStyle = rgbCss(coreRGB, 0.4);
        ctx.lineWidth = 1.5;
        ctx.stroke();

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
