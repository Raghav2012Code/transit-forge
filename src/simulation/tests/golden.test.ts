import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';
import { computeStats } from '../statistics.ts';

/** FNV-1a, 32 bit. Enough to notice any change in a day's results. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function goldenOf(ticks: number): string {
  let sim = createSimulation(1337);
  for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
  return fnv1a(JSON.stringify(computeStats(sim)));
}

// Re-recorded for the world-scale pass: positions (city bounds, coast, river,
// zones, roads, stations) multiply by WORLD_SCALE=5 while speeds, headways and
// dwells do not, so every trip is longer in real minutes and every travel-time
// and throughput figure moves. Confirmed deterministic (two runs, same hash).
// Previously re-recorded when boarding became direction-aware. If this fails,
// results moved again: find out why before touching the number.
const GOLDEN: Record<number, string> = { 360: '8d540c86', 1020: '2ca715b3' };

describe('seed 1337 golden results', () => {
  for (const ticks of [360, 1020]) {
    it(`after ${ticks} ticks`, () => {
      expect(goldenOf(ticks)).toBe(GOLDEN[ticks]);
    });
  }
});
