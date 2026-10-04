// Service-vs-demand classification: is a problem caused by infrastructure,
// frequency, transfers, or road congestion? Rule-based on live metrics with
// documented thresholds (planning heuristics, not calibrated standards).
import type { Station, TransportRoute, TripCounters } from '../../types/index.ts';
import type { ServicePlan } from './servicePlan.ts';

export type StationProblem =
  | 'balanced'
  | 'under-served'
  | 'capacity-constrained'
  | 'frequency-constrained'
  | 'transfer-constrained';

export type RouteProblem =
  | 'balanced'
  | 'underused'
  | 'overcrowded'
  | 'frequency-constrained'
  | 'capacity-constrained'
  | 'road-constrained';

export type CrowdingBand = 'comfortable' | 'busy' | 'crowded' | 'over';

/** Occupancy category for display (simulation categories, not decoration). */
export function occupancyBand(occ01: number): CrowdingBand {
  if (occ01 > 1) return 'over';
  if (occ01 >= 0.9) return 'crowded';
  if (occ01 >= 0.7) return 'busy';
  return 'comfortable';
}

export interface ClassInput {
  stations: Station[];
  routes: TransportRoute[];
  counters: TripCounters;
  plans: Record<string, ServicePlan>;
  busSlowdown: Record<string, number>;
}

function stationClass(
  st: Station,
  headways: number[],
  transfers: number,
  boarded: number,
): StationProblem {
  const util = st.peakWaiting / Math.max(1, st.capacityPerHr * 0.25);
  const bestHeadway = headways.length > 0 ? Math.min(...headways) : Infinity;
  const transferShare = transfers / Math.max(1, boarded);
  if (util >= 1 && bestHeadway <= 6) return 'capacity-constrained';
  if (util >= 0.7 && bestHeadway > 10) return 'frequency-constrained';
  if (transferShare > 0.4 && st.waiting > st.capacityPerHr * 0.1) return 'transfer-constrained';
  if (util >= 0.5) return 'under-served';
  return 'balanced';
}

function routeClass(
  boardings: number,
  peakOcc: number,
  denied: number,
  headway: number,
  slowdown: number,
  isBus: boolean,
): RouteProblem {
  if (isBus && slowdown > 1.15 && peakOcc >= 0.5) return 'road-constrained';
  if (peakOcc >= 0.9) return headway > 8 ? 'frequency-constrained' : 'capacity-constrained';
  if (denied > boardings * 0.05 && boardings > 0) return headway > 8 ? 'frequency-constrained' : 'capacity-constrained';
  if (peakOcc < 0.3 && boardings < 200) return 'underused';
  if (peakOcc >= 0.7) return 'overcrowded';
  return 'balanced';
}

export function classifyNetwork(input: ClassInput): {
  stations: Record<string, StationProblem>;
  routes: Record<string, RouteProblem>;
} {
  const stations: Record<string, StationProblem> = {};
  for (const st of input.stations) {
    const headways = st.routeIds.map((id) => input.plans[id]?.peakHeadwayMin ?? 10);
    stations[st.id] = stationClass(st, headways, st.transfersDay, st.boardedDay);
  }
  const routes: Record<string, RouteProblem> = {};
  for (const r of input.routes) {
    const plan = input.plans[r.id];
    routes[r.id] = routeClass(
      input.counters.routeBoardings[r.id] ?? 0,
      input.counters.routePeakOcc[r.id] ?? 0,
      input.counters.routeDenied[r.id] ?? 0,
      plan?.peakHeadwayMin ?? 10,
      input.busSlowdown[r.id] ?? 1,
      r.mode === 'bus',
    );
  }
  return { stations, routes };
}
