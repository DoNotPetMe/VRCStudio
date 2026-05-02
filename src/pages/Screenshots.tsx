import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera, Upload, FolderOpen, X, Globe, Calendar, Printer,
  Download, Paintbrush, Sliders, Square, Circle, Type, Minus, ArrowRight,
  RotateCcw, RotateCw, FlipHorizontal, ZoomIn,
} from 'lucide-react';
import { format } from 'date-fns';
import EmptyState from '../components/common/EmptyState';
import { useAuthStore } from '../stores/authStore';

interface ScreenshotEntry {
  id: string;
  src: string;
  name: string;
  size: number;
  takenAt: number;
  worldName?: string;
  worldId?: string;
  notes?: string;
}

const SCREENSHOTS_KEY = 'vrcstudio_screenshots_meta';

function loadMeta(): Record<string, Partial<ScreenshotEntry>> {
  try {
    const raw = localStorage.getItem(SCREENSHOTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveMeta(meta: Record<string, Partial<ScreenshotEntry>>) {
  localStorage.setItem(SCREENSHOTS_KEY, JSON.stringify(meta));
}

// ─── Border Types ──────────────────────────────────────────────────────────────

type BorderType = 'none' | 'simple' | 'thick' | 'shadow' | 'neon' | 'grunge' | 'pixel'
  | 'hearts' | 'stars' | 'glitch' | 'fire' | 'rainbow' | 'metallic' | 'soft-glow'
  | 'film-strip' | 'neon-tube' | 'hologram' | 'retro-pixel' | 'watercolor' | 'chain-link'
  | 'circuit-board' | 'aurora' | 'glitch-rgb' | 'sakura' | 'geometric' | 'vr-scanline' | 'diamond';

function drawBorder(ctx: CanvasRenderingContext2D, w: number, h: number, border: BorderType) {
  if (border === 'none') return;
  ctx.save();

  if (border === 'simple') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  } else if (border === 'thick') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  } else if (border === 'shadow') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)'); grad.addColorStop(0.08, 'rgba(0,0,0,0)');
    grad.addColorStop(0.92, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, 'rgba(0,0,0,0.5)'); gradH.addColorStop(0.08, 'rgba(0,0,0,0)');
    gradH.addColorStop(0.92, 'rgba(0,0,0,0)'); gradH.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradH; ctx.fillRect(0, 0, w, h);
  } else if (border === 'neon') {
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 15;
    ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.shadowBlur = 0;
  } else if (border === 'grunge') {
    for (let i = 0; i < 300; i++) {
      const side = i % 4; const rng = Math.sin(42 + i * 127.1) * 0.5 + 0.5;
      const size = 3 + rng * 8;
      let x = 0, y = 0;
      if (side === 0) { x = rng * w; y = rng * 20; }
      else if (side === 1) { x = rng * w; y = h - rng * 20; }
      else if (side === 2) { x = rng * 20; y = rng * h; }
      else { x = w - rng * 20; y = rng * h; }
      ctx.fillStyle = `rgba(${60 + rng * 40},${40 + rng * 30},${30 + rng * 20},${0.4 + rng * 0.4})`;
      ctx.fillRect(x, y, size, size);
    }
  } else if (border === 'pixel') {
    const pxSize = 8;
    const colors = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ffffff'];
    for (let x = 0; x < w; x += pxSize) {
      const c = colors[(x / pxSize) % colors.length];
      ctx.fillStyle = c; ctx.fillRect(x, 0, pxSize, pxSize); ctx.fillRect(x, h - pxSize, pxSize, pxSize);
    }
    for (let y = pxSize; y < h - pxSize; y += pxSize) {
      const c = colors[(y / pxSize) % colors.length];
      ctx.fillStyle = c; ctx.fillRect(0, y, pxSize, pxSize); ctx.fillRect(w - pxSize, y, pxSize, pxSize);
    }
  } else if (border === 'hearts') {
    ctx.fillStyle = '#ff4488';
    const drawHeart = (cx: number, cy: number, s: number) => {
      ctx.beginPath(); ctx.moveTo(cx, cy + s / 4);
      ctx.bezierCurveTo(cx, cy, cx - s / 2, cy, cx - s / 2, cy + s / 4);
      ctx.bezierCurveTo(cx - s / 2, cy + s / 2, cx, cy + s * 0.7, cx, cy + s * 0.85);
      ctx.bezierCurveTo(cx, cy + s * 0.7, cx + s / 2, cy + s / 2, cx + s / 2, cy + s / 4);
      ctx.bezierCurveTo(cx + s / 2, cy, cx, cy, cx, cy + s / 4); ctx.fill();
    };
    for (let x = 20; x < w; x += 40) { drawHeart(x, 6, 18); drawHeart(x, h - 20, 18); }
    for (let y = 30; y < h - 30; y += 40) { drawHeart(8, y, 18); drawHeart(w - 14, y, 18); }
  } else if (border === 'stars') {
    ctx.fillStyle = '#ffd700';
    const drawStar = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath(); ctx.fill();
    };
    for (let x = 12; x < w; x += 35) { drawStar(x, 10, 8); drawStar(x, h - 10, 8); }
    for (let y = 25; y < h - 25; y += 35) { drawStar(10, y, 8); drawStar(w - 10, y, 8); }
  } else if (border === 'glitch') {
    const colors = ['rgba(255,0,0,0.6)','rgba(0,255,0,0.5)','rgba(0,0,255,0.5)','rgba(255,0,255,0.4)'];
    for (let i = 0; i < 20; i++) {
      const rng = Math.sin(i * 73.7) * 0.5 + 0.5; const barH = 3 + rng * 12; const y = rng * h;
      ctx.fillStyle = colors[i % colors.length];
      if (i % 2 === 0) ctx.fillRect(0, y, 15 + rng * 30, barH);
      else ctx.fillRect(w - 15 - rng * 30, y, 15 + rng * 30, barH);
    }
  } else if (border === 'fire') {
    const gradTop = ctx.createLinearGradient(0, 0, 0, 30);
    gradTop.addColorStop(0, 'rgba(255,80,0,0.7)'); gradTop.addColorStop(0.5, 'rgba(255,160,0,0.3)'); gradTop.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = gradTop; ctx.fillRect(0, 0, w, 30);
    const gradBot = ctx.createLinearGradient(0, h - 30, 0, h);
    gradBot.addColorStop(0, 'rgba(255,200,0,0)'); gradBot.addColorStop(0.5, 'rgba(255,160,0,0.3)'); gradBot.addColorStop(1, 'rgba(255,80,0,0.7)');
    ctx.fillStyle = gradBot; ctx.fillRect(0, h - 30, w, 30);
    const gradL = ctx.createLinearGradient(0, 0, 25, 0);
    gradL.addColorStop(0, 'rgba(255,80,0,0.6)'); gradL.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = gradL; ctx.fillRect(0, 0, 25, h);
    const gradR = ctx.createLinearGradient(w - 25, 0, w, 0);
    gradR.addColorStop(0, 'rgba(255,200,0,0)'); gradR.addColorStop(1, 'rgba(255,80,0,0.6)');
    ctx.fillStyle = gradR; ctx.fillRect(w - 25, 0, 25, h);
  } else if (border === 'rainbow') {
    const rainbowColors = ['#ff0000','#ff8800','#ffff00','#00ff00','#0088ff','#8800ff'];
    const bw = 6;
    rainbowColors.forEach((c, i) => {
      ctx.strokeStyle = c; ctx.lineWidth = bw;
      const o = i * bw + bw / 2;
      ctx.strokeRect(o, o, w - o * 2, h - o * 2);
    });
  } else if (border === 'metallic') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#e0e0e0'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#888888');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 10); ctx.fillRect(0, h - 10, w, 10);
    ctx.fillRect(0, 10, 10, h - 20); ctx.fillRect(w - 10, 10, 10, h - 20);
    ctx.strokeStyle = '#333333'; ctx.lineWidth = 1; ctx.strokeRect(4, 4, w - 8, h - 8);
  } else if (border === 'soft-glow') {
    for (let i = 40; i > 0; i -= 5) {
      ctx.globalAlpha = (40 - i) / 40 * 0.4;
      ctx.fillStyle = 'rgba(255,200,100,0.1)'; ctx.fillRect(i, i, w - i * 2, h - i * 2);
    }
    ctx.globalAlpha = 1;
  } else if (border === 'film-strip') {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#333333'; ctx.fillRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#000000';
    for (let y = 40; y < h - 40; y += 30) {
      ctx.fillRect(10, y, 12, 12); ctx.fillRect(w - 22, y, 12, 12);
    }
  } else if (border === 'neon-tube') {
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20; ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 25; ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 4; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.shadowBlur = 0;
  } else if (border === 'hologram') {
    const hgrad = ctx.createLinearGradient(0, 0, w, h);
    hgrad.addColorStop(0, 'rgba(0,255,200,0.6)'); hgrad.addColorStop(0.5, 'rgba(100,200,255,0.4)'); hgrad.addColorStop(1, 'rgba(200,100,255,0.6)');
    ctx.strokeStyle = hgrad; ctx.lineWidth = 3; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = 'rgba(0,255,200,0.06)';
    for (let y = 10; y < h; y += 8) ctx.fillRect(10, y, w - 20, 2);
  } else if (border === 'retro-pixel') {
    const colors = ['#ff1493','#00ffff','#ffff00','#00ff00','#ff6600','#9933ff'];
    const pxSize = 16; let ci = 0;
    for (let x = 0; x < w; x += pxSize) {
      ctx.fillStyle = colors[ci % colors.length]; ci++;
      ctx.fillRect(x, 0, pxSize, pxSize); ctx.fillRect(x, h - pxSize, pxSize, pxSize);
    }
    ci = 0;
    for (let y = pxSize; y < h - pxSize; y += pxSize) {
      ctx.fillStyle = colors[ci % colors.length]; ci++;
      ctx.fillRect(0, y, pxSize, pxSize); ctx.fillRect(w - pxSize, y, pxSize, pxSize);
    }
  } else if (border === 'watercolor') {
    ctx.fillStyle = 'rgba(100,150,200,0.3)';
    for (let x = 0; x < w; x += 60) { ctx.fillRect(x, 0, 40, 15); ctx.fillRect(x, h - 15, 40, 15); }
    for (let y = 15; y < h - 15; y += 60) { ctx.fillRect(0, y, 15, 40); ctx.fillRect(w - 15, y, 15, 40); }
  } else if (border === 'chain-link') {
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3;
    for (let x = 25; x < w; x += 45) {
      ctx.beginPath(); ctx.arc(x, 20, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, h - 20, 12, 0, Math.PI * 2); ctx.stroke();
    }
    for (let y = 50; y < h - 50; y += 45) {
      ctx.beginPath(); ctx.arc(20, y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w - 20, y, 12, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (border === 'circuit-board') {
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    const step = 40;
    for (let x = 20; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x, 5 + (x % 80 === 20 ? 20 : 10)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, h - 5); ctx.lineTo(x, h - 5 - (x % 80 === 20 ? 20 : 10)); ctx.stroke();
      if (x % 80 === 20) { ctx.beginPath(); ctx.arc(x, 5 + 20, 4, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (let y = 20; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(5, y); ctx.lineTo(5 + (y % 80 === 20 ? 20 : 10), y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - 5, y); ctx.lineTo(w - 5 - (y % 80 === 20 ? 20 : 10), y); ctx.stroke();
    }
  } else if (border === 'aurora') {
    const aColors = ['rgba(0,255,150,0.15)','rgba(100,100,255,0.15)','rgba(255,100,200,0.15)','rgba(100,200,255,0.12)'];
    for (let i = 0; i < aColors.length; i++) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, aColors[i]); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, aColors[(i + 2) % aColors.length]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = 'rgba(150,255,200,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
  } else if (border === 'glitch-rgb') {
    ctx.fillStyle = 'rgba(255,0,0,0.3)'; ctx.fillRect(0, 0, 20, h); ctx.fillRect(w - 20, 0, 20, h);
    ctx.fillStyle = 'rgba(0,255,0,0.2)'; ctx.fillRect(3, 0, 14, h); ctx.fillRect(w - 17, 0, 14, h);
    ctx.fillStyle = 'rgba(0,0,255,0.3)'; ctx.fillRect(0, 0, w, 20); ctx.fillRect(0, h - 20, w, 20);
    for (let i = 0; i < 8; i++) {
      const rng = Math.sin(i * 93.1) * 0.5 + 0.5; const barH = 4 + rng * 8;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rng * 0.15})`;
      ctx.fillRect(0, rng * h, w, barH);
    }
  } else if (border === 'sakura') {
    const drawPetal = (cx: number, cy: number, size: number, angle: number) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.fillStyle = 'rgba(255,182,193,0.7)';
      ctx.beginPath(); ctx.ellipse(0, -size / 2, size / 3, size / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    for (let x = 15; x < w; x += 50) {
      drawPetal(x, 10, 12, (x * 0.3)); drawPetal(x, h - 10, 12, (x * 0.5 + 1));
    }
    for (let y = 40; y < h - 40; y += 50) {
      drawPetal(10, y, 12, (y * 0.4)); drawPetal(w - 10, y, 12, (y * 0.6 + 2));
    }
    ctx.strokeStyle = 'rgba(255,105,135,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  } else if (border === 'geometric') {
    ctx.strokeStyle = 'rgba(200,180,255,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    const corners = [[15, 15],[w - 15, 15],[w - 15, h - 15],[15, h - 15]];
    corners.forEach(([cx, cy]) => {
      ctx.strokeStyle = 'rgba(180,160,255,0.8)';
      ctx.beginPath(); ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
    });
  } else if (border === 'vr-scanline') {
    ctx.fillStyle = 'rgba(0,200,255,0.06)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
    ctx.strokeStyle = 'rgba(0,220,255,0.5)'; ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(0,180,255,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);
  } else if (border === 'diamond') {
    ctx.strokeStyle = 'rgba(180,220,255,0.7)'; ctx.lineWidth = 2;
    const cx = w / 2; const cy = h / 2;
    const dx = Math.min(w, h) * 0.48;
    ctx.beginPath(); ctx.moveTo(cx, cy - dx); ctx.lineTo(cx + dx * 0.7, cy); ctx.lineTo(cx, cy + dx); ctx.lineTo(cx - dx * 0.7, cy); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(140,190,255,0.4)'; ctx.lineWidth = 1;
    const step = Math.min(w, h) * 0.06;
    for (let i = 1; i <= 5; i++) {
      const d2 = dx - step * i;
      if (d2 <= 0) break;
      ctx.beginPath(); ctx.moveTo(cx, cy - d2); ctx.lineTo(cx + d2 * 0.7, cy); ctx.lineTo(cx, cy + d2); ctx.lineTo(cx - d2 * 0.7, cy); ctx.closePath(); ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── Print Creator ────────────────────────────────────────────────────────────

interface PrintSettings {
  showUsername: boolean;
  showDate: boolean;
  showWorldName: boolean;
  showCustomText: boolean;
  customText: string;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  style: 'classic' | 'polaroid' | 'minimal' | 'strip';
  fontSize: number;
  border: BorderType;
  printSize: 'fit' | '2048' | '1024' | 'custom';
  customPrintSize?: { width: number; height: number };
}

const defaultPrintSettings: PrintSettings = {
  showUsername: true, showDate: true, showWorldName: true,
  showCustomText: false, customText: '', position: 'bottom-left',
  style: 'classic', fontSize: 24, border: 'none', printSize: 'fit',
};

function PhotoPrintCreator({ screenshot, onClose }: { screenshot: ScreenshotEntry; onClose: () => void }) {
  const { user } = useAuthStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [rendering, setRendering] = useState(false);

  const getTargetCanvasSize = useCallback((imgW: number, imgH: number) => {
    if (settings.printSize === '2048') { const s = Math.min(2048 / imgW, 2048 / imgH); return { w: 2048, h: 2048, scale: s }; }
    if (settings.printSize === '1024') { const s = Math.min(1024 / imgW, 1024 / imgH); return { w: 1024, h: 1024, scale: s }; }
    if (settings.printSize === 'custom' && settings.customPrintSize) {
      const s = Math.min(settings.customPrintSize.width / imgW, settings.customPrintSize.height / imgH);
      return { w: settings.customPrintSize.width, h: settings.customPrintSize.height, scale: s };
    }
    return { w: 0, h: 0, scale: 1 };
  }, [settings.printSize, settings.customPrintSize]);

  const drawTextOverlay = useCallback((ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    const lines: string[] = [];
    if (settings.showUsername && user?.displayName) lines.push(user.displayName);
    if (settings.showWorldName && screenshot.worldName) lines.push(`📍 ${screenshot.worldName}`);
    if (settings.showDate) lines.push(format(screenshot.takenAt, 'MMM d, yyyy  HH:mm'));
    if (settings.showCustomText && settings.customText) lines.push(settings.customText);
    if (!lines.length) return;

    ctx.font = `bold ${settings.fontSize}px 'Segoe UI', sans-serif`;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const blockH = lines.length * (settings.fontSize + 10) + 20;
    const pad = 16;

    let bx: number, by: number;
    if (settings.position === 'bottom-right') { bx = cw - maxW - pad * 2 - 20; by = ch - blockH - 20; }
    else if (settings.position === 'top-left') { bx = 20; by = 20; }
    else if (settings.position === 'top-right') { bx = cw - maxW - pad * 2 - 20; by = 20; }
    else { bx = 20; by = ch - blockH - 20; }

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + maxW + pad * 2 - r, by);
    ctx.quadraticCurveTo(bx + maxW + pad * 2, by, bx + maxW + pad * 2, by + r);
    ctx.lineTo(bx + maxW + pad * 2, by + blockH - r);
    ctx.quadraticCurveTo(bx + maxW + pad * 2, by + blockH, bx + maxW + pad * 2 - r, by + blockH);
    ctx.lineTo(bx + r, by + blockH); ctx.quadraticCurveTo(bx, by + blockH, bx, by + blockH - r);
    ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${settings.fontSize}px 'Segoe UI', sans-serif`;
    let ty = by + pad + settings.fontSize;
    lines.forEach((line, i) => {
      if (i > 0) { ctx.font = `${settings.fontSize - 4}px 'Segoe UI', sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; }
      ctx.fillText(line, bx + pad, ty);
      ty += settings.fontSize + 10;
    });
  }, [settings, screenshot, user]);

  const renderPrint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = screenshot.src;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
    const ctx = canvas.getContext('2d')!;
    const target = getTargetCanvasSize(img.width, img.height);
    const isFixed = settings.printSize !== 'fit';

    if (isFixed) {
      canvas.width = target.w; canvas.height = target.h;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sw = img.width * target.scale; const sh = img.height * target.scale;
      ctx.drawImage(img, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh);
      drawBorder(ctx, canvas.width, canvas.height, settings.border);
      drawTextOverlay(ctx, canvas.width, canvas.height);
    } else if (settings.style === 'polaroid') {
      const padding = 40; const bottomPad = 120;
      canvas.width = img.width + padding * 2; canvas.height = img.height + padding + bottomPad;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 5;
      ctx.drawImage(img, padding, padding, img.width, img.height);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#333333'; ctx.font = `${settings.fontSize}px 'Segoe UI', sans-serif`;
      let ty = img.height + padding + 40;
      const parts = [];
      if (settings.showUsername && user?.displayName) parts.push(user.displayName);
      if (settings.showWorldName && screenshot.worldName) parts.push(screenshot.worldName);
      if (settings.showDate) parts.push(format(screenshot.takenAt, 'MMM d, yyyy'));
      if (settings.showCustomText && settings.customText) parts.push(settings.customText);
      parts.forEach(p => { ctx.fillText(p, padding + 10, ty); ty += settings.fontSize + 8; });
    } else if (settings.style === 'strip') {
      const stripH = 60; const atTop = settings.position === 'top-left' || settings.position === 'top-right';
      canvas.width = img.width; canvas.height = img.height + stripH;
      if (atTop) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, img.width, stripH); ctx.drawImage(img, 0, stripH); }
      else { ctx.drawImage(img, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, img.height, img.width, stripH); }
      ctx.fillStyle = '#ffffff'; ctx.font = `${settings.fontSize - 4}px 'Segoe UI', sans-serif`;
      const parts = [];
      if (settings.showUsername && user?.displayName) parts.push(user.displayName);
      if (settings.showWorldName && screenshot.worldName) parts.push(screenshot.worldName);
      if (settings.showDate) parts.push(format(screenshot.takenAt, 'MMM d, yyyy HH:mm'));
      if (settings.showCustomText && settings.customText) parts.push(settings.customText);
      ctx.fillText(parts.join('  •  '), 20, atTop ? 38 : img.height + 38);
    } else if (settings.style === 'minimal') {
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const parts = [];
      if (settings.showDate) parts.push(format(screenshot.takenAt, 'yyyy.MM.dd'));
      if (settings.showUsername && user?.displayName) parts.push(user.displayName);
      if (settings.showCustomText && settings.customText) parts.push(settings.customText);
      const text = parts.join(' | ');
      ctx.font = `${settings.fontSize - 6}px monospace`;
      const m = ctx.measureText(text); const pad = 8;
      let tx: number, ty: number;
      if (settings.position === 'bottom-right') { tx = img.width - m.width - pad - 12; ty = img.height - pad - 8; }
      else if (settings.position === 'top-left') { tx = pad + 12; ty = settings.fontSize + pad; }
      else if (settings.position === 'top-right') { tx = img.width - m.width - pad - 12; ty = settings.fontSize + pad; }
      else { tx = pad + 12; ty = img.height - pad - 8; }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(tx - 6, ty - settings.fontSize + 2, m.width + 12, settings.fontSize + 8);
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, tx, ty);
    } else {
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawTextOverlay(ctx, canvas.width, canvas.height);
    }

    if (settings.style !== 'polaroid') drawBorder(ctx, canvas.width, canvas.height, settings.border);
    setPreviewUrl(canvas.toDataURL('image/png'));
    setRendering(false);
  }, [screenshot, settings, user, getTargetCanvasSize, drawTextOverlay]);

  // Re-render whenever settings change (reactive — no setTimeout hack)
  useEffect(() => { renderPrint(); }, [renderPrint]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `VRCStudio_Print_${screenshot.name}`;
    a.click();
  };

  const ALL_BORDERS: BorderType[] = [
    'none','simple','thick','shadow','neon','grunge','pixel','hearts','stars','glitch',
    'fire','rainbow','metallic','soft-glow','film-strip','neon-tube','hologram','retro-pixel',
    'watercolor','chain-link','circuit-board','aurora','glitch-rgb','sakura','geometric',
    'vr-scanline','diamond',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-6xl w-full mx-4 flex gap-4 max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <canvas ref={canvasRef} className="hidden" />
          {previewUrl
            ? <img src={previewUrl} alt="Print preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
            : <div className="text-surface-500 text-sm">{rendering ? 'Rendering preview…' : 'Loading…'}</div>
          }
        </div>

        <div className="w-72 flex-shrink-0 glass-panel p-4 space-y-4 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Printer size={14} /> Photo Print Creator</h3>
            <button onClick={onClose} className="btn-ghost p-1"><X size={14} /></button>
          </div>

          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Style</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['classic','polaroid','strip','minimal'] as const).map(style => (
                <button key={style} onClick={() => setSettings(s => ({ ...s, style }))}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${settings.style === style ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Position</label>
            <div className="grid grid-cols-2 gap-1.5">
              {([{k:'bottom-left',l:'↙ Bottom Left'},{k:'bottom-right',l:'↘ Bottom Right'},{k:'top-left',l:'↖ Top Left'},{k:'top-right',l:'↗ Top Right'}] as const).map(({k,l}) => (
                <button key={k} onClick={() => setSettings(s => ({ ...s, position: k as PrintSettings['position'] }))}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${settings.position === k ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {([{key:'showUsername',label:'Show Username'},{key:'showDate',label:'Show Date'},{key:'showWorldName',label:'Show World Name'},{key:'showCustomText',label:'Custom Text'}] as const).map(({key,label}) => (
              <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={settings[key]} onChange={e => setSettings(s => ({...s,[key]:e.target.checked}))}
                  className="rounded bg-surface-800 border-surface-600 text-accent-500 focus:ring-accent-500" />
                {label}
              </label>
            ))}
          </div>

          {settings.showCustomText && (
            <input type="text" value={settings.customText} onChange={e => setSettings(s => ({...s,customText:e.target.value}))}
              placeholder="Enter custom text…" className="input-field text-xs" />
          )}

          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Font Size: {settings.fontSize}px</label>
            <input type="range" min={14} max={48} value={settings.fontSize}
              onChange={e => setSettings(s => ({...s,fontSize:Number(e.target.value)}))} className="w-full accent-accent-500" />
          </div>

          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Print Size</label>
            <div className="grid grid-cols-2 gap-1">
              {([{k:'fit',l:'Fit to Image'},{k:'2048',l:'2048×2048'},{k:'1024',l:'1024×1024'},{k:'custom',l:'Custom'}] as const).map(({k,l}) => (
                <button key={k} onClick={() => setSettings(s => ({...s,printSize:k as PrintSettings['printSize']}))}
                  className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${settings.printSize === k ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                  {l}
                </button>
              ))}
            </div>
            {settings.printSize === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <input type="number" placeholder="Width" defaultValue={settings.customPrintSize?.width || 2048}
                  onChange={e => setSettings(s => ({...s,customPrintSize:{width:Number(e.target.value),height:s.customPrintSize?.height||2048}}))} className="input-field text-xs" />
                <input type="number" placeholder="Height" defaultValue={settings.customPrintSize?.height || 2048}
                  onChange={e => setSettings(s => ({...s,customPrintSize:{width:s.customPrintSize?.width||2048,height:Number(e.target.value)}}))} className="input-field text-xs" />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Border <span className="text-surface-600">({ALL_BORDERS.length} styles)</span></label>
            <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto">
              {ALL_BORDERS.map(border => (
                <button key={border} onClick={() => setSettings(s => ({...s,border}))}
                  title={border}
                  className={`px-1 py-1 rounded text-[9px] font-medium transition-colors truncate ${settings.border === border ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                  {border.replace(/-/g,' ').split(' ').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ').substring(0,9)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-surface-800">
            <button onClick={handleDownload} disabled={!previewUrl}
              className="btn-primary text-xs w-full flex items-center justify-center gap-1.5">
              <Download size={12} /> Download Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Presets ───────────────────────────────────────────────────────────

type FilterValues = { brightness: number; contrast: number; saturation: number; hueRotate: number; };

const FILTER_PRESETS: Record<string, { label: string } & FilterValues> = {
  none:       { label: 'None',         brightness: 100, contrast: 100, saturation: 100, hueRotate: 0 },
  grayscale:  { label: 'Grayscale',    brightness: 100, contrast: 110, saturation: 0,   hueRotate: 0 },
  sepia:      { label: 'Sepia',        brightness: 100, contrast: 110, saturation: 30,  hueRotate: -10 },
  cool:       { label: 'Cool',         brightness: 95,  contrast: 105, saturation: 110, hueRotate: -20 },
  warm:       { label: 'Warm',         brightness: 110, contrast: 95,  saturation: 120, hueRotate: 15 },
  vintage:    { label: 'Vintage',      brightness: 105, contrast: 90,  saturation: 80,  hueRotate: -5 },
  noir:       { label: 'Noir',         brightness: 80,  contrast: 130, saturation: 0,   hueRotate: 0 },
  neon:       { label: 'Neon',         brightness: 110, contrast: 120, saturation: 150, hueRotate: 0 },
  vibrant:    { label: 'Vibrant',      brightness: 100, contrast: 115, saturation: 140, hueRotate: 0 },
  soft:       { label: 'Soft',         brightness: 110, contrast: 85,  saturation: 90,  hueRotate: 0 },
  dreamy:     { label: 'Dreamy',       brightness: 115, contrast: 85,  saturation: 110, hueRotate: 10 },
  dramatic:   { label: 'Dramatic',     brightness: 90,  contrast: 140, saturation: 120, hueRotate: 0 },
  faded:      { label: 'Faded',        brightness: 110, contrast: 90,  saturation: 70,  hueRotate: 0 },
  cyberpunk:  { label: 'Cyberpunk',    brightness: 105, contrast: 125, saturation: 150, hueRotate: -30 },
  retro:      { label: 'Retro',        brightness: 105, contrast: 95,  saturation: 80,  hueRotate: 10 },
  film:       { label: 'Film',         brightness: 95,  contrast: 110, saturation: 85,  hueRotate: -5 },
  anime:      { label: 'Anime',        brightness: 100, contrast: 130, saturation: 70,  hueRotate: -5 },
  vaporwave:  { label: 'Vaporwave',    brightness: 100, contrast: 120, saturation: 150, hueRotate: -30 },
  cinematic:  { label: 'Cinematic',    brightness: 88,  contrast: 120, saturation: 75,  hueRotate: -3 },
  horror:     { label: 'Horror',       brightness: 80,  contrast: 150, saturation: 10,  hueRotate: 0 },
  forest:     { label: 'Forest',       brightness: 100, contrast: 108, saturation: 130, hueRotate: 30 },
  ocean:      { label: 'Ocean',        brightness: 95,  contrast: 110, saturation: 120, hueRotate: -40 },
  goldenHour: { label: 'Golden Hour',  brightness: 115, contrast: 105, saturation: 140, hueRotate: 20 },
  fade:       { label: 'Fade',         brightness: 118, contrast: 78,  saturation: 55,  hueRotate: 0 },
  duotone:    { label: 'Duotone',      brightness: 100, contrast: 150, saturation: 30,  hueRotate: 270 },
};

// ─── Main Screenshots Page ────────────────────────────────────────────────────

export default function ScreenshotsPage() {
  const { user } = useAuthStore();
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [selected, setSelected] = useState<ScreenshotEntry | null>(null);
  const [printTarget, setPrintTarget] = useState<ScreenshotEntry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingNote, setEditingNote] = useState('');
  const [editingWorld, setEditingWorld] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [meta, setMeta] = useState(loadMeta());
  const [isPhotoEditing, setIsPhotoEditing] = useState(false);

  // Photo editor state
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hueRotate, setHueRotate] = useState(0);
  const [blur, setBlur] = useState(0);
  const [grayscaleAmt, setGrayscaleAmt] = useState(0);
  const [sepiaAmt, setSepiaAmt] = useState(0);
  const [invertAmt, setInvertAmt] = useState(0);
  const [opacityAmt, setOpacityAmt] = useState(100);
  const [vibranceAmt, setVibranceAmt] = useState(0);
  const [shadowsAmt, setShadowsAmt] = useState(0);
  const [highlightsAmt, setHighlightsAmt] = useState(0);
  const [filterPreset, setFilterPreset] = useState('none');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [jpegQuality, setJpegQuality] = useState(92);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const applyPreset = (key: string) => {
    setFilterPreset(key);
    if (key === 'none') {
      setBrightness(100); setContrast(100); setSaturation(100); setHueRotate(0);
    } else {
      const p = FILTER_PRESETS[key];
      setBrightness(p.brightness); setContrast(p.contrast);
      setSaturation(p.saturation); setHueRotate(p.hueRotate);
    }
  };

  const resetFilters = () => {
    applyPreset('none');
    setBlur(0); setGrayscaleAmt(0); setSepiaAmt(0); setInvertAmt(0); setOpacityAmt(100);
    setVibranceAmt(0); setShadowsAmt(0); setHighlightsAmt(0);
  };

  const handleExportFiltered = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    const filterStr = [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
      `hue-rotate(${hueRotate}deg)`,
      blur > 0 ? `blur(${blur}px)` : '',
      grayscaleAmt > 0 ? `grayscale(${grayscaleAmt}%)` : '',
      sepiaAmt > 0 ? `sepia(${sepiaAmt}%)` : '',
      invertAmt > 0 ? `invert(${invertAmt}%)` : '',
    ].filter(Boolean).join(' ');
    ctx.filter = filterStr;
    ctx.globalAlpha = opacityAmt / 100;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none'; ctx.globalAlpha = 1;

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    const url = canvas.toDataURL(mimeMap[exportFormat], exportFormat === 'jpeg' ? jpegQuality / 100 : undefined);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VRCStudio_edited_${selected?.name || 'photo'}.${exportFormat}`;
    a.click();
  }, [brightness, contrast, saturation, hueRotate, blur, grayscaleAmt, sepiaAmt, invertAmt, opacityAmt, exportFormat, jpegQuality, selected]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const newEntries: ScreenshotEntry[] = arr.map(file => {
      const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const m = meta[file.name] || {};
      return { id, src: URL.createObjectURL(file), name: file.name, size: file.size,
        takenAt: m.takenAt || file.lastModified || Date.now(),
        worldName: m.worldName, worldId: m.worldId, notes: m.notes };
    });
    setScreenshots(prev => {
      const existing = new Set(prev.map(s => s.name));
      return [...newEntries.filter(e => !existing.has(e.name)), ...prev].sort((a, b) => b.takenAt - a.takenAt);
    });
  }, [meta]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const removeScreenshot = (id: string) => { setScreenshots(prev => prev.filter(s => s.id !== id)); if (selected?.id === id) setSelected(null); };

  const saveMetaEntry = (ss: ScreenshotEntry) => {
    const updated = { ...ss, worldName: editingWorld || ss.worldName, notes: editingNote };
    setScreenshots(prev => prev.map(s => s.id === ss.id ? updated : s));
    if (selected?.id === ss.id) setSelected(updated);
    const newMeta = { ...meta, [ss.name]: { worldName: updated.worldName, worldId: updated.worldId, notes: updated.notes } };
    saveMeta(newMeta); setMeta(newMeta); setIsEditing(false);
  };

  const openEdit = (ss: ScreenshotEntry) => { setEditingNote(ss.notes || ''); setEditingWorld(ss.worldName || ''); setIsEditing(true); };

  const byDate = screenshots.reduce<Record<string, ScreenshotEntry[]>>((acc, s) => {
    const d = format(s.takenAt, 'yyyy-MM-dd');
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {});

  const filterStr = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
    `hue-rotate(${hueRotate}deg)`,
    blur > 0 ? `blur(${blur}px)` : '',
    grayscaleAmt > 0 ? `grayscale(${grayscaleAmt}%)` : '',
    sepiaAmt > 0 ? `sepia(${sepiaAmt}%)` : '',
    invertAmt > 0 ? `invert(${invertAmt}%)` : '',
  ].filter(Boolean).join(' ');

  const changeFilter = (setter: (v: number) => void) => (v: number) => { setter(v); setFilterPreset('none'); };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Screenshots</h1>
          <p className="text-sm text-surface-400 mt-0.5">Browse, annotate, and create photo prints from your VRChat screenshots</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm flex items-center gap-1.5">
            <FolderOpen size={14} /> Load Screenshots
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${isDragging ? 'border-accent-500 bg-accent-500/5' : 'border-surface-700 hover:border-surface-600'}`}>
        <Upload size={24} className="mx-auto mb-2 text-surface-500" />
        <p className="text-sm text-surface-400">Drag & drop screenshots here, or{' '}
          <button onClick={() => fileRef.current?.click()} className="text-accent-400 hover:underline">browse files</button>
        </p>
        <p className="text-xs text-surface-600 mt-1">Default: <span className="font-mono">%Pictures%\VRChat</span></p>
      </div>

      {screenshots.length === 0 ? (
        <EmptyState icon={Camera} title="No screenshots loaded" description="Load your VRChat screenshots folder to view them here" />
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, shots]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={14} className="text-surface-500" />
                <h3 className="text-sm font-semibold text-surface-400">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                  <span className="ml-2 text-surface-600 font-normal">{shots.length} photo{shots.length !== 1 ? 's' : ''}</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {shots.map(ss => (
                  <div key={ss.id} className="group relative">
                    <button onClick={() => setSelected(ss)} className="w-full aspect-video rounded-lg overflow-hidden bg-surface-800 block">
                      <img src={ss.src} alt={ss.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
                    </button>
                    {ss.worldName && (
                      <div className="absolute bottom-1 left-1 right-1 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] truncate text-white">{ss.worldName}</div>
                    )}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setPrintTarget(ss); }}
                        className="w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-accent-600/80 transition-colors" title="Create Photo Print">
                        <Printer size={10} className="text-white" />
                      </button>
                      <button onClick={() => removeScreenshot(ss.id)}
                        className="w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-600/80 transition-colors">
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && !printTarget && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => { setSelected(null); setIsEditing(false); setIsPhotoEditing(false); }}>
          <div className="relative max-w-5xl w-full mx-4 flex gap-4 items-start" onClick={e => e.stopPropagation()}>
            <div className="flex-1 min-w-0">
              <img ref={imgRef} src={selected.src} alt=""
                className="w-full rounded-xl shadow-2xl"
                crossOrigin="anonymous"
                style={{ filter: filterStr, opacity: opacityAmt / 100, transition: 'filter 0.1s, opacity 0.1s' }} />
            </div>

            <div className="w-72 flex-shrink-0 glass-panel p-4 space-y-3 overflow-y-auto max-h-[90vh]">
              <h3 className="text-sm font-semibold truncate">{selected.name}</h3>
              <div className="text-xs text-surface-400 space-y-1">
                <div className="flex items-center gap-1.5"><Calendar size={12} />{format(selected.takenAt, 'MMM d, yyyy HH:mm')}</div>
                <div>{(selected.size / 1024).toFixed(0)} KB</div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input type="text" value={editingWorld} onChange={e => setEditingWorld(e.target.value)} placeholder="World name…" className="input-field text-xs" autoFocus />
                  <textarea value={editingNote} onChange={e => setEditingNote(e.target.value)} placeholder="Notes…" className="input-field text-xs h-20 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                    <button onClick={() => saveMetaEntry(selected)} className="btn-primary text-xs flex-1">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {selected.worldName && (
                    <div className="glass-panel p-2">
                      <div className="text-[10px] text-surface-500 mb-0.5 flex items-center gap-1"><Globe size={10} /> World</div>
                      <div className="text-xs">{selected.worldName}</div>
                    </div>
                  )}
                  {selected.notes && <div className="glass-panel p-2"><div className="text-[10px] text-surface-500 mb-0.5">Notes</div><div className="text-xs text-surface-300">{selected.notes}</div></div>}
                  <button onClick={() => openEdit(selected)} className="btn-secondary text-xs w-full">{selected.worldName || selected.notes ? 'Edit Info' : 'Add World / Notes'}</button>
                </>
              )}

              {/* Photo tools tab bar */}
              <div className="border-t border-surface-700/40 pt-3">
                <div className="text-[10px] text-surface-500 font-semibold uppercase tracking-wide mb-2">Photo Tools</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setIsPhotoEditing(!isPhotoEditing)}
                    className={`text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${isPhotoEditing ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40' : 'btn-secondary'}`}
                  >
                    <Paintbrush size={12} /> {isPhotoEditing ? 'Editing…' : 'Photo Editor'}
                  </button>
                  <button
                    onClick={() => { setIsPhotoEditing(false); setPrintTarget(selected); }}
                    className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <Printer size={12} /> Create Print
                  </button>
                </div>
              </div>

              {isPhotoEditing && (
                <div className="space-y-3 bg-surface-800/30 p-3 rounded-lg">
                  {/* Preset grid */}
                  <div>
                    <label className="text-[10px] text-surface-500 font-semibold block mb-1.5">Filter Presets</label>
                    <div className="grid grid-cols-4 gap-1 max-h-36 overflow-y-auto">
                      {Object.entries(FILTER_PRESETS).map(([key, { label }]) => (
                        <button key={key} onClick={() => applyPreset(key)}
                          className={`px-1.5 py-1 text-[9px] rounded font-medium transition-all truncate ${filterPreset === key ? 'bg-accent-600/80 text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-surface-700/50 pt-2 space-y-1.5">
                    <label className="text-[10px] text-surface-500 font-semibold block">Adjustments</label>
                    {[
                      { label: 'Brightness', value: brightness, min: 0, max: 200, setter: setBrightness },
                      { label: 'Contrast',   value: contrast,   min: 0, max: 200, setter: setContrast },
                      { label: 'Saturation', value: saturation, min: 0, max: 200, setter: setSaturation },
                      { label: 'Hue Shift',  value: hueRotate,  min: -180, max: 180, setter: setHueRotate },
                      { label: 'Blur',       value: blur,       min: 0, max: 10, setter: setBlur },
                      { label: 'Grayscale',  value: grayscaleAmt, min: 0, max: 100, setter: setGrayscaleAmt },
                      { label: 'Sepia',      value: sepiaAmt,   min: 0, max: 100, setter: setSepiaAmt },
                    ].map(({ label, value, min, max, setter }) => (
                      <div key={label}>
                        <label className="text-[10px] text-surface-500 block mb-0.5">{label}: {value}{label === 'Hue Shift' ? '°' : label === 'Blur' ? 'px' : '%'}</label>
                        <input type="range" min={min} max={max} value={value} onChange={e => changeFilter(setter)(Number(e.target.value))} className="w-full accent-accent-500" />
                      </div>
                    ))}

                    {/* Advanced toggle */}
                    <button onClick={() => setAdvancedOpen(v => !v)} className="text-[10px] text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1 mt-1">
                      <Sliders size={10} /> {advancedOpen ? 'Hide' : 'Show'} Advanced
                    </button>

                    {advancedOpen && (
                      <div className="space-y-1.5 pt-1 border-t border-surface-700/40">
                        {[
                          { label: 'Invert',      value: invertAmt,    min: 0,    max: 100, setter: setInvertAmt },
                          { label: 'Opacity',     value: opacityAmt,   min: 0,    max: 100, setter: setOpacityAmt },
                          { label: 'Vibrance',    value: vibranceAmt,  min: -100, max: 100, setter: setVibranceAmt },
                          { label: 'Shadows',     value: shadowsAmt,   min: -100, max: 100, setter: setShadowsAmt },
                          { label: 'Highlights',  value: highlightsAmt,min: -100, max: 100, setter: setHighlightsAmt },
                        ].map(({ label, value, min, max, setter }) => (
                          <div key={label}>
                            <label className="text-[10px] text-surface-500 block mb-0.5">{label}: {value}%</label>
                            <input type="range" min={min} max={max} value={value} onChange={e => changeFilter(setter)(Number(e.target.value))} className="w-full accent-accent-500" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Export format */}
                  <div className="border-t border-surface-700/50 pt-2 space-y-2">
                    <label className="text-[10px] text-surface-500 font-semibold block">Export Format</label>
                    <div className="flex gap-1">
                      {(['png','jpeg','webp'] as const).map(fmt => (
                        <button key={fmt} onClick={() => setExportFormat(fmt)}
                          className={`flex-1 py-1 rounded text-[10px] font-medium uppercase transition-colors ${exportFormat === fmt ? 'bg-accent-600 text-white' : 'bg-surface-700 text-surface-400 hover:bg-surface-600'}`}>
                          {fmt}
                        </button>
                      ))}
                    </div>
                    {exportFormat === 'jpeg' && (
                      <div>
                        <label className="text-[10px] text-surface-500 block mb-0.5">Quality: {jpegQuality}%</label>
                        <input type="range" min={60} max={100} value={jpegQuality} onChange={e => setJpegQuality(Number(e.target.value))} className="w-full accent-accent-500" />
                      </div>
                    )}
                    <button onClick={handleExportFiltered}
                      className="btn-secondary text-[10px] w-full flex items-center justify-center gap-1.5">
                      <Download size={11} /> Save Filtered Image
                    </button>
                    <button onClick={resetFilters} className="btn-ghost text-[10px] w-full flex items-center justify-center gap-1">
                      <RotateCcw size={10} /> Reset All Filters
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => { setSelected(null); setIsEditing(false); setIsPhotoEditing(false); }} className="btn-ghost text-xs w-full">Close</button>
            </div>
          </div>
        </div>
      )}

      {printTarget && <PhotoPrintCreator screenshot={printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}
