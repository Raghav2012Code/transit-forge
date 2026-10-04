// Land-use model: development capacity per district kind plus deterministic
// initialization of growth state. Capacity clamps growth (no runaway).
import type { DistrictKind, Zone } from '../../types/index.ts';

export interface CapacitySpec {
  /** Population capacity as a multiple of initial population. */
  popMultiple: number;
  /** Jobs capacity as a multiple of initial jobs. */
  jobsMultiple: number;
  /** Baseline development appeal of the district type, 0..1. */
  typeAppeal: number;
  /** Share of residents who are students. */
  studentShare: number;
}

export const CAPACITY_BY_KIND: Record<DistrictKind, CapacitySpec> = {
  cbd: { popMultiple: 2.2, jobsMultiple: 2.0, typeAppeal: 0.8, studentShare: 0.08 },
  residential: { popMultiple: 2.8, jobsMultiple: 3.0, typeAppeal: 0.6, studentShare: 0.12 },
  industrial: { popMultiple: 2.0, jobsMultiple: 2.5, typeAppeal: 0.55, studentShare: 0.05 },
  university: { popMultiple: 2.4, jobsMultiple: 2.2, typeAppeal: 0.6, studentShare: 0.45 },
  airport: { popMultiple: 2.5, jobsMultiple: 2.2, typeAppeal: 0.5, studentShare: 0.04 },
  harbor: { popMultiple: 1.8, jobsMultiple: 1.8, typeAppeal: 0.45, studentShare: 0.04 },
  suburban: { popMultiple: 3.0, jobsMultiple: 3.2, typeAppeal: 0.5, studentShare: 0.1 },
};

export const HOUSEHOLD_SIZE = 2.6;

/** Fill growth fields for a freshly generated zone (deterministic). */
export function initGrowthState(zone: Zone): void {
  const spec = CAPACITY_BY_KIND[zone.kind];
  zone.students = Math.round(zone.population * spec.studentShare);
  zone.households = Math.round(zone.population / HOUSEHOLD_SIZE);
  zone.capacityPop = Math.round(zone.population * spec.popMultiple);
  zone.capacityJobs = Math.round(zone.jobs * spec.jobsMultiple);
  zone.developed01 = developedShare(zone);
  zone.attractiveness = 50;
  zone.accessScore = 50;
  zone.accessMem = 50;
  zone.popGrowthRate = 0;
  zone.jobGrowthRate = 0;
}

/** Developed share = the tighter of the population / jobs capacity ratios. */
export function developedShare(zone: Pick<Zone, 'population' | 'jobs' | 'capacityPop' | 'capacityJobs'>): number {
  const p = zone.capacityPop > 0 ? zone.population / zone.capacityPop : 1;
  const j = zone.capacityJobs > 0 ? zone.jobs / zone.capacityJobs : 1;
  return Math.max(0, Math.min(1, Math.max(p, j)));
}
