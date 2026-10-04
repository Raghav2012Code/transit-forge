import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchIndex, type SearchEntry } from './searchIndex.ts';

const ENTRIES: SearchEntry[] = [
  { kind: 'station', id: 'st-central', name: 'Central Interchange', typeLabel: 'Interchange station', metric: '2 lines', x: 0, z: 0 },
  { kind: 'station', id: 'st-airport', name: 'Aurora Airport', typeLabel: 'Station', metric: '', x: 470, z: -40 },
  { kind: 'route', id: 'rt-m1', name: 'M1 Metro Blue', typeLabel: 'Metro line', metric: '5 stops', x: 0, z: 0 },
  { kind: 'district', id: 'z-air', name: 'Aurora Airport', typeLabel: 'District · airport', metric: '22,000 jobs', x: 470, z: -40 },
  { kind: 'road', id: 're-1', name: 'Arterial W1–C1', typeLabel: 'Road · arterial', metric: 'V/C 0.64', x: 10, z: 10 },
];

describe('spatial search', () => {
  it('ranks exact, prefix, and word-start matches above loose ones', () => {
    const idx = buildSearchIndex(ENTRIES);
    expect(searchIndex(idx, 'Central Interchange')[0].id).toBe('st-central');
    expect(searchIndex(idx, 'cent')[0].id).toBe('st-central');
    expect(searchIndex(idx, 'airport').map((r) => r.id)).toEqual(['st-airport', 'z-air']);
  });

  it('returns nothing for blank or impossible queries', () => {
    const idx = buildSearchIndex(ENTRIES);
    expect(searchIndex(idx, '')).toEqual([]);
    expect(searchIndex(idx, 'zzz-nope')).toEqual([]);
  });

  it('dedupes entries and caps result count', () => {
    const idx = buildSearchIndex([...ENTRIES, ...ENTRIES, { ...ENTRIES[0], name: '' }]);
    expect(idx).toHaveLength(ENTRIES.length);
    expect(searchIndex(idx, 'a', 2)).toHaveLength(2);
  });

  it('prefers stations over roads on ties', () => {
    const idx = buildSearchIndex([
      { kind: 'road', id: 'r', name: 'Central Road', typeLabel: 'Road', metric: '', x: 0, z: 0 },
      { kind: 'station', id: 's', name: 'Central Road', typeLabel: 'Station', metric: '', x: 0, z: 0 },
    ]);
    expect(searchIndex(idx, 'Central Road')[0].kind).toBe('station');
  });
});
