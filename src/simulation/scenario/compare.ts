// Headless scenario comparison: run base vs modified networks with the same
// seed and report metric deltas from real simulation results.
import type { CityData, SimStats, Zone } from '../../types/index.ts';
import type { NetworkData } from '../transport/network.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { computeStats } from '../statistics.ts';
import { samplePoint, type SeriesPoint } from '../analytics/series.ts';
import { formatCost } from './scenario.ts';
import { computeAccessibility, type AccessibilitySet } from '../analytics/accessibility.ts';
import { computeCoverage, type CoverageSet } from '../analytics/coverage.ts';
import { populationImpact, planningScore, type PlanningScore, type PopulationImpact } from '../analytics/impact.ts';
import { BASE_YEAR, growZones, type GrowthPoint } from '../growth/growth.ts';
import { buildEdgeStates, buildZoneRoadAccess } from '../traffic/cars.ts';
import { buildRoadGraph } from '../traffic/roadGraph.ts';
import { capacityLostFor, resilienceScore, type CapacityLost } from '../analytics/resilience.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import type { ResilienceMetrics } from '../../types/index.ts';

export const COMPARE_TICKS = 360;

export function runHeadless(seed: number, city: CityData, net: NetworkData, ticks = COMPARE_TICKS): SimStats {
  return runHeadlessDetailed(seed, city, net, ticks).stats;
}

/** Headless run that also keeps per-route and per-edge telemetry for objectives. */
export function runHeadlessDetailed(
  seed: number,
  city: CityData,
  net: NetworkData,
  ticks = COMPARE_TICKS,
): { stats: SimStats; routePeakOcc: Record<string, number>; edgeVC: Record<string, number> } {
  let sim = createSimulationFromParts(seed, city, net);
  for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
  const edgeVC: Record<string, number> = {};
  for (const id in sim.edgeState) edgeVC[id] = sim.edgeState[id].vc;
  return { stats: computeStats(sim), routePeakOcc: { ...sim.counters.routePeakOcc }, edgeVC };
}

/**
 * Run one whole day, to `endMin`, sampling the chart series on the way (the same cadence as the live
 * day). Timed edits in `net.timed` fire as the clock reaches them, so this is the live day, headless.
 */
export function runDay(
  seed: number,
  city: CityData,
  net: Parameters<typeof createSimulationFromParts>[2],
  endMin: number,
): { stats: SimStats; series: SeriesPoint[] } {
  let sim = createSimulationFromParts(seed, city, net);
  const series: SeriesPoint[] = [];
  let last = 0;
  while (sim.timeMinutes < endMin) {
    sim = stepSimulation(sim, 1);
    if (sim.tick - last >= 5) {
      last = sim.tick;
      series.push(samplePoint(sim));
    }
  }
  return { stats: computeStats(sim), series };
}

export interface ResilienceSide {
  stats: SimStats;
  metrics: ResilienceMetrics;
  capacity: CapacityLost;
}

/** Base-vs-scenario under the SAME disruption (deterministic headless runs). */
export function compareResilience(
  seed: number,
  city: CityData,
  baseNet: NetworkData,
  modCity: CityData,
  modNet: NetworkData & { service?: Record<string, ServicePlan> },
  incident: IncidentConfig,
  ticks = 240,
): { base: ResilienceSide; mod: ResilienceSide; rows: CompareRow[] } {
  const runSide = (
    c: CityData,
    net: NetworkData & { service?: Record<string, ServicePlan> },
  ): ResilienceSide => {
    let sim = createSimulationFromParts(seed, c, net);
    sim.incidents.push({
      ...incident,
      id: incident.id || 'inc-compare',
      status: 'scheduled',
      activeTicks: 0,
      baselineWaiting: 0,
      recovered90: false,
      strandedPeakDuringIncident: 0,
    });
    for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
    const stats = computeStats(sim);
    const cap = capacityLostFor(incident, sim.routes, sim.routeLengths, sim.roadGraph, sim.routeCumDist);
    const totalRouteKm = sim.routes.reduce((s, r) => s + (sim.routeLengths.get(r.id) ?? 0) / 1000, 0);
    const totalRoadKm = sim.roadGraph.edges.reduce((s, e) => s + e.lengthM / 1000, 0);
    const metrics = resilienceScore({
      extraWaitMin: sim.counters.incidentDelayMin,
      completedDelta: Math.max(1, sim.counters.completed),
      strandedPeak: sim.counters.strandedPeak,
      affectedPax: sim.counters.rerouted + sim.counters.strandedPeak,
      routeKmLost: cap.routeKmLost,
      totalRouteKm,
      roadKmLost: cap.roadKmLost,
      totalRoadKm,
      recoveryTicks: sim.incidents.find((x) => x.id === (incident.id || 'inc-compare'))?.result?.recoveryTicks ?? ticks,
    });
    metrics.rerouted = sim.counters.rerouted;
    metrics.cancelledTrips = sim.counters.cancelledTrips;
    metrics.stationsClosed = cap.stationsClosed;
    metrics.transitCapLost = cap.transitCapLost;
    metrics.roadCapLost = cap.roadCapLost;
    return { stats, metrics, capacity: cap };
  };
  const b = runSide(city, baseNet);
  const m = runSide(modCity, modNet);
  const rows: CompareRow[] = [
    numRow('Resilience score', b.metrics.score, m.metrics.score, '', 'up'),
    numRow('Affected pax', b.metrics.affectedPax, m.metrics.affectedPax, '', 'down', 0),
    numRow('Stranded peak', b.metrics.strandedPeak, m.metrics.strandedPeak, '', 'down', 0),
    numRow('Extra wait', b.metrics.extraWaitMin, m.metrics.extraWaitMin, ' min', 'down', 0),
    numRow('Cancelled trips', b.metrics.cancelledTrips, m.metrics.cancelledTrips, '', 'down', 0),
    numRow('Transit share', b.stats.transitShare, m.stats.transitShare, '%', 'up'),
    numRow('Avg wait', b.stats.avgWaitMin, m.stats.avgWaitMin, ' min', 'down'),
  ];
  return { base: b, mod: m, rows };
}

export interface HorizonSide {
  stats: SimStats;
  zones: Zone[];
  history: GrowthPoint[];
  accessScore: number;
  routePeakOcc: Record<string, number>;
  edgeVC: Record<string, number>;
}

export interface HorizonComparison {
  base: HorizonSide;
  mod: HorizonSide;
  rows: CompareRow[];
  years: number;
}

/**
 * Long-term workflow (§19): grow both sides N years from the same live zones
 * (structural accessibility drives development; transport is sampled with a
 * representative 360-tick run at the horizon, not minute-by-minute).
 */
export function compareHorizons(
  seed: number,
  zones: Zone[],
  baseCity: CityData,
  baseNet: NetworkData,
  modCity: CityData,
  modNet: NetworkData & { service?: Record<string, ServicePlan> },
  cost: number,
  years: number,
  transitShare01: number,
): HorizonComparison {
  const runSide = (city: CityData, net: NetworkData & { service?: Record<string, ServicePlan> }): HorizonSide => {
    const roadGraph = buildRoadGraph(city);
    const grown = growZones(
      zones,
      {
        stations: net.stations,
        connections: net.connections,
        routes: net.routes,
        roadGraph,
        edgeState: buildEdgeStates(roadGraph),
        zoneRoadAccess: buildZoneRoadAccess(city),
      },
      years,
      BASE_YEAR,
      transitShare01,
    );
    const grownCity: CityData = { ...city, zones: grown.zones };
    let sim = createSimulationFromParts(seed, grownCity, net);
    for (let i = 0; i < COMPARE_TICKS; i++) sim = stepSimulation(sim, 1);
    const stats = computeStats(sim);
    const access = computeAccessibility({ zones: grown.zones, stations: net.stations, connections: net.connections, routes: net.routes });
    const edgeVC: Record<string, number> = {};
    for (const id in sim.edgeState) edgeVC[id] = sim.edgeState[id].vc;
    return { stats, zones: grown.zones, history: grown.history, accessScore: access.cityScore, routePeakOcc: { ...sim.counters.routePeakOcc }, edgeVC };
  };
  const b = runSide(baseCity, baseNet);
  const m = runSide(modCity, modNet);
  const sum = (zs: Zone[], f: (z: Zone) => number) => zs.reduce((s, z) => s + f(z), 0);
  const rows: CompareRow[] = [
    numRow('Population', sum(b.zones, (z) => z.population), sum(m.zones, (z) => z.population), '', null, 0),
    numRow('Jobs', sum(b.zones, (z) => z.jobs), sum(m.zones, (z) => z.jobs), '', null, 0),
    numRow('Transit/day', b.history[b.history.length - 1]?.transitDay ?? 0, m.history[m.history.length - 1]?.transitDay ?? 0, '', 'up', 0),
    numRow('Car/day', b.history[b.history.length - 1]?.carDay ?? 0, m.history[m.history.length - 1]?.carDay ?? 0, '', 'down', 0),
    numRow('Avg travel', b.stats.avgTravelMin, m.stats.avgTravelMin, ' min', 'down'),
    numRow('Congestion', b.stats.avgCongestion, m.stats.avgCongestion, '', 'down', 2),
    numRow('Crowding', b.stats.maxOccupancy, m.stats.maxOccupancy, '%', 'down'),
    numRow('Accessibility', b.accessScore, m.accessScore, ' pts', 'up'),
    numRow('Transit share', b.stats.transitShare, m.stats.transitShare, '%', 'up'),
    numRow('Op. cost', b.stats.opCost, m.stats.opCost, ' OCU', null, 0),
    numRow('Fare revenue', b.stats.revenue, m.stats.revenue, ' OCU', 'up', 0),
    numRow('Cost recovery', b.stats.costRecovery, m.stats.costRecovery, '%', 'up'),
    numRow('Subsidy', b.stats.subsidy, m.stats.subsidy, ' OCU', 'down', 0),
    {
      label: 'Construction cost',
      base: formatCost(0),
      mod: formatCost(cost),
      delta: cost > 0 ? `+${formatCost(cost)}` : '—',
      pct: null,
      better: null,
    },
  ];
  return { base: b, mod: m, rows, years };
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
    numRow('Fare revenue', base.revenue, mod.revenue, ' OCU', 'up', 0),
    numRow('Cost recovery', base.costRecovery, mod.costRecovery, '%', 'up'),
    numRow('Subsidy', base.subsidy, mod.subsidy, ' OCU', 'down', 0),
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
