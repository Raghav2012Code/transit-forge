// Planning objectives, constraints, and metric evaluation.
// Every value traces back to real simulation state via MetricsBundle.
import type { SimStats } from '../../types/index.ts';
import type { AccessibilitySet } from '../analytics/accessibility.ts';
import type { CoverageSet } from '../analytics/coverage.ts';

export type ObjectiveCategory =
  | 'accessibility' | 'capacity' | 'congestion' | 'mode-share'
  | 'growth' | 'resilience' | 'financial';

export type MetricKey =
  | 'avg-travel' | 'avg-wait' | 'peak-crowding' | 'transit-share' | 'car-share'
  | 'congestion' | 'accessibility' | 'coverage' | 'denied' | 'op-cost'
  | 'construction-cost' | 'population' | 'jobs' | 'resilience-score'
  | 'revenue' | 'cost-recovery' | 'subsidy'
  | 'access-zone' | 'crowd-route' | 'road-vc';

export type CompareOp = '<' | '>' | '<=' | '>=';

export interface Objective {
  id: string;
  title: string;
  description: string;
  category: ObjectiveCategory;
  metric: MetricKey;
  /** Optional target id (zone / route / road edge depending on metric). */
  targetId?: string;
  op: CompareOp;
  target: number;
  horizonYears: number;
}

export type ConstraintKind = 'budget' | 'op-cost' | 'subsidy' | 'stations' | 'districts';

export interface PlanConstraint {
  id: string;
  label: string;
  kind: ConstraintKind;
  limit: number;
}

/** Everything an evaluation can read. All values are real, never scripted. */
export interface MetricsBundle {
  stats: SimStats;
  access: AccessibilitySet;
  coverage: CoverageSet;
  routePeakOcc: Record<string, number>;
  edgeVC: Record<string, number>;
  resilienceScore: number | null;
  constructionCost: number;
}

/** Read one metric from the bundle. Null when unavailable. */
export function readMetric(b: MetricsBundle, metric: MetricKey, targetId?: string): number | null {
  const s = b.stats;
  switch (metric) {
    case 'avg-travel': return s.avgTravelMin;
    case 'avg-wait': return s.avgWaitMin;
    case 'peak-crowding': return s.maxOccupancy;
    case 'transit-share': return s.transitShare;
    case 'car-share': return s.carShare;
    case 'congestion': return s.avgCongestion;
    case 'accessibility': return b.access.cityScore;
    case 'coverage': return b.coverage.pct;
    case 'denied': return s.deniedBoardings;
    case 'op-cost': return s.opCost;
    case 'revenue': return s.revenue;
    case 'cost-recovery': return s.costRecovery;
    case 'subsidy': return s.subsidy;
    case 'construction-cost': return b.constructionCost;
    case 'population': return s.population;
    case 'jobs': return s.jobs;
    case 'resilience-score': return b.resilienceScore;
    case 'access-zone': {
      if (!targetId) return null;
      const z = b.access.zones.find((x) => x.zoneId === targetId);
      return z ? z.score : null;
    }
    case 'crowd-route': {
      if (!targetId) return null;
      const v = b.routePeakOcc[targetId];
      return v === undefined ? null : v * 100;
    }
    case 'road-vc': {
      if (!targetId) return null;
      const v = b.edgeVC[targetId];
      return v === undefined ? null : v * 100;
    }
    default:
      return null;
  }
}

export function metricUnit(metric: MetricKey): string {
  switch (metric) {
    case 'avg-travel': case 'avg-wait': return ' min';
    case 'peak-crowding': case 'transit-share': case 'car-share':
    case 'accessibility': case 'coverage': case 'resilience-score':
    case 'cost-recovery': return '%';
    case 'denied': case 'population': case 'jobs': return '';
    case 'op-cost': case 'revenue': case 'subsidy': return ' OCU';
    case 'construction-cost': return ' ₹';
    case 'access-zone': return ' pts';
    case 'crowd-route': case 'road-vc': return '%';
    default: return '';
  }
}

export interface ObjectiveResult {
  objectiveId: string;
  value: number | null;
  passed: boolean;
  /** 0..1 progress from baseline toward target (1 = met or exceeded). */
  progress: number;
}

function compare(op: CompareOp, value: number, target: number): boolean {
  switch (op) {
    case '<': return value < target;
    case '>': return value > target;
    case '<=': return value <= target;
    case '>=': return value >= target;
  }
}

/** Evaluate one objective. Baseline anchors the progress bar. */
export function evaluateObjective(
  o: Objective,
  bundle: MetricsBundle,
  baselineValue: number | null,
): ObjectiveResult {
  const value = readMetric(bundle, o.metric, o.targetId);
  if (value === null) return { objectiveId: o.id, value, passed: false, progress: 0 };
  const passed = compare(o.op, value, o.target);
  let progress: number;
  if (passed) {
    progress = 1;
  } else if (baselineValue === null || baselineValue === o.target) {
    progress = 0;
  } else {
    const improvingDown = o.op === '<' || o.op === '<=';
    const total = improvingDown ? baselineValue - o.target : o.target - baselineValue;
    const done = improvingDown ? baselineValue - value : value - baselineValue;
    progress = total <= 0 ? 0 : Math.max(0, Math.min(1, done / total));
  }
  return { objectiveId: o.id, value, passed, progress: Math.round(progress * 100) / 100 };
}

export interface ConstraintResult {
  constraintId: string;
  value: number;
  passed: boolean;
}

export interface ConstraintInputs {
  constructionCost: number;
  opCostPerDay: number;
  subsidyPerDay: number;
  newStations: number;
  districtsAffected: number;
}

/** Evaluate constraints against real project data. */
export function evaluateConstraints(
  constraints: PlanConstraint[],
  inputs: ConstraintInputs,
): ConstraintResult[] {
  return constraints.map((c) => {
    const value =
      c.kind === 'budget' ? inputs.constructionCost
      : c.kind === 'op-cost' ? inputs.opCostPerDay
      : c.kind === 'subsidy' ? inputs.subsidyPerDay
      : c.kind === 'stations' ? inputs.newStations
      : inputs.districtsAffected;
    return { constraintId: c.id, value, passed: value <= c.limit };
  });
}
