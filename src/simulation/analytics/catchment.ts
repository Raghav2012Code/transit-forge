// Station catchment: population/jobs within radius R via circle-circle
// overlap with zone discs, plus the station's live throughput stats.
import type { Station, Zone } from '../../types/index.ts';

/** Fraction of circle0 (radius r0) covered by circle1 at center distance d. */
export function circleOverlapFraction(r0: number, r1: number, d: number): number {
  if (d >= r0 + r1) return 0;
  if (d <= Math.abs(r0 - r1)) return r1 >= r0 ? 1 : (r1 * r1) / (r0 * r0);
  const r0sq = r0 * r0;
  const r1sq = r1 * r1;
  const dsq = d * d;
  const a =
    r0sq * Math.acos((dsq + r0sq - r1sq) / (2 * d * r0)) +
    r1sq * Math.acos((dsq + r1sq - r0sq) / (2 * d * r1)) -
    0.5 * Math.sqrt(Math.max(0, (-d + r0 + r1) * (d + r0 - r1) * (d - r0 + r1) * (d + r0 + r1)));
  return Math.max(0, Math.min(1, a / (Math.PI * r0sq)));
}

export interface Catchment {
  stationId: string;
  radiusM: number;
  population: number;
  jobs: number;
  boardedDay: number;
  waiting: number;
  transfersDay: number;
  capacityPerHr: number;
  utilization01: number;
}

export function stationCatchment(station: Station, zones: Zone[], radiusM = 800): Catchment {
  let population = 0;
  let jobs = 0;
  for (const z of zones) {
    const d = Math.hypot(station.pos.x - z.center.x, station.pos.z - z.center.z);
    const frac = circleOverlapFraction(z.radius, radiusM, d);
    population += z.population * frac;
    jobs += z.jobs * frac;
  }
  const utilization01 = Math.min(1.5, station.peakWaiting / Math.max(1, station.capacityPerHr * 0.25));
  return {
    stationId: station.id,
    radiusM,
    population: Math.round(population),
    jobs: Math.round(jobs),
    boardedDay: Math.round(station.boardedDay),
    waiting: Math.round(station.waiting),
    transfersDay: Math.round(station.transfersDay),
    capacityPerHr: station.capacityPerHr,
    utilization01: Math.round(utilization01 * 100) / 100,
  };
}
