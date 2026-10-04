// Per-route service math shared by the ServicePanel and anywhere else that
// needs derived operating figures from live simulation state.
import type { SimulationState } from '../index.ts';
import { LOOP_ROUTES } from '../passengers/passengers.ts';
import { operatingCost } from './costs.ts';
import { headwayAt } from './servicePlan.ts';
import { cycleMin, effectiveHeadway, fleetRequired } from './timetable.ts';

export interface ServiceMath {
  routeId: string;
  length: number;
  slow: number;
  cycle: number;
  scheduled: number;
  fleet: number;
  assigned: number;
  spare: number;
  eff: number;
  capHr: number;
  estWait: number;
  dayCost: number;
  costPerPax: number;
  peakOcc: number;
  denied: number;
  boarded: number;
}

/** Derived operating figures for one route, or null when unknown. */
export function routeServiceMath(sim: SimulationState, routeId: string): ServiceMath | null {
  const route = sim.routes.find((r) => r.id === routeId);
  const plan = sim.service[routeId];
  if (!route || !plan) return null;
  const cum = sim.routeCumDist.get(route.id) ?? [0];
  const length = Math.max(1, cum[cum.length - 1]);
  const slow = route.mode === 'bus' ? (sim.busRouteCongestion[route.id] ?? 1) : 1;
  const effPlan = { ...plan, speedKph: plan.speedKph / Math.max(1, slow) };
  const loop = LOOP_ROUTES.has(route.id);
  const cycle = cycleMin(length, effPlan, route.stationIds.length, loop);
  const scheduled = headwayAt(plan, sim.timeMinutes);
  const fleet = plan.fleetSize > 0 ? plan.fleetSize : fleetRequired(cycle, scheduled);
  const assigned = sim.vehicles.filter((vv) => vv.routeId === route.id).length;
  const eff = effectiveHeadway(plan, cycle, fleet, sim.timeMinutes);
  const capHr = Number.isFinite(eff) && eff > 0 ? Math.round((60 / eff) * plan.vehicleCapacity) : 0;
  const estWait = Number.isFinite(eff) ? eff / 2 : Infinity;
  // Daily operating-cost estimate from the timetable (documented approximation).
  const operatingMin = Math.max(0, plan.operatingEndMin - plan.operatingStartMin);
  const peakMin = 9 * 60; // AM (5h) + PM (4h) demand peaks
  const offMin = Math.max(0, operatingMin - peakMin);
  const departures = peakMin / Math.max(0.5, plan.peakHeadwayMin) + offMin / Math.max(0.5, plan.offPeakHeadwayMin);
  const oneWayHr = cycle / 2 / 60;
  const dayCost = operatingCost(route.mode, departures * oneWayHr, (departures * length) / 1000, assigned);
  const boarded = sim.counters.routeBoardings[route.id] ?? 0;
  return {
    routeId,
    length, slow, cycle, scheduled, fleet, assigned,
    spare: assigned - fleetRequired(cycle, scheduled),
    eff, capHr, estWait, dayCost,
    costPerPax: boarded > 0 ? dayCost / boarded : 0,
    peakOcc: (sim.counters.routePeakOcc[route.id] ?? 0) * 100,
    denied: sim.counters.routeDenied[route.id] ?? 0,
    boarded,
  };
}
