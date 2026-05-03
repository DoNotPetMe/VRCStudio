export type TrustRank = 'VRChat Team' | 'Trusted User' | 'Known User' | 'User' | 'New User' | 'Visitor';

const RANK_MAP: [string, TrustRank][] = [
  ['admin_moderator',      'VRChat Team'],
  ['system_trust_veteran', 'Trusted User'],
  ['system_trust_known',   'Known User'],
  ['system_trust_basic',   'User'],
  ['system_trust_visitor', 'New User'],
];

export function getTrustRank(tags: string[]): TrustRank {
  for (const [tag, rank] of RANK_MAP) {
    if (tags.includes(tag)) return rank;
  }
  return 'Visitor';
}

export const RANK_COLORS: Record<TrustRank, string> = {
  'VRChat Team':  'bg-red-500/20 text-red-400 border-red-500/30',
  'Trusted User': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Known User':   'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'User':         'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'New User':     'bg-surface-700 text-surface-400 border-surface-600',
  'Visitor':      'bg-surface-700 text-surface-500 border-surface-600',
};
