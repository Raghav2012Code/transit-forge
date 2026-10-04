// Service configuration model: how each route is OPERATED, separate from the
// physical infrastructure (stations, tracks, roads). Pure data + helpers.
import type { TransportMode, TransportRoute } from '../../types/index.ts';
import { periodOf } from '../passengers/demand.ts';

export interface ReliabilityPlan {
  /** Probability a one-way trip incurs an extra delay. 0..1 */
  delayProb: number;
  /** Mean extra dwell (min) when a delay strikes. */
  meanDelayMin: number;
  /** Probability a scheduled departure is cancelled outright. 0..1 */
  cancelProb: number;
}

export interface ServicePlan {
  routeId: string;
  peakHeadwayMin: number;
  offPeakHeadwayMin: number;
  /** Operating window in minutes after midnight. */
  operatingStartMin: number;
  operatingEndMin: number;
  /** Assigned vehicles. 0 = automatic (exactly the required fleet). */
  fleetSize: number;
  vehicleCapacity: number;
  speedKph: number;
  dwellBaseSec: number;
  dwellPerBoardSec: number;
  dwellPerAlightSec: number;
  turnaroundMin: number;
  reliability: ReliabilityPlan;
  /** Align departures to a common clock grid at shared interchanges. */
  syncEnabled: boolean;
}

type ServiceMode = Extract<TransportMode, 'metro' | 'rail' | 'bus'>;

const DEFAULTS: Record<ServiceMode, Omit<ServicePlan, 'routeId'>> = {
  metro: {
    peakHeadwayMin: 4, offPeakHeadwayMin: 8,
    operatingStartMin: 330, operatingEndMin: 1410,
    fleetSize: 0, vehicleCapacity: 800, speedKph: 32,
    dwellBaseSec: 20, dwellPerBoardSec: 2, dwellPerAlightSec: 1.5,
    turnaroundMin: 4,
    reliability: { delayProb: 0.05, meanDelayMin: 2, cancelProb: 0.005 },
    syncEnabled: true,
  },
  rail: {
    peakHeadwayMin: 8, offPeakHeadwayMin: 15,
    operatingStartMin: 330, operatingEndMin: 1410,
    fleetSize: 0, vehicleCapacity: 900, speedKph: 55,
    dwellBaseSec: 30, dwellPerBoardSec: 1.8, dwellPerAlightSec: 1.4,
    turnaroundMin: 6,
    reliability: { delayProb: 0.04, meanDelayMin: 3, cancelProb: 0.005 },
    syncEnabled: true,
  },
  bus: {
    peakHeadwayMin: 10, offPeakHeadwayMin: 20,
    operatingStartMin: 330, operatingEndMin: 1410,
    fleetSize: 0, vehicleCapacity: 70, speedKph: 18,
    dwellBaseSec: 12, dwellPerBoardSec: 2.5, dwellPerAlightSec: 2,
    turnaroundMin: 3,
    reliability: { delayProb: 0.12, meanDelayMin: 2.5, cancelProb: 0.01 },
    syncEnabled: false,
  },
};

/** Default service plan for a route (fleet auto-sized later from cycle time). */
export function defaultPlanFor(route: TransportRoute): ServicePlan {
  const mode = (route.mode === 'road' ? 'bus' : route.mode) as ServiceMode;
  const d = DEFAULTS[mode];
  // Inherit the infrastructure headway so the baseline simulation is unchanged;
  // off-peak runs at double the peak headway.
  const peak = route.headwayMin;
  return {
    routeId: route.id,
    ...d,
    peakHeadwayMin: peak,
    offPeakHeadwayMin: Math.min(30, peak * 2),
    vehicleCapacity: route.vehicleCapacity,
    speedKph: route.speedKph,
    reliability: { ...d.reliability },
  };
}

/** Peak = AM/PM demand periods; everything else in-window is off-peak. */
export function isPeak(timeMin: number): boolean {
  const p = periodOf(timeMin);
  return p === 'AM' || p === 'PM';
}

/** Scheduled headway at a time, or Infinity outside operating hours. */
export function headwayAt(plan: ServicePlan, timeMin: number): number {
  const t = ((timeMin % 1440) + 1440) % 1440;
  if (t < plan.operatingStartMin || t >= plan.operatingEndMin) return Infinity;
  return isPeak(timeMin) ? plan.peakHeadwayMin : plan.offPeakHeadwayMin;
}

/** Clamp user-provided headways to sane bounds per mode. */
export function clampHeadway(mode: ServiceMode, v: number): number {
  const lo = mode === 'bus' ? 5 : 3;
  return Math.max(lo, Math.min(30, Math.round(v)));
}

/** Default service book for a whole network. */
export function defaultServiceFor(routes: TransportRoute[]): Record<string, ServicePlan> {
  const out: Record<string, ServicePlan> = {};
  for (const r of routes) out[r.id] = defaultPlanFor(r);
  return out;
}
