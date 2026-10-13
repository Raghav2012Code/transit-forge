// Live (mid-day) application of timed service/fare ops onto a running sim.
// Same math as the day-start path in applyEdits, minus fleet reconcile
// (that stays in App). Pure sim code: deterministic, never throws.
import type { SimulationState } from '../index.ts';
import type { FarePolicy } from '../economics/fares.ts';
import { sanitizeFares } from '../economics/fares.ts';
import type { ServicePatch } from '../scenario/scenario.ts';
import { mergeServicePatch, sanitizeServicePatch } from '../scenario/scenario.ts';
import { phaseOffset } from './timetable.ts';

/** Apply one setService patch live; false when route/plan missing. */
export function applyServiceOpToSim(sim: SimulationState, routeId: string, patch: ServicePatch): boolean {
  const route = sim.routes.find((r) => r.id === routeId);
  const current = sim.service[routeId];
  if (!route || !current) return false;
  const mode = route.mode === 'metro' || route.mode === 'rail' ? route.mode : 'bus';
  const next = mergeServicePatch(current, sanitizeServicePatch(patch, mode));
  sim.service[routeId] = next;
  sim.serviceOffsets[routeId] = phaseOffset(sim.seed, routeId, next);
  for (const vv of sim.vehicles) {
    if (vv.routeId === routeId) vv.capacity = next.vehicleCapacity;
  }
  return true;
}

/** Apply one setFares policy live (new boardings lock in the new fare). */
export function applyFaresOpToSim(sim: SimulationState, fares: FarePolicy): void {
  sim.fares = sanitizeFares(fares);
}
