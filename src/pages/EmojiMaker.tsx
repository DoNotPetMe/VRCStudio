// VRChat custom emoji maker.
//
// Accepts a GIF / APNG / animated WebP, a video, or one-or-many still
// images, extracts every frame, lets you reorder/trim them, and builds a
// spec-correct square sprite sheet. The frame list is always resampled to
// exactly fill the chosen grid so the in-game loop stays smooth.
//
// Sprite-sheet generation is fully offline. Upload hits VRChat's
// (undocumented) emoji endpoints — if that fails the generated PNG is
// still there to upload via the VRChat website.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Smile, Upload, Image as ImageIcon, Trash2, Download, Play, Pause,
  Loader2, Check, AlertCircle, ChevronLeft, ChevronRight, Film, X,
} from 'lucide-react';
import {
  loadEmojiSource, resampleFrames, bestGridDim, buildSpriteSheet, frameThumb,
  type FitMode,
} from '../utils/emojiFrames';
import { createEmoji } from '../api/emoji';

const SHEET_SIZE = 1024;
const GRID_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]; // dim -> dim² cells

interface Frame {
  id: string;
  bitmap: ImageBitmap;
  thumbUrl: string;
}

type Mode = 'static' | 'animated';
type LoopStyle = 'loop' | 'pingpong' | 'once';
type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function EmojiMaker() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [mode, setMode] = useState<Mode>('static');
  const [gridDim, setGridDim] = useState(2);
  const [fps, setFps] = useState(12);
  const [loopStyle, setLoopStyle] = useState<LoopStyle>('loop');
  // Default to 'cover' — VRChat plays each grid cell as a frame, and
  // letterbox padding from 'contain' shows up as empty/black bands.
  const [fitMode, setFitMode] = useState<FitMode>('cover');
  const [emojiName, setEmojiName] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');

  const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const [playing, setPlaying] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // The grid actually used: 1 cell for static, gridDim² for animated.
  const effectiveDim = mode === 'static' ? 1 : gridDim;
  const cellCount = effectiveDim * effectiveDim;

  // Frames resampled to exactly fill the grid — what the sheet + preview use.
  const playBitmaps = useMemo(() => {
    if (frames.length === 0) return [];
    const bmps = frames.map(f => f.bitmap);
    return mode === 'static' ? [bmps[0]] : resampleFrames(bmps, cellCount);
  }, [frames, mode, cellCount]);

  // ── Cleanup helper — free bitmaps + thumbnail URLs ──
  const disposeFrames = useCallback((list: Frame[]) => {
    for (const f of list) {
      try { f.bitmap.close(); } catch {}
      if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
    }
  }, []);

  useEffect(() => () => disposeFrames(frames), []); // unmount cleanup

  // ── Load files ──
  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await loadEmojiSource(files);
      const built: Frame[] = [];
      for (const bmp of result.frames.slice(0, 64)) {
        built.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          bitmap: bmp,
          thumbUrl: await frameThumb(bmp),
        });
      }
      // Replace existing frames (and free them).
      setFrames(prev => { disposeFrames(prev); return built; });
      setMode(result.kind);
      setGridDim(result.kind === 'animated' ? bestGridDim(built.length) : 2);
      setSourceLabel(result.sourceLabel);
      setUploadState('idle');
      setUploadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load that file.');
    } finally {
      setLoading(false);
    }
  };

  // ── Sprite sheet (re)generation ──
  useEffect(() => {
    if (playBitmaps.length === 0) { setSheetBlob(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const blob = await buildSpriteSheet(playBitmaps, effectiveDim, fitMode, SHEET_SIZE);
        if (!cancelled) setSheetBlob(blob);
      } catch { /* leave previous sheet */ }
    })();
    return () => { cancelled = true; };
  }, [playBitmaps, effectiveDim, fitMode]);

  useEffect(() => {
    if (!sheetBlob) { setSheetUrl(null); return; }
    const url = URL.createObjectURL(sheetBlob);
    setSheetUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sheetBlob]);

  // ── Animated preview ──
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || playBitmaps.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let dir = 1;
    let last = performance.now();
    const total = playBitmaps.length;
    const frameMs = 1000 / fps;

    const draw = (bmp: ImageBitmap) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { width: w, height: h } = bmp;
      const scale = fitMode === 'cover'
        ? Math.max(canvas.width / w, canvas.height / h)
        : Math.min(canvas.width / w, canvas.height / h);
      const dw = w * scale, dh = h * scale;
      ctx.drawImage(bmp, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };

    const tick = (now: number) => {
      if (total <= 1 || mode === 'static') {
        draw(playBitmaps[0]);
        return; // static — draw once, no rAF loop needed
      }
      if (playing && now - last >= frameMs) {
        last = now;
        if (loopStyle === 'pingpong') {
          frame += dir;
          if (frame >= total - 1) { frame = total - 1; dir = -1; }
          else if (frame <= 0) { frame = 0; dir = 1; }
        } else if (loopStyle === 'once') {
          if (frame < total - 1) frame++;
        } else {
          frame = (frame + 1) % total;
        }
      }
      draw(playBitmaps[Math.min(frame, total - 1)]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playBitmaps, fps, loopStyle, playing, mode, fitMode]);

  // ── Frame strip operations ──
  const moveFrame = (index: number, delta: number) => {
    setFrames(prev => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFrame = (id: string) => {
    setFrames(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        try { target.bitmap.close(); } catch {}
        if (target.thumbUrl) URL.revokeObjectURL(target.thumbUrl);
      }
      const next = prev.filter(f => f.id !== id);
      if (next.length <= 1) setMode('static');
      return next;
    });
  };

  const clearAll = () => {
    setFrames(prev => { disposeFrames(prev); return []; });
    setSheetBlob(null);
    setSourceLabel('');
    setUploadState('idle');
    setUploadError(null);
    setUploadedId(null);
  };

  // ── Download / upload ──
  const downloadSheet = () => {
    if (!sheetBlob) return;
    const url = URL.createObjectURL(sheetBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${emojiName.trim() || 'emoji'}_${mode === 'animated' ? `${cellCount}f` : 'static'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleUpload = async () => {
    if (!sheetBlob || !emojiName.trim()) {
      setUploadError('Add a name first.');
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
        animationStyle: mode === 'animated' ? 'animated' : 'static',
        frames: mode === 'animated' ? (cellCount as any) : 1,
        framesOverTime: mode === 'animated' ? cellCount / fps : undefined,
        loopStyle: loopStyle === 'pingpong' ? 'pingpong' : loopStyle,
        onProgress: (stage, pct) => {
          setUploadStage(stage);
          if (typeof pct === 'number') setUploadProgress(pct);
        },
      });
      setUploadedId(result.id);
      setUploadState('success');
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed.');
      setUploadState('error');
    }
  };

  const canUpload = frames.length > 0 && emojiName.trim().length > 0 && uploadState !== 'uploading';
  const loopSeconds = (cellCount / fps).toFixed(1);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smile size={22} className="text-accent-400" />
          Emoji Maker
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Drop a GIF, a video, or a stack of images — every frame is pulled out automatically and
          packed into a VRChat-ready sprite sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* ── LEFT ── */}
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
              dragging ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'
            }`}
          >
            {loading ? (
              <>
                <Loader2 size={28} className="mx-auto mb-2 text-accent-400 animate-spin" />
                <p className="text-sm font-medium">Extracting frames…</p>
              </>
            ) : (
              <>
                <Upload size={28} className="mx-auto mb-2 text-surface-500" />
                <p className="text-sm font-medium">Drop a file here, or click to browse</p>
                <p className="text-xs text-surface-500 mt-1">
                  GIF · APNG · WebP · MP4 / WebM · PNG / JPG (one or many)
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {loadError && (
            <div className="glass-panel-solid p-3 flex items-start gap-2 text-xs text-rose-400">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Frame strip */}
          {frames.length > 0 && (
            <div className="glass-panel-solid p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Film size={13} className="text-surface-500" />
                  {frames.length} frame{frames.length === 1 ? '' : 's'}
                  {sourceLabel && <span className="text-xs text-surface-600 font-normal">· {sourceLabel}</span>}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="btn-ghost text-xs flex items-center gap-1">
                    <Upload size={11} /> Replace
                  </button>
                  <button onClick={clearAll} className="btn-ghost text-xs flex items-center gap-1 text-rose-400 hover:text-rose-300">
                    <Trash2 size={11} /> Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {frames.map((f, i) => (
                  <div key={f.id} className="relative group">
                    <img
                      src={f.thumbUrl}
                      alt=""
                      className="w-16 h-16 rounded object-contain bg-surface-950 ring-1 ring-surface-700"
                    />
                    <span className="absolute top-0.5 left-0.5 bg-black/75 text-[9px] font-bold text-white rounded px-1">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removeFrame(f.id)}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove frame"
                    >
                      <X size={9} />
                    </button>
                    {frames.length > 1 && (
                      <div className="absolute bottom-0 inset-x-0 flex justify-between px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveFrame(i, -1)}
                          disabled={i === 0}
                          className="bg-black/75 text-white rounded p-0.5 disabled:opacity-30"
                          title="Move left"
                        >
                          <ChevronLeft size={10} />
                        </button>
                        <button
                          onClick={() => moveFrame(i, 1)}
                          disabled={i === frames.length - 1}
                          className="bg-black/75 text-white rounded p-0.5 disabled:opacity-30"
                          title="Move right"
                        >
                          <ChevronRight size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {mode === 'animated' && frames.length !== cellCount && (
                <p className="text-[11px] text-surface-500 mt-2">
                  {frames.length} frame{frames.length === 1 ? '' : 's'} → resampled to {cellCount} to
                  fill the {effectiveDim}×{effectiveDim} grid
                  {frames.length > cellCount ? ' (some frames dropped)' : ' (frames repeated)'}.
                </p>
              )}
            </div>
          )}

          {/* Settings */}
          {frames.length > 0 && (
            <div className="glass-panel-solid p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <div className="flex gap-2">
                  {(['static', 'animated'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      disabled={m === 'animated' && frames.length < 2}
                      className={`px-3 py-1.5 rounded text-sm font-medium border capitalize transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        mode === m
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {mode === 'static' && frames.length > 1 && (
                  <p className="text-[11px] text-surface-500 mt-1">Static uses frame 1 only.</p>
                )}
              </div>

              {mode === 'animated' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Grid <span className="text-xs text-surface-500">({gridDim}×{gridDim} = {gridDim * gridDim} cells)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {GRID_OPTIONS.filter(d => d > 1).map(d => (
                        <button
                          key={d}
                          onClick={() => setGridDim(d)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                            gridDim === d
                              ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                              : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                          }`}
                        >
                          {d}×{d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Speed <span className="text-xs text-surface-500">({fps} fps · loop {loopSeconds}s)</span>
                    </label>
                    <input
                      type="range" min={1} max={30} value={fps}
                      onChange={e => setFps(Number(e.target.value))}
                      className="w-full accent-accent-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Loop</label>
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
                <label className="block text-sm font-medium mb-2">Frame fit</label>
                <div className="flex gap-2">
                  {([
                    { key: 'contain', label: 'Contain', hint: 'whole image, may letterbox' },
                    { key: 'cover', label: 'Cover', hint: 'fills the square, crops edges' },
                  ] as const).map(({ key, label, hint }) => (
                    <button
                      key={key}
                      onClick={() => setFitMode(key)}
                      title={hint}
                      className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                        fitMode === key
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Emoji name</label>
                <input
                  value={emojiName}
                  onChange={e => setEmojiName(e.target.value)}
                  placeholder="e.g. wave"
                  maxLength={32}
                  className="input-field"
                />
              </div>

              {/* VRChat upload cheat-sheet — the numbers to type into
                  VRChat's own "Upload A New Emoji" dialog. If these don't
                  match the sheet, VRChat slices it wrong and the emoji
                  plays as one garbled image. */}
              <div className="rounded-lg border border-accent-500/30 bg-accent-500/8 p-3">
                <div className="text-xs font-semibold text-accent-300 mb-2">
                  Uploading via vrchat.com? Set its sliders to exactly:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-surface-900/70 rounded px-2.5 py-1.5">
                    <span className="text-xs text-surface-400">Frames</span>
                    <span className="text-sm font-bold tabular-nums">
                      {mode === 'animated' ? cellCount : 1}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-surface-900/70 rounded px-2.5 py-1.5">
                    <span className="text-xs text-surface-400">FPS</span>
                    <span className="text-sm font-bold tabular-nums">
                      {mode === 'animated' ? fps : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-surface-500 mt-1.5 leading-snug">
                  VRChat reads the sheet as a {effectiveDim}×{effectiveDim} grid. If its
                  Frames slider doesn't match {mode === 'animated' ? cellCount : 1}, the
                  animation will be sliced incorrectly.
                </p>
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
                  <Download size={14} /> Download sheet
                </button>
              </div>

              {uploadState === 'uploading' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-surface-400">
                    <span>{uploadStage}</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {uploadState === 'success' && (
                <div className="flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded p-2">
                  <Check size={12} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Uploaded!</p>
                    <p className="text-green-400/80 mt-0.5">Open VRChat → Expressions → Emojis to use it.</p>
                    {uploadedId && <p className="text-[10px] text-green-400/60 mt-1 font-mono break-all">ID: {uploadedId}</p>}
                  </div>
                </div>
              )}
              {uploadState === 'error' && (
                <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">Upload failed</p>
                    <p className="text-rose-400/80 mt-0.5 break-words">{uploadError}</p>
                    <p className="text-rose-400/60 text-[10px] mt-1">
                      Download the sheet and upload it via the emoji manager on vrchat.com instead.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-3">
          <div className="glass-panel-solid p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Preview</span>
              {mode === 'animated' && playBitmaps.length > 1 && (
                <button onClick={() => setPlaying(!playing)} className="btn-ghost text-xs flex items-center gap-1">
                  {playing ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Play</>}
                </button>
              )}
            </div>
            <div className="aspect-square bg-surface-950 rounded-lg overflow-hidden ring-1 ring-surface-800 flex items-center justify-center
                            [background-image:repeating-conic-gradient(rgb(var(--surface-800))_0deg_90deg,transparent_90deg_180deg)]
                            [background-size:20px_20px]">
              {frames.length === 0 ? (
                <ImageIcon size={48} className="text-surface-700" />
              ) : (
                <canvas ref={previewCanvasRef} width={288} height={288} className="w-full h-full" />
              )}
            </div>
            <p className="text-[10px] text-surface-600 text-center mt-2">
              {frames.length === 0
                ? 'Drop a file to begin'
                : mode === 'animated'
                  ? `${cellCount} frames @ ${fps}fps · ${loopStyle}`
                  : 'Static emoji'}
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
                {mode === 'animated'
                  ? `${effectiveDim}×${effectiveDim} grid · ${cellCount} frames · left-to-right, top-to-bottom`
                  : 'Single 1024² image'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] text-surface-600 text-center leading-relaxed">
        Direct upload uses undocumented VRChat endpoints and needs VRChat+. If it fails, download the
        sheet and upload it through the emoji manager on{' '}
        <a
          href="https://vrchat.com"
          onClick={e => { e.preventDefault(); window.electronAPI?.openExternal('https://vrchat.com'); }}
          className="text-accent-400 hover:underline"
        >vrchat.com</a>.
      </div>
    </div>
  );
}
