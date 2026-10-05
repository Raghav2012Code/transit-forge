// Spatial search index: stations, routes, districts, roads. Pure data in,
// ranked results out. Scoring is local to retrieval (substring + word-start
// + kind priority); the generic fuzzy matcher lives in the command palette.
export type SearchKind = 'station' | 'route' | 'district' | 'road';

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  name: string;
  /** One-line type label shown in results. */
  typeLabel: string;
  /** Key metric string shown in results (may be empty when unknown). */
  metric: string;
  x: number;
  z: number;
}

export interface SearchResult extends SearchEntry {
  score: number;
}

const KIND_RANK: Record<SearchKind, number> = { station: 0, route: 1, district: 2, road: 3 };

export function scoreName(name: string, q: string): number {
  const n = name.toLowerCase();
  const query = q.toLowerCase().trim();
  if (query.length === 0) return 0;
  if (n === query) return 100;
  if (n.startsWith(query)) return 60;
  const words = n.split(/[\s–-]+/);
  if (words.some((w) => w.startsWith(query))) return 45;
  if (n.includes(query)) return 25;
  // Ordered-initials fallback ("ne suburb" ~ "North-East Suburbs").
  const initials = words.map((w) => w[0] ?? '').join('');
  if (query.length >= 2 && initials.includes(query.replace(/\s+/g, ''))) return 15;
  // Loose subsequence fallback.
  let hi = 0;
  for (const ch of query) {
    if (ch === ' ') continue;
    const found = n.indexOf(ch, hi);
    if (found < 0) return 0;
    hi = found + 1;
  }
  return 5;
}

export function buildSearchIndex(entries: SearchEntry[]): SearchEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.kind}:${e.id}`;
    if (seen.has(key) || !e.name) return false;
    seen.add(key);
    return true;
  });
}

export function searchIndex(index: SearchEntry[], query: string, limit = 8): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  return index
    .map((e) => ({ ...e, score: scoreName(e.name, q) - KIND_RANK[e.kind] }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, limit));
}
