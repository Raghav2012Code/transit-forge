// Plan evaluation: runs the scenario through real simulation and checks
// objectives + constraints. Nothing is scripted; metrics come from runs.
import type { CityData, SimStats } from '../../types/index.ts';
import type { NetworkData } from '../transport/network.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import { applyEdits, type ModifiedNetwork } from './applyEdits.ts';
import {
  compareHorizons,
  compareResilience,
  compareScenarios,
  runHeadlessDetailed,
  type CompareRow,
} from './compare.ts';
import { computeAccessibility, type AccessibilitySet } from '../analytics/accessibility.ts';
import { computeCoverage, type CoverageSet } from '../analytics/coverage.ts';
import { planningScore, type PlanningScore } from '../analytics/impact.ts';
import {
  evaluateConstraints,
  evaluateObjective,
  readMetric,
  type ConstraintInputs,
  type ConstraintResult,
  type MetricsBundle,
  type Objective,
  type ObjectiveResult,
  type PlanConstraint,
} from '../planning/objectives.ts';
import { summarizeOps, type InterventionSummary } from '../planning/intervention.ts';
import type { EditOp } from './scenario.ts';

export interface PlanEvaluation {
  mod: ModifiedNetwork;
  baseline: MetricsBundle;
  plan: MetricsBundle;
  objectiveResults: ObjectiveResult[];
  constraintResults: ConstraintResult[];
  score: PlanningScore;
  passed: boolean;
  rows: CompareRow[];
  resilienceRows: CompareRow[] | null;
  intervention: InterventionSummary;
  horizonYears: number;
}

function bundleOf(
  stats: SimStats,
  access: AccessibilitySet,
  coverage: CoverageSet,
  routePeakOcc: Record<string, number>,
  edgeVC: Record<string, number>,
  resilienceScore: number | null,
  constructionCost: number,
): MetricsBundle {
  return { stats, access, coverage, routePeakOcc, edgeVC, resilienceScore, constructionCost };
}

/** Shared live/project constraint inputs (same function for UI + submit). */
export function constraintInputs(ops: EditOp[], mod: ModifiedNetwork, opCostPerDay: number): ConstraintInputs {
  const newStations = ops.filter((o) => o.type === 'addStation').length;
  const affected = new Set<string>();
  for (const op of ops) {
    if (op.type !== 'addStation') continue;
    for (const z of mod.city.zones) {
      const d = Math.hypot(z.center.x - op.station.x, z.center.z - op.station.z);
      if (d <= z.radius + 800) affected.add(z.id);
    }
  }
  return { constructionCost: mod.cost, opCostPerDay: opCostPerDay, newStations, districtsAffected: affected.size };
}

/** Evaluate a plan: real runs, real metrics, real verdict. Deterministic. */
export function evaluatePlan(input: {
  seed: number;
  baseCity: CityData;
  baseNet: NetworkData;
  ops: EditOp[];
  objectives: Objective[];
  constraints: PlanConstraint[];
  horizonYears: number;
  incident?: IncidentConfig;
  coverageThreshold?: number;
  transitShare01?: number;
}): PlanEvaluation {
  const threshold = input.coverageThreshold ?? 500;
  const share = input.transitShare01 ?? 0.5;
  const mod = applyEdits(input.baseCity, input.baseNet, input.ops);
  let rows: CompareRow[];
  let baseStats: SimStats;
  let modStats: SimStats;
  let baseAccess: AccessibilitySet;
  let modAccess: AccessibilitySet;
  let baseCoverage: CoverageSet;
  let modCoverage: CoverageSet;
  let baseRoutePeakOcc: Record<string, number> = {};
  let modRoutePeakOcc: Record<string, number> = {};
  let baseEdgeVC: Record<string, number> = {};
  let modEdgeVC: Record<string, number> = {};

  if (input.horizonYears > 0) {
    const hz = compareHorizons(
      input.seed, input.baseCity.zones, input.baseCity, input.baseNet,
      mod.city, mod, mod.cost, input.horizonYears, share,
    );
    rows = hz.rows;
    baseStats = hz.base.stats;
    modStats = hz.mod.stats;
    baseRoutePeakOcc = hz.base.routePeakOcc;
    modRoutePeakOcc = hz.mod.routePeakOcc;
    baseEdgeVC = hz.base.edgeVC;
    modEdgeVC = hz.mod.edgeVC;
    baseAccess = computeAccessibility({ zones: hz.base.zones, stations: input.baseNet.stations, connections: input.baseNet.connections, routes: input.baseNet.routes });
    modAccess = computeAccessibility({ zones: hz.mod.zones, stations: mod.stations, connections: mod.connections, routes: mod.routes });
    baseCoverage = computeCoverage(hz.base.zones, input.baseNet.stations, threshold);
    modCoverage = computeCoverage(hz.mod.zones, mod.stations, threshold);
  } else {
    const cmp = compareScenarios(input.seed, input.baseCity, input.baseNet, mod.city, mod, mod.cost, threshold);
    rows = cmp.rows;
    baseStats = cmp.base;
    modStats = cmp.mod;
    baseAccess = cmp.baseAccess;
    modAccess = cmp.modAccess;
    baseCoverage = cmp.baseCoverage;
    modCoverage = cmp.modCoverage;
    // Detailed telemetry only when an objective actually needs it.
    if (input.objectives.some((o) => o.metric === 'crowd-route' || o.metric === 'road-vc')) {
      const baseFull = runHeadlessDetailed(input.seed, input.baseCity, input.baseNet);
      const modFull = runHeadlessDetailed(input.seed, mod.city, mod as NetworkData & { service?: Record<string, ServicePlan> });
      baseRoutePeakOcc = baseFull.routePeakOcc;
      modRoutePeakOcc = modFull.routePeakOcc;
      baseEdgeVC = baseFull.edgeVC;
      modEdgeVC = modFull.edgeVC;
    }
  }

  let resilienceRows: CompareRow[] | null = null;
  let resilienceScoreValue: number | null = null;
  const needsResilience = input.objectives.some((o) => o.metric === 'resilience-score');
  if (needsResilience && input.incident) {
    const cmp = compareResilience(input.seed, input.baseCity, input.baseNet, mod.city, mod, input.incident, 240);
    resilienceRows = cmp.rows;
    resilienceScoreValue = cmp.mod.metrics.score;
  }

  const baseline = bundleOf(baseStats, baseAccess, baseCoverage, baseRoutePeakOcc, baseEdgeVC, null, 0);
  const plan = bundleOf(modStats, modAccess, modCoverage, modRoutePeakOcc, modEdgeVC, resilienceScoreValue, mod.cost);
  const objectiveResults = input.objectives.map((o) =>
    evaluateObjective(o, plan, readMetric(baseline, o.metric, o.targetId)),
  );
  const constraintResults = evaluateConstraints(
    input.constraints,
    constraintInputs(input.ops, mod, modStats.opCost),
  );
  const score = planningScore(modStats, modAccess, modCoverage);
  const passed = objectiveResults.every((r) => r.passed) && constraintResults.every((r) => r.passed);
  const baseRoadKm = input.baseCity.roadEdges.reduce((s, e) => s + e.lengthM / 1000, 0);
  const modRoadKm = mod.city.roadEdges.reduce((s, e) => s + e.lengthM / 1000, 0);
  const intervention = summarizeOps(input.ops, input.baseNet, mod, modRoadKm, baseRoadKm);
  return {
    mod, baseline, plan, objectiveResults, constraintResults, score, passed,
    rows, resilienceRows, intervention, horizonYears: input.horizonYears,
  };
}
