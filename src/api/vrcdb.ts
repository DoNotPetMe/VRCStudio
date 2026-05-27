// Avatar search using community VRChat avatar databases.
//
// Primary provider is api.avtrdb.com. Per their FAQ they require:
//   - User-Agent that identifies the app AND contains contact info (URL/email)
//   - Referer: https://vrcx.app + VRCX-ID UUID (allowlist gate)
// Without these we get 403 "Host not in allowlist" or 403 "Please add proper
// contact information to your user-agent".
//
// Routes through Electron's main process so we can set Referer + custom
// User-Agent (which browser fetch() blocks for security reasons).

const VRCX_ID_KEY = 'vrcstudio_vrcx_id';

function getVrcxId(): string {
  let id = localStorage.getItem(VRCX_ID_KEY);
  if (!id) {
    id = (crypto as any).randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VRCX_ID_KEY, id);
  }
  return id;
}

// User-Agent that satisfies avtrdb's contact-info requirement.
// Format: <App>/<Version> (+<contact URL>; <contact email>)
const CONTACT_UA = 'VRCStudio/1.0.0 (+https://github.com/crystaldusty/vrcstudio; contact: vrcstudio@proton.me)';

const AVTRDB_HEADERS = (): Record<string, string> => ({
  'User-Agent': CONTACT_UA,
  'Referer': 'https://vrcx.app',
  'VRCX-ID': getVrcxId(),
});

const FALLBACK_HEADERS = (): Record<string, string> => ({
  'User-Agent': CONTACT_UA,
});

export const VRCDB_PROVIDERS = [
  {
    id: 'avtrdb',
    label: 'avtrdb.com',
    // avtrdb's /v3/avatar/search/vrcx endpoint REQUIRES a `search` param.
    // Tag searches piggy-back on the same endpoint by passing the tag as
    // the search term — avtrdb's full-text index covers tag names.
    searchUrl: (q: string, n = 200) => `https://api.avtrdb.com/v3/avatar/search/vrcx?search=${encodeURIComponent(q)}&n=${n}`,
    byAuthorUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?authorId=${encodeURIComponent(id)}`,
    byIdUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?fileId=${encodeURIComponent(id)}`,
    tagSearchUrl: (tag: string, n = 50) => `https://api.avtrdb.com/v3/avatar/search/vrcx?search=${encodeURIComponent(tag)}&n=${n}`,
    // Open the canonical avtrdb page for an avatar (e.g. to use their
    // built-in "find similar" image search there).
    webPageUrl: (avatarId: string) => `https://avtrdb.com/avatar/${encodeURIComponent(avatarId)}`,
    headers: AVTRDB_HEADERS,
  },
] as const;

export type ProviderId = typeof VRCDB_PROVIDERS[number]['id'];

const PROVIDER_KEY = 'vrcstudio_vrcdb_provider';

export function getProviderId(): ProviderId {
  const stored = localStorage.getItem(PROVIDER_KEY) as ProviderId | null;
  return VRCDB_PROVIDERS.find(p => p.id === stored) ? (stored as ProviderId) : 'avtrdb';
}

export function setProviderId(id: ProviderId) {
  localStorage.setItem(PROVIDER_KEY, id);
}

function getProvider() {
  const id = getProviderId();
  return VRCDB_PROVIDERS.find(p => p.id === id) ?? VRCDB_PROVIDERS[0];
}

export interface VRCDBAvatar {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  description: string;
  imageUrl: string;
  thumbnailImageUrl: string;
  releaseStatus: string;
}

function normalise(raw: unknown): VRCDBAvatar[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (raw as any)?.avatars ?? (raw as any)?.data ?? (raw as any)?.results ?? (raw && typeof raw === 'object' ? [raw] : []);
  return (list as any[])
    .filter(a => a && typeof a === 'object' && (a.id || a.avatarId || a.Id))
    .map(a => ({
      id: a.id ?? a.avatarId ?? a.Id ?? '',
      name: a.name ?? a.avatarName ?? '',
      authorId: a.authorId ?? a.userId ?? '',
      authorName: a.authorName ?? a.userName ?? '',
      description: a.description ?? '',
      imageUrl: a.imageUrl ?? a.thumbnailImageUrl ?? '',
      thumbnailImageUrl: a.thumbnailImageUrl ?? a.imageUrl ?? '',
      releaseStatus: a.releaseStatus ?? 'public',
    }));
}

async function fetchUrl(url: string, headers: Record<string, string>): Promise<{ avatars: VRCDBAvatar[]; status: number; rawError?: string }> {
  if (window.electronAPI?.httpGet) {
    const res = await window.electronAPI.httpGet(url, headers);
    if (!res.ok) return { avatars: [], status: res.status, rawError: res.raw?.slice(0, 200) };
    const data = res.data ?? (() => { try { return JSON.parse(res.raw); } catch { return null; } })();
    return { avatars: normalise(data), status: res.status };
  }
  // Browser fallback. Note: fetch() can't set Referer/VRCX-ID securely;
  // requests to api.avtrdb.com will fail in dev mode unless proxied.
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { avatars: [], status: res.status, rawError: await res.text().then(t => t.slice(0, 200)).catch(() => '') };
    return { avatars: normalise(await res.json()), status: res.status };
  } catch (err) {
    return { avatars: [], status: 0, rawError: err instanceof Error ? err.message : 'Network error' };
  }
}

// Try the active provider first, then fall back to others on hard error.
async function tryProviders(
  pick: (p: typeof VRCDB_PROVIDERS[number]) => string | null,
): Promise<VRCDBAvatar[]> {
  const order = [getProvider(), ...VRCDB_PROVIDERS.filter(p => p.id !== getProviderId())];
  const errors: string[] = [];
  for (const provider of order) {
    const url = pick(provider);
    if (!url) continue; // provider doesn't support this operation
    const result = await fetchUrl(url, provider.headers());
    if (result.status >= 200 && result.status < 300) {
      return result.avatars;
    }
    errors.push(`${provider.label} → ${result.status}${result.rawError ? `: ${result.rawError}` : ''}`);
  }
  if (errors.length === 0) throw new Error('No provider supports this search type');
  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

export const vrcdb = {
  search: (query: string, count = 200) => tryProviders(p => p.searchUrl(query, count)),
  getByAuthor: (authorId: string) => tryProviders(p => p.byAuthorUrl(authorId)),
  getById: (avatarId: string) => tryProviders(p => p.byIdUrl(avatarId)),
  searchByTag: (tag: string, count = 50) => tryProviders(p => 'tagSearchUrl' in p ? p.tagSearchUrl(tag, count) : null),
  /** Web URL for an avatar on the active provider (for opening in browser). */
  webUrlFor: (avatarId: string): string | null => {
    const p = VRCDB_PROVIDERS.find(p => p.id === getProviderId()) ?? VRCDB_PROVIDERS[0];
    return 'webPageUrl' in p ? p.webPageUrl(avatarId) : null;
  },
};
