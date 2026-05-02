// Community avatar search services using the vrcx_search.php API format.
// Multiple providers are listed so the user can switch if one goes down.

export const VRCDB_PROVIDERS = [
  { id: 'requi',   label: 'requi.dev',        url: 'https://requi.dev/vrcx_search.php' },
  { id: 'justh',   label: 'just-h.party',     url: 'https://avtr.just-h.party/vrcx_search.php' },
  { id: 'ares',    label: 'ares-mod.com',     url: 'https://api.ares-mod.com/vrcx_search.php' },
] as const;

export type ProviderId = typeof VRCDB_PROVIDERS[number]['id'];

const PROVIDER_KEY = 'vrcstudio_vrcdb_provider';

export function getProviderId(): ProviderId {
  const stored = localStorage.getItem(PROVIDER_KEY) as ProviderId | null;
  return VRCDB_PROVIDERS.find(p => p.id === stored) ? (stored as ProviderId) : 'requi';
}

export function setProviderId(id: ProviderId) {
  localStorage.setItem(PROVIDER_KEY, id);
}

function providerUrl(): string {
  const id = getProviderId();
  return VRCDB_PROVIDERS.find(p => p.id === id)?.url ?? VRCDB_PROVIDERS[0].url;
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

async function get(params: Record<string, string>): Promise<VRCDBAvatar[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${providerUrl()}?${qs}`);
  if (!res.ok) throw new Error(`VRCDB request failed: ${res.status}`);
  const data = await res.json();
  // Some providers return an array directly, others wrap in { avatars: [] }
  const list: unknown[] = Array.isArray(data) ? data : (data?.avatars ?? data?.data ?? []);
  return list as VRCDBAvatar[];
}

export const vrcdb = {
  search: (query: string, limit = 20) =>
    get({ search: query, n: String(limit) }),

  getByAuthor: (authorId: string, limit = 50) =>
    get({ authorId, n: String(limit) }),

  getById: (avatarId: string) =>
    get({ avatarId }),
};
