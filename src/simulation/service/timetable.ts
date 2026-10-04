// Timetable math: departures generated arithmetically from headway +
// operating window (no stored timetable objects), plus cycle/fleet math.
import type { ServicePlan } from './servicePlan.ts';
import { headwayAt } from './servicePlan.ts';

/** One-way time (min) including base dwell per intermediate stop. */
export function oneWayMin(lengthM: number, plan: ServicePlan, stops: number): number {
  const ride = (lengthM / 1000 / Math.max(1, plan.speedKph)) * 60;
  const dwell = (Math.max(0, stops - 1) * plan.dwellBaseSec) / 60;
  return ride + dwell;
}

/** Full cycle: out + back + turnaround at both ends (loop routes turn once). */
export function cycleMin(lengthM: number, plan: ServicePlan, stops: number, loop = false): number {
  return loop
    ? oneWayMin(lengthM, plan, stops) + plan.turnaroundMin
    : 2 * oneWayMin(lengthM, plan, stops) + 2 * plan.turnaroundMin;
}

/** Vehicles needed to hold a headway over a cycle. */
export function fleetRequired(cycle: number, headway: number): number {
  if (!Number.isFinite(headway) || headway <= 0) return 0;
  return Math.max(1, Math.ceil(cycle / headway));
}

/**
 * Headway passengers actually experience. When the assigned fleet cannot
 * cover the cycle at the scheduled headway, service degrades to
 * cycle/fleet instead of spawning unlimited vehicles.
 */
export function effectiveHeadway(plan: ServicePlan, cycle: number, fleetSize: number, timeMin: number): number {
  const scheduled = headwayAt(plan, timeMin);
  if (!Number.isFinite(scheduled)) return Infinity;
  const fleet = fleetSize > 0 ? fleetSize : fleetRequired(cycle, scheduled);
  if (fleet <= 0) return Infinity;
  return Math.max(scheduled, cycle / fleet);
}

/** Resolved fleet: explicit assignment, or exactly the required fleet (auto). */
export function resolvedFleet(plan: ServicePlan, cycle: number, timeMin: number): number {
  const scheduled = headwayAt(plan, timeMin);
  if (!Number.isFinite(scheduled)) return 0;
  if (plan.fleetSize > 0) return plan.fleetSize;
  return fleetRequired(cycle, scheduled);
}

/**
 * Next terminus departure at or after `nowMin`. Departures sit on a grid of
 * `headway` anchored at `offset` (phase alignment for synced routes).
 */
export function nextTerminusDeparture(plan: ServicePlan, headway: number, offset: number, nowMin: number): number {
  if (!Number.isFinite(headway) || headway <= 0) return Infinity;
  const start = plan.operatingStartMin;
  if (nowMin < start) return start + offset;
  const k = Math.ceil((nowMin - start - offset) / headway);
  const dep = start + offset + Math.max(0, k) * headway;
  return dep < plan.operatingEndMin ? dep : Infinity;
}

/**
 * Next arrival of this route at station index `idx` (0-based from either
 * terminus; service runs both directions so the nearer departure wins).
 * Travel includes base dwell per intermediate stop.
 */
export function nextArrivalMin(
  plan: ServicePlan,
  headway: number,
  offset: number,
  cumDist: number[],
  stationIdx: number,
  nowMin: number,
): number {
  const total = cumDist[cumDist.length - 1] ?? 0;
  const fromStart = stationTimeMin(cumDist[stationIdx] ?? 0, plan, stationIdx);
  const fromEnd = stationTimeMin(total - (cumDist[stationIdx] ?? 0), plan, cumDist.length - 1 - stationIdx);
  const a = nextTerminusDeparture(plan, headway, offset, nowMin - fromStart) + fromStart;
  const b = nextTerminusDeparture(plan, headway, offset, nowMin - fromEnd) + fromEnd;
  return Math.min(a, b);
}

function stationTimeMin(distM: number, plan: ServicePlan, stopsBefore: number): number {
  return (distM / 1000 / Math.max(1, plan.speedKph)) * 60 + (stopsBefore * plan.dwellBaseSec) / 60;
}

/**
 * Headway passengers experience on a route right now: scheduled headway
 * degraded when the fleet cannot cover the (possibly congested) cycle.
 */
export function routeEffectiveHeadway(
  plan: ServicePlan,
  lengthM: number,
  stops: number,
  slow: number,
  timeMin: number,
  loop = false,
): number {
  const eff: ServicePlan = { ...plan, speedKph: plan.speedKph / Math.max(1, slow) };
  const cyc = cycleMin(lengthM, eff, stops, loop);
  const fleet = plan.fleetSize > 0 ? plan.fleetSize : fleetRequired(cyc, headwayAt(plan, timeMin));
  return effectiveHeadway(plan, cyc, fleet, timeMin);
}
/** Departure phase offset (min). Synced routes share the clock grid; others
 * get a deterministic per-route phase from the seed. */
export function phaseOffset(seed: number, routeId: string, plan: ServicePlan): number {
  if (plan.syncEnabled) return 0;
  let h = seed | 0;
  for (let i = 0; i < routeId.length; i++) h = Math.imul(h ^ routeId.charCodeAt(i), 2654435761);
  return (((h >>> 0) % 1000) / 1000) * plan.peakHeadwayMin;
}

/** Dwell at a stop from actual boardings/alightings (+crowding when full-ish). */
export function dwellMin(plan: ServicePlan, boardings: number, alightings: number, load01: number): number {
  const crowd = load01 > 0.9 ? (plan.dwellBaseSec * 0.5) / 60 : 0;
  return (
    plan.dwellBaseSec / 60 +
    (boardings * plan.dwellPerBoardSec) / 60 +
    (alightings * plan.dwellPerAlightSec) / 60 +
    crowd
  );
}
