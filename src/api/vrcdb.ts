// Avatar search using community-run VRCDB indexes.
// All requests route through Electron's main process (Node.js https.request)
// so we can set User-Agent: VRCX, which is required by the primary provider.
// Falls back to browser fetch() when running outside Electron (dev/browser).

export const VRCDB_PROVIDERS = [
  {
    id: 'vrcdb',
    label: 'vrcdb.com',
    // URL template: replace {query} with the encoded search term
    searchUrl: (q: string) => `https://vrcx.vrcdb.com/avatars/Avatar/${encodeURIComponent(q)}`,
    byAuthorUrl: (authorId: string) => `https://vrcx.vrcdb.com/avatars/Author/${encodeURIComponent(authorId)}`,
    byIdUrl: (avatarId: string) => `https://vrcx.vrcdb.com/avatars/Avatar/${encodeURIComponent(avatarId)}`,
  },
  {
    id: 'requi',
    label: 'requi.dev',
    searchUrl: (q: string) => `https://requi.dev/vrcx_search.php?search=${encodeURIComponent(q)}&n=40`,
    byAuthorUrl: (id: string) => `https://requi.dev/vrcx_search.php?authorId=${encodeURIComponent(id)}&n=50`,
    byIdUrl: (id: string) => `https://requi.dev/vrcx_search.php?avatarId=${encodeURIComponent(id)}`,
  },
  {
    id: 'justh',
    label: 'just-h.party',
    searchUrl: (q: string) => `https://avtr.just-h.party/vrcx_search.php?search=${encodeURIComponent(q)}&n=40`,
    byAuthorUrl: (id: string) => `https://avtr.just-h.party/vrcx_search.php?authorId=${encodeURIComponent(id)}&n=50`,
    byIdUrl: (id: string) => `https://avtr.just-h.party/vrcx_search.php?avatarId=${encodeURIComponent(id)}`,
  },
] as const;

export type ProviderId = typeof VRCDB_PROVIDERS[number]['id'];

const PROVIDER_KEY = 'vrcstudio_vrcdb_provider';

export function getProviderId(): ProviderId {
  const stored = localStorage.getItem(PROVIDER_KEY) as ProviderId | null;
  return VRCDB_PROVIDERS.find(p => p.id === stored) ? (stored as ProviderId) : 'vrcdb';
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
    : (raw as any)?.avatars ?? (raw as any)?.data ?? (raw as any)?.results ?? [];
  return (list as any[]).filter(
    (a) => a && typeof a === 'object' && (a.id || a.avatarId)
  ).map((a) => ({
    id: a.id ?? a.avatarId ?? '',
    name: a.name ?? a.avatarName ?? '',
    authorId: a.authorId ?? a.userId ?? '',
    authorName: a.authorName ?? a.userName ?? '',
    description: a.description ?? '',
    imageUrl: a.imageUrl ?? a.thumbnailImageUrl ?? '',
    thumbnailImageUrl: a.thumbnailImageUrl ?? a.imageUrl ?? '',
    releaseStatus: a.releaseStatus ?? 'public',
  }));
}

async function fetchUrl(url: string): Promise<VRCDBAvatar[]> {
  // Prefer IPC path (Electron) so we control User-Agent
  if (window.electronAPI?.httpGet) {
    const res = await window.electronAPI.httpGet(url);
    if (!res.ok) throw new Error(`VRCDB ${res.status}: ${res.raw?.slice(0, 120)}`);
    return normalise(res.data);
  }
  // Browser fallback (dev server)
  const res = await fetch(url, { headers: { 'User-Agent': 'VRCX' } });
  if (!res.ok) throw new Error(`VRCDB ${res.status}`);
  return normalise(await res.json());
}

export const vrcdb = {
  search: (query: string) => fetchUrl(getProvider().searchUrl(query)),
  getByAuthor: (authorId: string) => fetchUrl(getProvider().byAuthorUrl(authorId)),
  getById: (avatarId: string) => fetchUrl(getProvider().byIdUrl(avatarId)),
};
