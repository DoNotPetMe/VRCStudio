// Colour palette for friend tags.
//
// Tags are stored as plain strings on each FriendNote; the tag -> colour
// mapping lives separately in friendStore.tagColors. New tags get an
// auto-assigned palette colour (the least-used one) so they're visually
// distinct without the user having to pick.

export interface TagPaletteEntry {
  id: string;
  label: string;
  /** bg + text pairing for a filled badge. */
  badgeClass: string;
  /** solid colour for the little round dot in the filter bar. */
  dotClass: string;
}

export const TAG_PALETTE: TagPaletteEntry[] = [
  { id: 'accent',  label: 'Accent',  badgeClass: 'bg-accent-600/20 text-accent-300',   dotClass: 'bg-accent-500'  },
  { id: 'rose',    label: 'Rose',    badgeClass: 'bg-rose-500/20 text-rose-300',        dotClass: 'bg-rose-500'    },
  { id: 'amber',   label: 'Amber',   badgeClass: 'bg-amber-500/20 text-amber-300',      dotClass: 'bg-amber-500'   },
  { id: 'emerald', label: 'Emerald', badgeClass: 'bg-emerald-500/20 text-emerald-300',  dotClass: 'bg-emerald-500' },
  { id: 'cyan',    label: 'Cyan',    badgeClass: 'bg-cyan-500/20 text-cyan-300',        dotClass: 'bg-cyan-500'    },
  { id: 'purple',  label: 'Purple',  badgeClass: 'bg-purple-500/20 text-purple-300',    dotClass: 'bg-purple-500'  },
  { id: 'blue',    label: 'Blue',    badgeClass: 'bg-blue-500/20 text-blue-300',        dotClass: 'bg-blue-500'    },
  { id: 'slate',   label: 'Slate',   badgeClass: 'bg-slate-500/20 text-slate-300',      dotClass: 'bg-slate-400'   },
];

const PALETTE_BY_ID = new Map(TAG_PALETTE.map(p => [p.id, p]));

/** Resolve a colour id to its palette entry, falling back to the first (accent). */
export function tagPalette(colorId?: string): TagPaletteEntry {
  return (colorId && PALETTE_BY_ID.get(colorId)) || TAG_PALETTE[0];
}

/** Badge className for a tag with the given colour id (defaults to accent). */
export function tagBadgeClass(colorId?: string): string {
  return tagPalette(colorId).badgeClass;
}

/** Dot className for a tag with the given colour id. */
export function tagDotClass(colorId?: string): string {
  return tagPalette(colorId).dotClass;
}

/**
 * Pick the least-used palette colour given the colours already in use.
 * Keeps new tags visually distinct for as long as possible.
 */
export function nextPaletteColor(usedColorIds: string[]): string {
  const counts = new Map<string, number>(TAG_PALETTE.map(p => [p.id, 0]));
  for (const c of usedColorIds) {
    if (counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let bestId = TAG_PALETTE[0].id;
  let bestCount = Infinity;
  for (const p of TAG_PALETTE) {
    const c = counts.get(p.id) ?? 0;
    if (c < bestCount) { bestCount = c; bestId = p.id; }
  }
  return bestId;
}

/** The palette id that follows `colorId` — used for click-to-cycle swatches. */
export function cyclePaletteColor(colorId?: string): string {
  const idx = TAG_PALETTE.findIndex(p => p.id === colorId);
  return TAG_PALETTE[(idx + 1) % TAG_PALETTE.length].id;
}
