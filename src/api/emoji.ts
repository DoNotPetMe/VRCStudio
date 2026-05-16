// VRChat custom emoji upload helper.
//
// VRChat's emoji API isn't publicly documented. The general flow (derived
// from how their own client behaves and how other API-shaped uploads work
// in VRChat) is:
//
//   1. POST  /api/1/file           → create a file record (returns fileId)
//   2. POST  /api/1/file/<id>/<v>/file/start → request an S3 signed PUT URL
//   3. PUT   <signedUrl>           → upload the PNG bytes
//   4. POST  /api/1/file/<id>/<v>/file/finish → finalize upload
//   5. POST  /api/1/emoji          → register the file as an emoji
//
// Field names below are best-effort. If the upload step fails the user
// still has the generated sprite-sheet PNG to upload manually via
// vrchat.com.

import api from './vrchat';

export type EmojiAnimationStyle = 'static' | 'animated';
export type EmojiLoopStyle = 'loop' | 'pingpong' | 'once';
export type EmojiFrameGrid = 1 | 4 | 9 | 16 | 25 | 36 | 64;

export interface CreateEmojiOptions {
  pngBlob: Blob;
  name: string;
  animationStyle: EmojiAnimationStyle;
  frames?: EmojiFrameGrid;
  /** Duration of one full loop, in seconds. */
  framesOverTime?: number;
  loopStyle?: EmojiLoopStyle;
  onProgress?: (stage: string, pct?: number) => void;
}

export interface EmojiResult {
  id: string;
  name: string;
  fileId?: string;
}

// Authenticated request helper — reuses the existing api singleton so we
// pick up auth cookies and the proper /api/1 prefix.
async function vrcRequest<T = any>(opts: {
  method: string;
  path: string;     // post-/api/1, e.g. '/file', '/emoji'
  body?: any;
  headers?: Record<string, string>;
}): Promise<T> {
  return api.rawRequest<T>(opts.path, {
    method: opts.method,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    headers: opts.headers,
  });
}

// Compute the MD5 of a Blob → returned as the base64 (RFC4648) string that
// VRChat's file API expects. Uses the Web Crypto API only — no deps.
async function md5Base64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // Web Crypto only ships SHA, not MD5. We use a tiny MD5 in JS instead.
  const md5 = md5sum(new Uint8Array(buf));
  // md5 is a 16-byte Uint8Array → base64
  let s = '';
  for (const b of md5) s += String.fromCharCode(b);
  return btoa(s);
}

// Minimal MD5 (RFC 1321) — public domain port. ~1.5 KB.
function md5sum(input: Uint8Array): Uint8Array {
  const r = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

  const msgLen = input.length;
  const padLen = ((msgLen + 8) >>> 6) * 64 + 64;
  const m = new Uint8Array(padLen);
  m.set(input);
  m[msgLen] = 0x80;
  const lenBits = msgLen * 8;
  const view = new DataView(m.buffer);
  view.setUint32(padLen - 8, lenBits >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(lenBits / 0x100000000), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let off = 0; off < padLen; off += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let f = 0, g = 0;
      if (i < 16)      { f = (B & C) | (~B & D); g = i; }
      else if (i < 32) { f = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = B ^ C ^ D;           g = (3 * i + 5) % 16; }
      else             { f = C ^ (B | ~D);        g = (7 * i) % 16; }
      const temp = D;
      D = C; C = B;
      B = (B + rotl((A + f + k[i] + M[g]) >>> 0, r[i])) >>> 0;
      A = temp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

/**
 * Uploads a sprite-sheet PNG to VRChat and registers it as a custom emoji.
 *
 * On failure throws with a descriptive message; the caller should fall back
 * to offering the generated PNG as a manual download.
 */
export async function createEmoji(opts: CreateEmojiOptions): Promise<EmojiResult> {
  const { pngBlob, name, animationStyle, frames = 1, framesOverTime, loopStyle, onProgress } = opts;

  onProgress?.('preparing', 0);

  // 1. Create the file record.
  const fileMeta = await vrcRequest<{ id: string; versions: any[] }>({
    method: 'POST',
    path: '/file',
    body: {
      name,
      mimeType: 'image/png',
      extension: '.png',
      tags: ['emoji'],
    },
  });

  if (!fileMeta?.id) throw new Error('File create returned no id');
  const fileId = fileMeta.id;
  // Latest version (likely 1 for a brand new file).
  const versionNum = Array.isArray(fileMeta.versions) && fileMeta.versions.length > 0
    ? fileMeta.versions[fileMeta.versions.length - 1].version
    : 1;

  onProgress?.('starting upload', 15);

  // 2. Request a signed upload URL.
  const md5 = await md5Base64(pngBlob);
  const start = await vrcRequest<{ url: string }>({
    method: 'PUT',
    path: `/file/${fileId}/${versionNum}/file/start`,
    body: {
      fileMd5: md5,
      fileSizeInBytes: pngBlob.size,
    },
  });

  if (!start?.url) throw new Error('No signed upload URL returned');

  onProgress?.('uploading', 30);

  // 3. PUT the PNG bytes to S3.
  // Use fetch directly here (signed URL doesn't go through vrcRequest).
  const buf = await pngBlob.arrayBuffer();
  const putRes = await fetch(start.url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
      'Content-MD5': md5,
    },
    body: buf,
  });
  if (!putRes.ok) {
    throw new Error(`S3 upload failed (${putRes.status})`);
  }

  onProgress?.('finalizing', 75);

  // 4. Finalize.
  await vrcRequest({
    method: 'PUT',
    path: `/file/${fileId}/${versionNum}/file/finish`,
    body: {
      etags: [],
      nextPartNumber: 0,
      maxParts: 0,
    },
  });

  onProgress?.('registering emoji', 90);

  // 5. Register as an emoji.
  const emoji = await vrcRequest<{ id: string; name: string }>({
    method: 'POST',
    path: '/emoji',
    body: {
      name,
      fileId,
      animationStyle,
      // Animated-only fields. VRChat ignores extras for static emojis.
      ...(animationStyle === 'animated' ? {
        frames,
        framesOverTime: framesOverTime ?? Math.max(0.5, frames / 12),
        loopStyle,
      } : {}),
    },
  });

  onProgress?.('done', 100);
  return { id: emoji.id, name: emoji.name, fileId };
}
