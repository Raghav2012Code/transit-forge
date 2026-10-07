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

// Pinned after the movement-model rework (PR #4): termini charge turnaround,
// each stop deducts its own dwell, late boardings extend dwell, and B1 no
// longer loops (LOOP_ROUTES emptied). Results moved, so the hashes were
// re-recorded. If this fails, results moved again: find out why before
// touching the number.
const GOLDEN: Record<number, string> = { 360: '50d0008e', 1020: 'd5c6da4d' };

describe('seed 1337 golden results', () => {
  for (const ticks of [360, 1020]) {
    it(`after ${ticks} ticks`, () => {
      expect(goldenOf(ticks)).toBe(GOLDEN[ticks]);
    });
  }
});
