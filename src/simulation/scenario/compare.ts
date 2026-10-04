// Headless scenario comparison: run base vs modified networks with the same
// seed and report metric deltas from real simulation results.
import type { CityData, SimStats } from '../../types/index.ts';
import type { NetworkData } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { computeStats } from '../statistics.ts';
import { formatCost } from './scenario.ts';
import { computeAccessibility, type AccessibilitySet } from '../analytics/accessibility.ts';
import { computeCoverage, type CoverageSet } from '../analytics/coverage.ts';
import { populationImpact, planningScore, type PlanningScore, type PopulationImpact } from '../analytics/impact.ts';

export const COMPARE_TICKS = 360;

export function runHeadless(seed: number, city: CityData, net: NetworkData, ticks = COMPARE_TICKS): SimStats {
  let sim = createSimulationFromParts(seed, city, net);
  for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
  return computeStats(sim);
}

export interface CompareRow {
  label: string;
  base: string;
  mod: string;
  delta: string;
  /** Percent change (null for text rows). Negative = decrease. */
  pct: number | null;
  /** Whether up or down is an improvement (null = neutral/info). */
  better: 'up' | 'down' | null;
}

function numRow(
  label: string,
  base: number,
  mod: number,
  unit: string,
  better: 'up' | 'down' | null,
  digits = 1,
): CompareRow {
  const d = mod - base;
  const pct = base !== 0 ? (d / Math.abs(base)) * 100 : mod !== 0 ? 100 : 0;
  const sign = d > 0 ? '+' : '';
  return {
    label,
    base: `${base.toFixed(digits)}${unit}`,
    mod: `${mod.toFixed(digits)}${unit}`,
    delta: `${sign}${d.toFixed(digits)}${unit} (${sign}${pct.toFixed(1)}%)`,
    pct: Math.round(pct * 10) / 10,
    better,
  };
}

export function buildCompareRows(base: SimStats, mod: SimStats, costBase: number, costMod: number): CompareRow[] {
  return [
    numRow('Avg travel', base.avgTravelMin, mod.avgTravelMin, ' min', 'down'),
    numRow('Avg wait', base.avgWaitMin, mod.avgWaitMin, ' min', 'down'),
    numRow('Avg transfers', base.avgTransfers, mod.avgTransfers, '', 'down', 2),
    numRow('Transit share', base.transitShare, mod.transitShare, '%', 'up'),
    numRow('Car share', base.carShare, mod.carShare, '%', 'down'),
    numRow('Avg congestion', base.avgCongestion, mod.avgCongestion, '', 'down', 2),
    numRow('Transit boardings', base.boardingsTotal, mod.boardingsTotal, '', 'up', 0),
    {
      label: 'Crowded station',
      base: `${base.crowdedStation} (${base.crowdedCount})`,
      mod: `${mod.crowdedStation} (${mod.crowdedCount})`,
      delta: '—',
      pct: null,
      better: null,
    },
    {
      label: 'Construction cost',
      base: formatCost(costBase),
      mod: formatCost(costMod),
      delta: costMod > costBase ? `+${formatCost(costMod - costBase)}` : '—',
      pct: null,
      better: null,
    },
  ];
}

export interface ScenarioComparison {
  base: SimStats;
  mod: SimStats;
  rows: CompareRow[];
  impact: PopulationImpact;
  baseScore: PlanningScore;
  modScore: PlanningScore;
  baseAccess: AccessibilitySet;
  modAccess: AccessibilitySet;
  baseCoverage: CoverageSet;
  modCoverage: CoverageSet;
}

/** Full base-vs-scenario workup: headless runs plus structural analytics. */
export function compareScenarios(
  seed: number,
  baseCity: CityData,
  baseNet: NetworkData,
  modCity: CityData,
  modNet: NetworkData,
  cost: number,
  thresholdM = 500,
  ticks = COMPARE_TICKS,
): ScenarioComparison {
  const base = runHeadless(seed, baseCity, baseNet, ticks);
  const mod = runHeadless(seed, modCity, modNet, ticks);
  const baseAccess = computeAccessibility({ zones: baseCity.zones, stations: baseNet.stations, connections: baseNet.connections, routes: baseNet.routes });
  const modAccess = computeAccessibility({ zones: modCity.zones, stations: modNet.stations, connections: modNet.connections, routes: modNet.routes });
  const baseCoverage = computeCoverage(baseCity.zones, baseNet.stations, thresholdM);
  const modCoverage = computeCoverage(modCity.zones, modNet.stations, thresholdM);
  const impact = populationImpact(baseAccess, modAccess, baseCity.zones, baseCoverage, modCoverage);
  const baseScore = planningScore(base, baseAccess, baseCoverage);
  const modScore = planningScore(mod, modAccess, modCoverage);

  const rows = buildCompareRows(base, mod, 0, cost);
  const accessDelta = modAccess.cityScore - baseAccess.cityScore;
  const covDelta = modCoverage.pct - baseCoverage.pct;
  const extra: CompareRow[] = [
    {
      label: 'Accessibility',
      base: String(baseAccess.cityScore),
      mod: String(modAccess.cityScore),
      delta: `${accessDelta >= 0 ? '+' : ''}${Math.round(accessDelta * 10) / 10} pts`,
      pct: null,
      better: accessDelta >= 0 ? 'up' : 'down',
    },
    {
      label: 'Coverage',
      base: `${baseCoverage.pct}%`,
      mod: `${modCoverage.pct}%`,
      delta: `${covDelta >= 0 ? '+' : ''}${Math.round(covDelta * 10) / 10}pp`,
      pct: null,
      better: covDelta >= 0 ? 'up' : 'down',
    },
    {
      label: 'Pop. improved',
      base: '—',
      mod: impact.improvedPop.toLocaleString(),
      delta: `${impact.improvedPop.toLocaleString()} gained`,
      pct: null,
      better: null,
    },
    {
      label: 'Pop. worsened',
      base: '—',
      mod: impact.worsenedPop.toLocaleString(),
      delta: impact.worsenedPop > 0 ? `${impact.worsenedPop.toLocaleString()} lost` : 'none',
      pct: null,
      better: null,
    },
    {
      label: 'Planning score',
      base: String(baseScore.total),
      mod: String(modScore.total),
      delta: `${modScore.total >= baseScore.total ? '+' : ''}${Math.round((modScore.total - baseScore.total) * 10) / 10}`,
      pct: null,
      better: modScore.total >= baseScore.total ? 'up' : 'down',
    },
    {
      label: 'Operating cost',
      base: `${base.opCost.toLocaleString()} OCU`,
      mod: `${mod.opCost.toLocaleString()} OCU`,
      delta: opDelta(mod.opCost - base.opCost),
      pct: null,
      better: null,
    },
    {
      label: 'Denied boardings',
      base: base.deniedBoardings.toLocaleString(),
      mod: mod.deniedBoardings.toLocaleString(),
      delta: deniedDelta(mod.deniedBoardings - base.deniedBoardings),
      pct: null,
      better: null,
    },
  ];
  // Insert analytics rows before the cost row.
  const costRow = rows[rows.length - 1];
  const all = [...rows.slice(0, -1), ...extra, costRow];
  return { base, mod, rows: all, impact, baseScore, modScore, baseAccess, modAccess, baseCoverage, modCoverage };
}

function opDelta(d: number): string {
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.round(d).toLocaleString()} OCU`;
}

function deniedDelta(d: number): string {
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.round(d).toLocaleString()}`;
}
