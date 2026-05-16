// VRChat custom emoji maker.
//
// Two halves:
//   - Left:  source images (one or many) + animation settings.
//   - Right: live preview of how the emoji will look in-game + the
//            generated sprite sheet, which the user can either download
//            or upload directly to VRChat.
//
// Sprite-sheet generation is 100% offline (canvas only). Upload uses the
// best-known VRChat /file + /emoji endpoints — if it fails, the user
// still has the generated PNG to upload manually via vrchat.com.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Smile, Upload, Image as ImageIcon, Trash2, Download, Play, Pause,
  Loader2, Check, AlertCircle, RotateCw, X, GripVertical,
} from 'lucide-react';
import {
  createEmoji,
  type EmojiAnimationStyle,
  type EmojiLoopStyle,
  type EmojiFrameGrid,
} from '../api/emoji';

// Valid grid sizes VRChat accepts for animated emojis: 1, 4, 9, 16, 25, 36, 64.
const FRAME_GRIDS: EmojiFrameGrid[] = [1, 4, 9, 16, 25, 36, 64];
const SHEET_SIZE = 1024; // VRChat displays emojis from a 1024×1024 source.

interface SourceImage {
  id: string;
  file: File;
  url: string;
  el: HTMLImageElement;
}

export default function EmojiMaker() {
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [animationStyle, setAnimationStyle] = useState<EmojiAnimationStyle>('static');
  const [frameGrid, setFrameGrid] = useState<EmojiFrameGrid>(4);
  const [fps, setFps] = useState(12);
  const [loopStyle, setLoopStyle] = useState<EmojiLoopStyle>('loop');
  const [emojiName, setEmojiName] = useState('');

  const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedEmojiId, setUploadedEmojiId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Auto-pick a sensible frame grid + animation style on import ──
  useEffect(() => {
    if (sources.length === 0) return;
    if (sources.length === 1) {
      setAnimationStyle('static');
      setFrameGrid(1);
    } else {
      setAnimationStyle('animated');
      // Pick the smallest grid that fits all frames.
      const fit = FRAME_GRIDS.find(g => g >= sources.length) ?? 64;
      setFrameGrid(fit);
    }
  }, [sources.length]);

  // ── Generate sprite sheet whenever inputs change ──
  useEffect(() => {
    if (sources.length === 0) {
      setSheetBlob(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const blob = await buildSpriteSheet(sources.map(s => s.el), animationStyle === 'static' ? 1 : frameGrid);
      if (cancelled) return;
      setSheetBlob(blob);
    })();
    return () => { cancelled = true; };
  }, [sources, frameGrid, animationStyle]);

  useEffect(() => {
    if (!sheetBlob) {
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl(null);
      return;
    }
    const url = URL.createObjectURL(sheetBlob);
    setSheetUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sheetBlob]);

  // ── Animated preview: rAF loop reading from the source images ──
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let direction = 1;
    let last = performance.now();
    const frameDuration = 1000 / fps;
    const effectiveFrames = animationStyle === 'static' ? 1 : Math.min(sources.length, frameGrid);

    const tick = (now: number) => {
      if (!playing && effectiveFrames > 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const elapsed = now - last;
      if (elapsed >= frameDuration) {
        last = now;
        if (effectiveFrames > 1) {
          if (loopStyle === 'pingpong') {
            frame += direction;
            if (frame >= effectiveFrames - 1) { frame = effectiveFrames - 1; direction = -1; }
            if (frame <= 0) { frame = 0; direction = 1; }
          } else if (loopStyle === 'once') {
            if (frame < effectiveFrames - 1) frame++;
          } else {
            frame = (frame + 1) % effectiveFrames;
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const src = sources[frame] ?? sources[sources.length - 1];
      if (src) {
        // Letterbox-fit the source into the preview square.
        const { naturalWidth: w, naturalHeight: h } = src.el;
        const scale = Math.min(canvas.width / w, canvas.height / h);
        const dw = w * scale, dh = h * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(src.el, dx, dy, dw, dh);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sources, fps, loopStyle, animationStyle, frameGrid, playing]);

  // ── File handlers ──
  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => /^image\//.test(f.type));
    if (arr.length === 0) return;
    const next: SourceImage[] = [];
    for (const file of arr) {
      const url = URL.createObjectURL(file);
      const el = new Image();
      el.src = url;
      await el.decode().catch(() => {});
      next.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file, url, el,
      });
    }
    setSources(prev => [...prev, ...next]);
  };

  const removeSource = (id: string) => {
    setSources(prev => {
      const t = prev.find(s => s.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter(s => s.id !== id);
    });
  };

  const clearAll = () => {
    sources.forEach(s => URL.revokeObjectURL(s.url));
    setSources([]);
    setSheetBlob(null);
    setUploadState('idle');
    setUploadError(null);
    setUploadedEmojiId(null);
  };

  // ── Drag & drop ──
  const [dragging, setDragging] = useState(false);

  // ── Upload ──
  const handleUpload = async () => {
    if (!sheetBlob || !emojiName.trim()) {
      setUploadError('Pick an image and give your emoji a name first.');
      setUploadState('error');
      return;
    }
    setUploadState('uploading');
    setUploadStage('preparing');
    setUploadProgress(0);
    setUploadError(null);

    try {
      const result = await createEmoji({
        pngBlob: sheetBlob,
        name: emojiName.trim(),
        animationStyle,
        frames: animationStyle === 'animated' ? frameGrid : 1,
        framesOverTime: animationStyle === 'animated' ? frameGrid / fps : undefined,
        loopStyle,
        onProgress: (stage, pct) => {
          setUploadStage(stage);
          if (typeof pct === 'number') setUploadProgress(pct);
        },
      });
      setUploadedEmojiId(result.id);
      setUploadState('success');
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed for an unknown reason.');
      setUploadState('error');
    }
  };

  const downloadSheet = () => {
    if (!sheetBlob) return;
    const url = URL.createObjectURL(sheetBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${emojiName.trim() || 'emoji'}_${animationStyle === 'animated' ? frameGrid + 'frames' : 'static'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canUpload = sources.length > 0 && emojiName.trim().length > 0 && uploadState !== 'uploading';

  const gridDim = useMemo(() => Math.sqrt(frameGrid), [frameGrid]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smile size={22} className="text-accent-400" />
          Emoji Maker
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Build a VRChat custom emoji from one or more images. Drop a static PNG for a still emoji, or
          drop multiple frames in order for an animated one.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* ── LEFT: source + settings ── */}
        <div className="space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`glass-panel-solid p-6 border-2 border-dashed cursor-pointer transition-colors text-center ${
              dragging
                ? 'border-accent-500 bg-accent-500/10'
                : 'border-surface-700 hover:border-surface-600'
            }`}
          >
            <Upload size={28} className="mx-auto mb-2 text-surface-500" />
            <p className="text-sm font-medium">Drop images here, or click to browse</p>
            <p className="text-xs text-surface-500 mt-1">PNG / JPG · single image = static · multiple = animated</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {/* Source list */}
          {sources.length > 0 && (
            <div className="glass-panel-solid p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {sources.length} {sources.length === 1 ? 'frame' : 'frames'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    <Upload size={11} /> Add more
                  </button>
                  <button onClick={clearAll} className="btn-ghost text-xs flex items-center gap-1 text-rose-400 hover:text-rose-300">
                    <Trash2 size={11} /> Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sources.map((s, i) => (
                  <div key={s.id} className="relative group">
                    <img src={s.url} alt="" className="w-16 h-16 rounded object-cover bg-surface-800 ring-1 ring-surface-700" />
                    <span className="absolute top-0.5 left-0.5 bg-black/70 text-[9px] font-bold text-white rounded px-1">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <X size={9} />
                    </button>
                    <div className="absolute bottom-0.5 right-0.5 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical size={10} />
                    </div>
                  </div>
                ))}
              </div>
              {sources.length > frameGrid && (
                <p className="text-[11px] text-amber-400 mt-2 flex items-start gap-1">
                  <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                  Only the first {frameGrid} frames will be included — bump up the grid size to fit more.
                </p>
              )}
            </div>
          )}

          {/* Settings */}
          <div className="glass-panel-solid p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Animation</label>
              <div className="flex gap-2">
                {(['static', 'animated'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setAnimationStyle(s)}
                    className={`px-3 py-1.5 rounded text-sm font-medium border capitalize transition-colors ${
                      animationStyle === s
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {animationStyle === 'animated' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Frame grid <span className="text-xs text-surface-500">({gridDim}×{gridDim} = {frameGrid} frames)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {FRAME_GRIDS.filter(g => g > 1).map(g => (
                      <button
                        key={g}
                        onClick={() => setFrameGrid(g)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          frameGrid === g
                            ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                            : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    FPS <span className="text-xs text-surface-500">({fps})</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={fps}
                    onChange={e => setFps(Number(e.target.value))}
                    className="w-full accent-accent-500"
                  />
                  <div className="text-[10px] text-surface-600 flex justify-between mt-0.5">
                    <span>1 fps</span>
                    <span>full loop: {(frameGrid / fps).toFixed(1)}s</span>
                    <span>30 fps</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Loop style</label>
                  <div className="flex gap-2">
                    {([
                      { key: 'loop', label: 'Loop' },
                      { key: 'pingpong', label: 'Ping-pong' },
                      { key: 'once', label: 'Once' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setLoopStyle(key)}
                        className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                          loopStyle === key
                            ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                            : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Emoji name</label>
              <input
                value={emojiName}
                onChange={e => setEmojiName(e.target.value)}
                placeholder="e.g. wave_animated"
                maxLength={32}
                className="input-field"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-800/50">
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploadState === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload to VRChat
              </button>
              <button
                onClick={downloadSheet}
                disabled={!sheetBlob}
                className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={14} /> Download sprite sheet
              </button>
            </div>

            {/* Upload status */}
            {uploadState === 'uploading' && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-surface-400">
                  <span>{uploadStage}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {uploadState === 'success' && (
              <div className="flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded p-2">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Uploaded successfully!</p>
                  <p className="text-green-400/80 mt-0.5">
                    Open VRChat → Expressions menu → Emojis to use it.
                  </p>
                  {uploadedEmojiId && (
                    <p className="text-[10px] text-green-400/60 mt-1 font-mono break-all">
                      ID: {uploadedEmojiId}
                    </p>
                  )}
                </div>
              </div>
            )}
            {uploadState === 'error' && (
              <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Upload failed</p>
                  <p className="text-rose-400/80 mt-0.5 break-words">{uploadError}</p>
                  <p className="text-rose-400/60 text-[10px] mt-1">
                    You can still download the generated sprite sheet and upload it through the
                    VRChat website's emoji manager.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: preview + sheet ── */}
        <div className="space-y-3">
          <div className="glass-panel-solid p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Preview</span>
              {animationStyle === 'animated' && sources.length > 1 && (
                <button
                  onClick={() => setPlaying(!playing)}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  {playing ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Play</>}
                </button>
              )}
            </div>
            <div className="aspect-square bg-surface-950 rounded-lg overflow-hidden ring-1 ring-surface-800 flex items-center justify-center">
              {sources.length === 0 ? (
                <ImageIcon size={48} className="text-surface-700" />
              ) : (
                <canvas ref={previewCanvasRef} width={256} height={256} className="w-full h-full" />
              )}
            </div>
            <p className="text-[10px] text-surface-600 text-center mt-2">
              {animationStyle === 'animated'
                ? `${Math.min(sources.length, frameGrid)} frames @ ${fps}fps · ${loopStyle}`
                : 'Static'}
            </p>
          </div>

          {sheetUrl && (
            <div className="glass-panel-solid p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Sprite sheet</span>
                <span className="text-[10px] text-surface-600">{SHEET_SIZE}×{SHEET_SIZE}</span>
              </div>
              <img
                src={sheetUrl}
                alt="Sprite sheet"
                className="w-full aspect-square rounded ring-1 ring-surface-800 bg-surface-950 object-contain"
              />
              <p className="text-[10px] text-surface-600 mt-1">
                {animationStyle === 'animated'
                  ? `${gridDim}×${gridDim} grid · padded with last frame if needed`
                  : 'Single image'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-[10px] text-surface-600 text-center leading-relaxed">
        Custom emoji uploads use undocumented VRChat endpoints. If upload fails, download the
        sprite sheet and upload it via the emoji manager on{' '}
        <a
          href="https://vrchat.com"
          onClick={e => { e.preventDefault(); window.electronAPI?.openExternal('https://vrchat.com'); }}
          className="text-accent-400 hover:underline"
        >
          vrchat.com
        </a>.
      </div>
    </div>
  );
}

// ── Sprite sheet generation ────────────────────────────────────────────
//
// VRChat expects a square texture with N×N cells. Each cell is one frame.
// If we have fewer frames than cells, we pad with the last source image so
// the animation just hangs on the final frame rather than going blank.
async function buildSpriteSheet(images: HTMLImageElement[], frameGrid: number): Promise<Blob> {
  // Use OffscreenCanvas when available (it's faster + we don't need it in
  // the DOM), fall back to a regular canvas otherwise.
  const dim = Math.sqrt(frameGrid);
  const cell = SHEET_SIZE / dim;

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(SHEET_SIZE, SHEET_SIZE);
    ctx = canvas.getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = SHEET_SIZE;
    canvas.height = SHEET_SIZE;
    ctx = canvas.getContext('2d');
  }
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Clear (transparent background).
  ctx.clearRect(0, 0, SHEET_SIZE, SHEET_SIZE);

  for (let i = 0; i < frameGrid; i++) {
    const img = images[i] ?? images[images.length - 1];
    if (!img) continue;
    const col = i % dim;
    const row = Math.floor(i / dim);
    const x = col * cell;
    const y = row * cell;
    // Letterbox-fit each source image into its cell, preserving aspect ratio.
    const { naturalWidth: w, naturalHeight: h } = img;
    const scale = Math.min(cell / w, cell / h);
    const dw = w * scale, dh = h * scale;
    const dx = x + (cell - dw) / 2;
    const dy = y + (cell - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}
