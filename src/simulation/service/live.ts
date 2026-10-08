// Live changes to a running simulation. The same code runs when a person edits mid-day, when a timed
// op fires, and when a day is replayed, so all three agree by construction.
import type { SimulationState } from '../index.ts';
import { sanitizeFares, type FarePolicy } from '../economics/fares.ts';
import { LOOP_ROUTES } from '../passengers/passengers.ts';
import { mergeServicePatch, sanitizeServicePatch, type ServicePatch } from '../scenario/scenario.ts';
import { headwayAt } from './servicePlan.ts';
import { cycleMin, fleetRequired, phaseOffset } from './timetable.ts';

/**
 * Apply a service patch to a running sim: the plan is replaced, the departure phase recomputed,
 * capacities updated, and the fleet reconciled by adding or removing empty vehicles.
 * Returns the patch as it was applied (clamped for the route's mode), or null for an unknown route.
 */
export function applyServicePatch(sim: SimulationState, routeId: string, patch: ServicePatch): ServicePatch | null {
  const route = sim.routes.find((r) => r.id === routeId);
  const current = sim.service[routeId];
  if (!route || !current) return null;
  const mode = route.mode === 'metro' || route.mode === 'rail' ? route.mode : 'bus';
  const clean = sanitizeServicePatch(patch, mode);
  const next = mergeServicePatch(current, clean);
  sim.service[routeId] = next;
  sim.serviceOffsets[routeId] = phaseOffset(sim.seed, routeId, next);
  for (const v of sim.vehicles) {
    if (v.routeId === routeId) v.capacity = next.vehicleCapacity;
  }
  reconcileFleet(sim, routeId);
  return clean;
}

/** New boardings lock in the new fare; trips already under way keep theirs. Returns the policy as applied. */
export function applyFares(sim: SimulationState, fares: FarePolicy): FarePolicy {
  sim.fares = sanitizeFares(fares);
  return sim.fares;
}

/** Bring a route's vehicle count in line with its plan. New vehicles take ids from the sim's own counter, so replays match. */
export function reconcileFleet(sim: SimulationState, routeId: string): void {
  const route = sim.routes.find((r) => r.id === routeId);
  const plan = sim.service[routeId];
  if (!route || !plan) return;
  const cum = sim.routeCumDist.get(routeId) ?? [0];
  const total = Math.max(1, cum[cum.length - 1]);
  const cycle = cycleMin(total, plan, route.stationIds.length, LOOP_ROUTES.has(routeId));
  const h = headwayAt(plan, sim.timeMinutes);
  const desired = plan.fleetSize > 0 ? plan.fleetSize : Number.isFinite(h) ? fleetRequired(cycle, h) : 0;
  const existing = sim.vehicles.filter((v) => v.routeId === routeId);
  if (existing.length < desired) {
    for (let i = existing.length; i < desired; i++) {
      sim.fleetNonce++;
      sim.vehicles.push({
        id: `veh-${routeId}-${i}-n${sim.fleetNonce}`,
        routeId,
        s: 0,
        direction: 1,
        load: 0,
        capacity: plan.vehicleCapacity,
        riders: [],
        dwellLeft: 0,
        trips: 0,
      });
    }
  } else if (existing.length > desired) {
    const removable = existing
      .filter((v) => v.riders.length === 0)
      .sort((a, b) => b.id.localeCompare(a.id));
    const drop = new Set(removable.slice(0, existing.length - desired).map((v) => v.id));
    if (drop.size > 0) sim.vehicles = sim.vehicles.filter((v) => !drop.has(v.id));
  }
}
