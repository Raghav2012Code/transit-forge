// Origin/destination demand: deterministic daily trip matrix between zones,
// modulated by time-of-day profiles. Same seed => same matrix.
import type { DistrictKind, TripPurpose, Zone } from '../../types/index.ts';

export type DayPeriod = 'NIGHT' | 'AM' | 'MID' | 'PM' | 'EVE';

/** Nearest network station per zone (hand-authored access points). */
export const ZONE_ACCESS: Record<string, string> = {
  'z-cbd': 'st-central',
  'z-harbor': 'st-harbor',
  'z-univ': 'st-university',
  'z-ind': 'st-industrial',
  'z-air': 'st-airport',
  'z-res-n': 'st-north-res',
  'z-res-w': 'st-west-res',
  'z-res-e': 'st-east-res',
  'z-sub-s': 'st-south-sub',
  'z-sub-ne': 'st-ne-suburb',
};

/** Share of daily travel in each hour (normalized at load). */
const HOUR_SHARE = [
  0.002, 0.001, 0.001, 0.001, 0.002, 0.008, 0.03, 0.07, 0.1, 0.08, 0.06, 0.055,
  0.06, 0.06, 0.055, 0.05, 0.07, 0.1, 0.08, 0.05, 0.03, 0.015, 0.012, 0.008,
];
const HOUR_NORM = HOUR_SHARE.reduce((s, x) => s + x, 0);

export function hourShare(hour: number): number {
  return HOUR_SHARE[((hour % 24) + 24) % 24] / HOUR_NORM;
}

export function periodOf(timeMin: number): DayPeriod {
  const h = Math.floor(timeMin / 60) % 24;
  if (h < 5) return 'NIGHT';
  if (h < 10) return 'AM';
  if (h < 16) return 'MID';
  if (h < 20) return 'PM';
  if (h < 24) return 'EVE';
  return 'NIGHT';
}

export interface ODPair {
  from: string;
  to: string;
  daily: number;
}

export interface DemandMatrix {
  pairs: ODPair[];
  totalDaily: number;
}

const TRIP_RATE = 0.85;
/** Fraction of real population simulated (keeps agent counts in the thousands). */
export const SIM_FRACTION = 0.02;

/** Destination attraction of zone d for trips from o in a given period. */
export function destWeight(o: Zone, d: Zone, period: DayPeriod, maxJobs: number, maxPop: number): number {
  if (o.id === d.id) return 0;
  const jobPull = d.jobs / Math.max(1, maxJobs);
  const popPull = d.population / Math.max(1, maxPop);
  const originJobHeavy = o.jobs > o.population;
  switch (period) {
    case 'AM':
      // Outbound toward workplaces, university, airport.
      return (0.25 + 3 * jobPull + (d.kind === 'university' ? 2 : 0) + (d.kind === 'airport' ? 0.9 : 0)) *
        (originJobHeavy ? 0.35 : 1);
    case 'MID':
      return 0.5 + jobPull + popPull + (d.kind === 'airport' ? 0.5 : 0) + (d.kind === 'harbor' ? 0.3 : 0);
    case 'PM':
      // Return home toward residential areas.
      return (0.25 + 3 * popPull) * (d.jobs > d.population ? 0.35 : 1);
    case 'EVE':
      return 0.3 + popPull;
    case 'NIGHT':
      return 0.05;
  }
}

/** Deterministic daily matrix built from MID weights (time modulation applied at spawn). */
export function buildDemandMatrix(zones: Zone[]): DemandMatrix {
  const maxJobs = Math.max(...zones.map((z) => z.jobs));
  const maxPop = Math.max(...zones.map((z) => z.population));
  const pairs: ODPair[] = [];
  let totalDaily = 0;
  for (const o of zones) {
    const weights = zones.map((d) => destWeight(o, d, 'MID', maxJobs, maxPop));
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum <= 0) continue;
    const originTrips = o.population * TRIP_RATE * SIM_FRACTION;
    zones.forEach((d, i) => {
      const daily = (originTrips * weights[i]) / sum;
      if (daily > 0.01) {
        pairs.push({ from: o.id, to: d.id, daily });
        totalDaily += daily;
      }
    });
  }
  return { pairs, totalDaily };
}

/** Lightweight trip purpose from O/D district kinds (deterministic). */
export function purposeOf(fromKind: DistrictKind, toKind: DistrictKind): TripPurpose {
  if (toKind === 'airport') return 'airport';
  if (toKind === 'university') return 'education';
  if (toKind === 'industrial') return fromKind === 'industrial' ? 'work' : 'industrial';
  if (toKind === 'cbd') return 'work';
  if (toKind === 'harbor') return 'work';
  if (fromKind === 'residential' || fromKind === 'suburban') return 'shopping';
  return 'other';
}

/** Period modulation factor relative to MID for an O-D pair at time t. */
export function periodFactor(o: Zone, d: Zone, period: DayPeriod, maxJobs: number, maxPop: number): number {
  const mid = destWeight(o, d, 'MID', maxJobs, maxPop);
  if (mid <= 0) return 0;
  return destWeight(o, d, period, maxJobs, maxPop) / mid;
}

/** Expected spawns for a pair in a dt-minute step. Caller samples via rng. */
export function expectedSpawns(pair: ODPair, timeMin: number, dtMin: number): number {
  const h = Math.floor(timeMin / 60) % 24;
  return (pair.daily * hourShare(h) * dtMin) / 60;
}

/** Advance a uint32 RNG state (mulberry32 step). Pure: returns [value, nextState]. */
export function rngNext(state: number): [number, number] {
  let a = (state | 0) + 0x6d2b79f5;
  a |= 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, a | 0];
}
