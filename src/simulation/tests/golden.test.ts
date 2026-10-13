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

// Re-recorded when boarding became direction-aware: a rider now boards only a
// vehicle travelling toward their alight stop, instead of riding to the
// terminus and back on one going the other way. That changes every travel-time
// and throughput figure, so the hashes moved. Previously pinned after the
// movement-model rework (PR #4). If this fails, results moved again: find out
// why before touching the number.
// Re-recorded when vehicle ids moved into sim state (ticket #7): the fleet now
// mints `veh-<route>-<i>-n<k>` from `nextVehicleId`, and the reliability draws
// hash the vehicle id (tripDelayMin/tripCancelled in passengers.ts), so delay /
// cancel draws — and every travel-time and throughput figure — moved. The sim
// is still fully deterministic (two fresh sims produce identical results).
// Previously pinned after direction-aware boarding. If this fails, results
// moved again: find out why before touching the number.
const GOLDEN: Record<number, string> = { 360: 'f880a6d8', 1020: 'bdd699b3' };

describe('seed 1337 golden results', () => {
  for (const ticks of [360, 1020]) {
    it(`after ${ticks} ticks`, () => {
      expect(goldenOf(ticks)).toBe(GOLDEN[ticks]);
    });
  }
});
