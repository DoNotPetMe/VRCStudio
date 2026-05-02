// Avatar search using community VRChat avatar databases.
//
// Primary provider is api.avtrdb.com (used by VRCX itself). It gates on a
// VRCX-ID UUID + Referer: https://vrcx.app header — without those it returns
// 403 "Host not in allowlist". We persist a stable UUID per install.
//
// Routes through Electron's main process so we can set Referer (which the
// browser fetch() blocks for security reasons).

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

const VRCX_HEADERS = (): Record<string, string> => ({
  'Referer': 'https://vrcx.app',
  'VRCX-ID': getVrcxId(),
});

export const VRCDB_PROVIDERS = [
  {
    id: 'avtrdb',
    label: 'avtrdb.com',
    searchUrl: (q: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?search=${encodeURIComponent(q)}&n=200`,
    byAuthorUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?authorId=${encodeURIComponent(id)}`,
    byIdUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?fileId=${encodeURIComponent(id)}`,
    headers: VRCX_HEADERS,
  },
  {
    id: 'requi',
    label: 'requi.dev',
    searchUrl: (q: string) => `https://requi.dev/vrcx_search.php?search=${encodeURIComponent(q)}&n=40`,
    byAuthorUrl: (id: string) => `https://requi.dev/vrcx_search.php?authorId=${encodeURIComponent(id)}&n=50`,
    byIdUrl: (id: string) => `https://requi.dev/vrcx_search.php?avatarId=${encodeURIComponent(id)}`,
    headers: () => ({}),
  },
  {
    id: 'justh',
    label: 'just-h.party',
    searchUrl: (q: string) => `https://avtr.just-h.party/vrcx_search.php?search=${encodeURIComponent(q)}&n=40`,
    byAuthorUrl: (id: string) => `https://avtr.just-h.party/vrcx_search.php?authorId=${encodeURIComponent(id)}&n=50`,
    byIdUrl: (id: string) => `https://avtr.just-h.party/vrcx_search.php?avatarId=${encodeURIComponent(id)}`,
    headers: () => ({}),
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
  pick: (p: typeof VRCDB_PROVIDERS[number]) => string,
): Promise<VRCDBAvatar[]> {
  const order = [getProvider(), ...VRCDB_PROVIDERS.filter(p => p.id !== getProviderId())];
  const errors: string[] = [];
  for (const provider of order) {
    const url = pick(provider);
    const result = await fetchUrl(url, provider.headers());
    if (result.status >= 200 && result.status < 300) {
      return result.avatars;
    }
    errors.push(`${provider.label} → ${result.status}${result.rawError ? `: ${result.rawError}` : ''}`);
  }
  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

export const vrcdb = {
  search: (query: string) => tryProviders(p => p.searchUrl(query)),
  getByAuthor: (authorId: string) => tryProviders(p => p.byAuthorUrl(authorId)),
  getById: (avatarId: string) => tryProviders(p => p.byIdUrl(avatarId)),
};
