// Frame extraction + sprite-sheet building for the Emoji Maker.
//
// Handles every realistic input a user might drop:
//   - Animated GIF / APNG / animated WebP  -> decoded frame-by-frame
//     via the WebCodecs ImageDecoder API (built into Electron's Chromium).
//   - Video (mp4 / webm / mov)             -> sampled by seeking a hidden
//     <video> element and grabbing canvas snapshots.
//   - One or more still images             -> loaded directly.
//
// Everything is normalised to an array of ImageBitmap (reusable, cheap to
// draw) so the rest of the app doesn't care where the frames came from.

export interface LoadResult {
  frames: ImageBitmap[];
  /** 'static' when only a single still frame came out, else 'animated'. */
  kind: 'static' | 'animated';
  sourceLabel: string;
}

// ImageDecoder isn't in every TS lib version — declare the slice we use.
interface ImageDecoderResult { image: { close(): void; codedWidth: number; codedHeight: number }; }
interface ImageDecoderTrack { frameCount: number; animated: boolean; }
interface ImageDecoderLike {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack?: ImageDecoderTrack };
  decode(opts: { frameIndex: number }): Promise<ImageDecoderResult>;
  close(): void;
}
declare const ImageDecoder: {
  new (init: { data: ArrayBuffer | Uint8Array; type: string }): ImageDecoderLike;
  isTypeSupported?(type: string): Promise<boolean>;
} | undefined;

const MAX_FRAMES = 64; // 8x8 grid ceiling

// ── Animated image (GIF / APNG / animated WebP) via ImageDecoder ─────────
async function decodeAnimatedImage(file: File): Promise<ImageBitmap[]> {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('This build can\'t decode animated images.');
  }
  const buf = await file.arrayBuffer();
  const decoder = new ImageDecoder({ data: buf, type: file.type || 'image/gif' });

  // tracks.ready gives us track metadata; completed guarantees frameCount
  // is final (GIF frame counts can grow as data streams in).
  await decoder.tracks.ready;
  try { await decoder.completed; } catch { /* still usable */ }

  const track = decoder.tracks.selectedTrack;
  const total = Math.max(1, track?.frameCount ?? 1);

  const frames: ImageBitmap[] = [];
  for (let i = 0; i < total; i++) {
    try {
      const { image } = await decoder.decode({ frameIndex: i });
      const bmp = await createImageBitmap(image as unknown as CanvasImageSource);
      image.close();
      frames.push(bmp);
    } catch {
      break; // stop at the first undecodable frame
    }
  }
  decoder.close();
  if (frames.length === 0) throw new Error('No frames could be decoded.');
  return frames;
}

// ── Video via hidden <video> + canvas snapshots ─────────────────────────
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

async function decodeVideo(file: File): Promise<ImageBitmap[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read that video.'));
    });

    const duration = isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error('Video has no readable duration.');

    // Sample ~12 fps, capped at MAX_FRAMES.
    const count = Math.min(MAX_FRAMES, Math.max(2, Math.round(duration * 12)));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 512;
    canvas.height = video.videoHeight || 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');

    const frames: ImageBitmap[] = [];
    for (let i = 0; i < count; i++) {
      // Stay a hair inside the duration so the last seek doesn't overshoot.
      const t = Math.min(duration - 0.01, (duration * i) / count);
      await seekVideo(video, t);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(await createImageBitmap(canvas));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Plain still image ───────────────────────────────────────────────────
async function decodeStill(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Load whatever the user dropped into a normalised list of frames.
 * Multiple still files are treated as ordered animation frames.
 */
export async function loadEmojiSource(files: File[]): Promise<LoadResult> {
  if (files.length === 0) throw new Error('No files given.');

  // Multiple files -> each is one still frame, in the order given.
  if (files.length > 1) {
    const stills = files.filter(f => /^image\//.test(f.type) && !/gif/.test(f.type));
    if (stills.length === 0) throw new Error('Drop image files, or a single GIF/video.');
    const frames: ImageBitmap[] = [];
    for (const f of stills) frames.push(await decodeStill(f));
    return {
      frames,
      kind: frames.length > 1 ? 'animated' : 'static',
      sourceLabel: `${frames.length} images`,
    };
  }

  const file = files[0];
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  // Animated image formats
  if (
    type === 'image/gif' || name.endsWith('.gif') ||
    type === 'image/apng' || name.endsWith('.apng') ||
    type === 'image/webp' || name.endsWith('.webp')
  ) {
    const frames = await decodeAnimatedImage(file);
    return {
      frames,
      kind: frames.length > 1 ? 'animated' : 'static',
      sourceLabel: `${file.name} (${frames.length} frame${frames.length === 1 ? '' : 's'})`,
    };
  }

  // Video
  if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/.test(name)) {
    const frames = await decodeVideo(file);
    return { frames, kind: 'animated', sourceLabel: `${file.name} (${frames.length} frames)` };
  }

  // Single still
  if (type.startsWith('image/')) {
    const bmp = await decodeStill(file);
    return { frames: [bmp], kind: 'static', sourceLabel: file.name };
  }

  throw new Error('Unsupported file type. Use an image, GIF, or video.');
}

/**
 * Resample a frame list to exactly `target` frames using even nearest-
 * neighbour sampling. Used to make the frame count match the chosen grid
 * exactly so every sprite-sheet cell is filled and the loop stays smooth.
 */
export function resampleFrames<T>(frames: T[], target: number): T[] {
  if (frames.length === 0 || target <= 0) return [];
  if (frames.length === target) return frames.slice();
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    const idx = target === 1
      ? 0
      : Math.round((i * (frames.length - 1)) / (target - 1));
    out.push(frames[Math.min(idx, frames.length - 1)]);
  }
  return out;
}

/** Smallest square grid dimension that holds `frameCount` frames (capped 8). */
export function bestGridDim(frameCount: number): number {
  for (let d = 1; d <= 8; d++) {
    if (d * d >= frameCount) return d;
  }
  return 8;
}

export type FitMode = 'contain' | 'cover';

/** Draw one bitmap into a square cell with the given fit mode. */
function drawFitted(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bmp: ImageBitmap,
  x: number, y: number, size: number,
  fit: FitMode,
) {
  const { width: w, height: h } = bmp;
  const scale = fit === 'cover'
    ? Math.max(size / w, size / h)
    : Math.min(size / w, size / h);
  const dw = w * scale, dh = h * scale;
  const dx = x + (size - dw) / 2;
  const dy = y + (size - dh) / 2;
  if (fit === 'cover') {
    // Clip to the cell so cropped overflow doesn't bleed into neighbours.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.drawImage(bmp, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(bmp, dx, dy, dw, dh);
  }
}

/**
 * Build the sprite sheet. `frames` should already be exactly `gridDim²`
 * long (call resampleFrames first). Returns a transparent PNG blob.
 */
export async function buildSpriteSheet(
  frames: ImageBitmap[],
  gridDim: number,
  fit: FitMode,
  sheetSize = 1024,
): Promise<Blob> {
  const cell = sheetSize / gridDim;
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(sheetSize, sheetSize)
      : Object.assign(document.createElement('canvas'), { width: sheetSize, height: sheetSize });
  const ctx = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.clearRect(0, 0, sheetSize, sheetSize);
  const cells = gridDim * gridDim;
  for (let i = 0; i < cells; i++) {
    const bmp = frames[i];
    if (!bmp) continue;
    const col = i % gridDim;
    const row = Math.floor(i / gridDim);
    drawFitted(ctx, bmp, col * cell, row * cell, cell, fit);
  }

  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      b => (b ? resolve(b) : reject(new Error('PNG export failed'))),
      'image/png',
    );
  });
}

/** Render one bitmap as a small object-URL thumbnail for the frame strip. */
export async function frameThumb(bmp: ImageBitmap, size = 64): Promise<string> {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return '';
  drawFitted(ctx, bmp, 0, 0, size, 'contain');
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob>((res, rej) =>
        (canvas as HTMLCanvasElement).toBlob(b => b ? res(b) : rej(new Error('thumb failed')), 'image/png'));
  return URL.createObjectURL(blob);
}
