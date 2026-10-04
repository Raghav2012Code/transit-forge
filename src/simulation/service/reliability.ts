// Deterministic reliability: delay/cancel draws from a hash of
// (seed, vehicle, trip), so results are identical for identical inputs
// regardless of evaluation order. No rng stream is consumed.
import type { ReliabilityPlan } from './servicePlan.ts';

function hash32(seed: number, vehicleId: string, trip: number, salt: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  const s = `${vehicleId}|${trip}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Extra dwell (min) sampled at a terminus turnaround; 0 when on time. */
export function tripDelayMin(seed: number, vehicleId: string, trip: number, plan: ReliabilityPlan): number {
  if (plan.delayProb <= 0) return 0;
  const r = hash32(seed, vehicleId, trip, 1);
  if (r >= plan.delayProb) return 0;
  const magnitude = hash32(seed, vehicleId, trip, 2);
  return plan.meanDelayMin * (0.5 + magnitude);
}

/** Whether a scheduled terminus departure is cancelled. */
export function tripCancelled(seed: number, vehicleId: string, trip: number, plan: ReliabilityPlan): boolean {
  if (plan.cancelProb <= 0) return false;
  return hash32(seed, vehicleId, trip, 3) < plan.cancelProb;
}
