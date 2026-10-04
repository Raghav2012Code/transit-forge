// City growth: deterministic yearly development driven by lagged
// accessibility, capacity headroom, and district appeal.
//
// Formulas (documented, abstract — not calibrated economics):
//   accessMem += (accessScore - accessMem) * LAG_RATE        (infrastructure lag)
//   attract  = 100 * (0.45*mem + 0.20*headroom + 0.15*type + 0.10*road + 0.10*tod)
//   rate     = CITY_GROWTH * (attr/avgAttr) * (damp/avgDamp)  (normalized budget)
//   damp     = (1 - developed01)^1.5                          (diminishing returns)
// Population and jobs clamp at capacity; students/households derive from pop.
import type { CityData, Station, TransportRoute, Zone } from '../../types/index.ts';
import type { DistrictKind } from '../../types/index.ts';
import type { Connection } from '../../types/index.ts';
import type { RoadEdgeState } from '../../types/index.ts';
import type { RoadGraph } from '../traffic/roadGraph.ts';
import { findRoadPath } from '../traffic/roadGraph.ts';
import { computeAccessibility, type AccessibilitySet } from '../analytics/accessibility.ts';
import { buildDemandMatrix } from '../passengers/demand.ts';
import type { DemandMatrix } from '../passengers/demand.ts';
import { carProbability } from '../traffic/modeChoice.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { computeStats } from '../statistics.ts';
import type { SimStats } from '../../types/index.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import { planTrip } from '../passengers/passengers.ts';
import { CAPACITY_BY_KIND, HOUSEHOLD_SIZE, developedShare } from './landUse.ts';

export const BASE_YEAR = 2030;
export const CITY_GROWTH = 0.02;
export const JOB_GROWTH = 0.018;
export const LAG_RATE = 0.4;
export const SIM_TRIPS_SCALE = 50; // 1 / SIM_FRACTION, for real-scale displays

export interface GrowthWorld {
  zones: Zone[];
  stations: Station[];
  connections: Connection[];
  routes: TransportRoute[];
  roadGraph: RoadGraph;
  edgeState: Record<string, RoadEdgeState>;
  zoneRoadAccess: Record<string, string>;
}

export interface GrowthPoint {
  year: number;
  pop: number;
  jobs: number;
  students: number;
  households: number;
  developed01: number;
  transitDay: number;
  carDay: number;
  avgAccess: number;
  avgCongestion: number;
}

/** Road accessibility for a zone: free-flow vs current drive time to the CBD. */
export function zoneRoadScore(world: GrowthWorld, zone: Zone): number {
  const cbd = world.zones.find((z) => z.kind === 'cbd');
  if (!cbd) return 0.7;
  const from = world.zoneRoadAccess[zone.id];
  const to = world.zoneRoadAccess[cbd.id];
  if (!from || !to) return 0.7;
  const free = findRoadPath(world.roadGraph, from, to, (id) => world.roadGraph.freeMin.get(id) ?? 1);
  const now = findRoadPath(world.roadGraph, from, to, (id) => world.edgeState[id]?.currentMin ?? 1);
  if (!free || !now || free.totalMin <= 0) return 0.7;
  return Math.max(0, Math.min(1, free.totalMin / Math.max(0.1, now.totalMin)));
}

/** Rapid-transit proximity bonus: 1 at a metro/rail station, fading by 2km. */
export function todBonus(stations: Station[], x: number, z: number): number {
  let best = Infinity;
  for (const s of stations) {
    if (!s.modes.includes('metro') && !s.modes.includes('rail')) continue;
    best = Math.min(best, Math.hypot(s.pos.x - x, s.pos.z - z));
  }
  if (!Number.isFinite(best)) return 0;
  return Math.max(0, 1 - best / 2000);
}

export function zoneAttractiveness(
  zone: Zone,
  access01: number,
  road01: number,
  tod01: number,
): number {
  // access01 is city-relative (0 = worst zone, 1 = best); see growthStep.
  const appeal = CAPACITY_BY_KIND[zone.kind].typeAppeal;
  const headroom = 1 - zone.developed01;
  const attr =
    0.45 * access01 + 0.2 * headroom + 0.15 * appeal + 0.1 * road01 + 0.1 * tod01;
  return Math.max(0, Math.min(100, attr * 100));
}

function avgVC(world: GrowthWorld): number {
  const ids = Object.keys(world.edgeState);
  if (ids.length === 0) return 0;
  return ids.reduce((s, id) => s + world.edgeState[id].vc, 0) / ids.length;
}

/**
 * Advance all zones by one year (mutates zones in place; caller clones for
 * purity). Returns the year's history point; installs nothing else — the
 * caller rebuilds demand from the returned matrix.
 */
export function growthStep(
  world: GrowthWorld,
  year: number,
  transitShare01: number,
): { point: GrowthPoint; demand: DemandMatrix; access: AccessibilitySet } {
  const access = computeAccessibility({
    zones: world.zones,
    stations: world.stations,
    connections: world.connections,
    routes: world.routes,
  });
  const accessById = new Map(access.zones.map((z) => [z.zoneId, z]));
  const congestion = avgVC(world);

  // Lagged memory + attractiveness first (all zones see the same year).
  // Access enters city-relative (min-max): investment reallocates growth
  // toward improved zones even in an already well-served city. City totals
  // stay on the fixed growth budget, so this cannot run away.
  let minMem = Infinity;
  let maxMem = -Infinity;
  for (const z of world.zones) {
    const score = accessById.get(z.id)?.score ?? 50;
    z.accessScore = Math.round(score * 10) / 10;
    z.accessMem = z.accessMem + (score - z.accessMem) * LAG_RATE;
    minMem = Math.min(minMem, z.accessMem);
    maxMem = Math.max(maxMem, z.accessMem);
  }
  const attrs = new Map<string, number>();
  for (const z of world.zones) {
    const rel = maxMem > minMem ? (z.accessMem - minMem) / (maxMem - minMem) : 0.5;
    const road = zoneRoadScore(world, z);
    const tod = todBonus(world.stations, z.center.x, z.center.z);
    const attr = zoneAttractiveness(z, rel, road, tod);
    z.attractiveness = Math.round(attr * 10) / 10;
    attrs.set(z.id, attr);
  }
  const popW = world.zones.reduce((s, z) => s + z.population, 0);
  const avgAttr = world.zones.reduce((s, z) => s + attrs.get(z.id)! * z.population, 0) / Math.max(1, popW);
  const avgDamp = world.zones.reduce((s, z) => {
    const damp = Math.pow(Math.max(0, 1 - z.developed01), 1.5);
    return s + damp * z.population;
  }, 0) / Math.max(1, popW);

  for (const z of world.zones) {
    const damp = Math.pow(Math.max(0, 1 - z.developed01), 1.5);
    const rel = avgAttr > 0 ? attrs.get(z.id)! / avgAttr : 1;
    const dampN = avgDamp > 0 ? damp / avgDamp : 1;
    const popRate = Math.max(0, Math.min(0.08, CITY_GROWTH * rel * dampN));
    const jobRate = Math.max(0, Math.min(0.08, JOB_GROWTH * rel * dampN));
    const oldPop = z.population;
    const oldJobs = z.jobs;
    z.population = Math.min(z.capacityPop, Math.round(z.population * (1 + popRate)));
    z.jobs = Math.min(z.capacityJobs, Math.round(z.jobs * (1 + jobRate)));
    z.popGrowthRate = oldPop > 0 ? (z.population - oldPop) / oldPop : 0;
    z.jobGrowthRate = oldJobs > 0 ? (z.jobs - oldJobs) / oldJobs : 0;
    z.students = Math.round(z.population * CAPACITY_BY_KIND[z.kind].studentShare);
    z.households = Math.round(z.population / HOUSEHOLD_SIZE);
    z.developed01 = Math.round(developedShare(z) * 1000) / 1000;
  }

  const demand = buildDemandMatrix(world.zones);
  const totalReal = demand.totalDaily * SIM_TRIPS_SCALE;
  const pop = world.zones.reduce((s, z) => s + z.population, 0);
  const jobs = world.zones.reduce((s, z) => s + z.jobs, 0);
  const students = world.zones.reduce((s, z) => s + z.students, 0);
  const households = world.zones.reduce((s, z) => s + z.households, 0);
  const point: GrowthPoint = {
    year,
    pop, jobs, students, households,
    developed01: Math.round((world.zones.reduce((s, z) => s + z.developed01 * z.population, 0) / Math.max(1, pop)) * 1000) / 1000,
    transitDay: Math.round(totalReal * transitShare01),
    carDay: Math.round(totalReal * (1 - transitShare01)),
    avgAccess: access.cityScore,
    avgCongestion: Math.round(congestion * 100) / 100,
  };
  return { point, demand, access };
}

/** Pure multi-year projection: clones zones, loops growthStep, returns history. */
export function growZones(
  zones: Zone[],
  network: {
    stations: Station[];
    connections: Connection[];
    routes: TransportRoute[];
    roadGraph: RoadGraph;
    edgeState: Record<string, RoadEdgeState>;
    zoneRoadAccess: Record<string, string>;
  },
  years: number,
  startYear: number,
  transitShare01: number,
): { zones: Zone[]; history: GrowthPoint[]; demand: DemandMatrix } {
  const cloned: Zone[] = JSON.parse(JSON.stringify(zones)) as Zone[];
  const world: GrowthWorld = {
    zones: cloned,
    stations: network.stations,
    connections: network.connections,
    routes: network.routes,
    roadGraph: network.roadGraph,
    edgeState: network.edgeState,
    zoneRoadAccess: network.zoneRoadAccess,
  };
  const history: GrowthPoint[] = [];
  let demand = buildDemandMatrix(cloned);
  for (let y = 1; y <= years; y++) {
    const step = growthStep(world, startYear + y, transitShare01);
    history.push(step.point);
    demand = step.demand;
  }
  return { zones: cloned, history, demand };
}

export interface DemandLayers {
  origins: Record<string, number>;
  destinations: Record<string, number>;
  work: Record<string, number>;
  education: Record<string, number>;
  transit: Record<string, number>;
  car: Record<string, number>;
}

/** Per-zone daily trip layers in real-scale trips (for demand heatmaps). */
export function computeDemandLayers(input: {
  zones: Zone[];
  demand: DemandMatrix;
  connections: Connection[];
  roadGraph: RoadGraph;
  zoneRoadAccess: Record<string, string>;
  stations: Station[];
  routes: TransportRoute[];
}): DemandLayers {
  // Local lightweight mode split (free-flow road vs scheduled transit waits).
  const headway = new Map(input.routes.map((r) => [r.id, r.headwayMin]));
  const byId = new Map(input.zones.map((z) => [z.id, z]));
  const zero = (): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const z of input.zones) o[z.id] = 0;
    return o;
  };
  const layers: DemandLayers = { origins: zero(), destinations: zero(), work: zero(), education: zero(), transit: zero(), car: zero() };
  for (const pair of input.demand.pairs) {
    const oz = byId.get(pair.from);
    const dz = byId.get(pair.to);
    if (!oz || !dz) continue;
    const real = pair.daily * SIM_TRIPS_SCALE;
    layers.origins[pair.from] += real;
    layers.destinations[pair.to] += real;
    const kind = dz.kind;
    if (kind === 'cbd' || kind === 'industrial' || kind === 'harbor') layers.work[pair.from] += real;
    if (kind === 'university') layers.education[pair.from] += real;
    // Mode split estimate for this pair.
    const trip = planTrip(input.connections, accessOf(input, pair.from), accessOf(input, pair.to));
    const road = findRoadPath(
      input.roadGraph,
      input.zoneRoadAccess[pair.from] ?? '',
      input.zoneRoadAccess[pair.to] ?? '',
      (id) => input.roadGraph.freeMin.get(id) ?? 1,
    );
    let pCar = 0.5;
    if (trip && road) {
      let wait = 0;
      const seen = new Set<string>();
      for (const leg of trip.legs) {
        if (!seen.has(leg.routeId)) {
          seen.add(leg.routeId);
          wait += (headway.get(leg.routeId) ?? 10) / 2;
        }
      }
      pCar = carProbability(trip.totalMin + wait, trip.legs.length - 1, road.totalMin, dz.kind);
    } else if (road && !trip) {
      pCar = 1;
    } else if (!road && trip) {
      pCar = 0;
    }
    layers.transit[pair.from] += real * (1 - pCar);
    layers.car[pair.from] += real * pCar;
  }
  for (const k of Object.keys(layers.origins)) {
    layers.origins[k] = Math.round(layers.origins[k]);
    layers.destinations[k] = Math.round(layers.destinations[k]);
    layers.work[k] = Math.round(layers.work[k]);
    layers.education[k] = Math.round(layers.education[k]);
    layers.transit[k] = Math.round(layers.transit[k]);
    layers.car[k] = Math.round(layers.car[k]);
  }
  return layers;
}

function accessOf(input: { stations: Station[]; zones: Zone[] }, zoneId: string): string {
  const z = input.zones.find((zz) => zz.id === zoneId);
  if (!z) return '';
  let best = '';
  let bestD = Infinity;
  for (const s of input.stations) {
    const d = Math.hypot(s.pos.x - z.center.x, s.pos.z - z.center.z);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

/** Small local logit mirroring the mode-choice weights (analytics estimate). */
export function carShareEstimate(transitMin: number, transfers: number, roadMin: number, destKind: DistrictKind): number {
  return carProbability(transitMin, transfers, roadMin, destKind);
}

export interface Warning {
  level: 'warn' | 'info';
  text: string;
}

export interface Recommendation {
  intervention: string;
  reason: string;
  metrics: string;
  area: string;
}

export interface PlanAdvice {
  warnings: Warning[];
  recommendations: Recommendation[];
}

/** Rule-based warnings + recommendations from thresholds (max 6, prioritized). */export function planAdvice(input: {
  zones: Zone[];
  stations: Station[];
  routes: TransportRoute[];
  counters: { routePeakOcc: Record<string, number>; routeBoardings: Record<string, number> };
  edgeState: Record<string, RoadEdgeState>;
  roadGraph: RoadGraph;
  cityPopGrowth: number;
}): PlanAdvice {
  const warnings: Warning[] = [];
  const recommendations: Recommendation[] = [];

  for (const z of input.zones) {
    if (z.developed01 > 0.9) {
      warnings.push({ level: 'warn', text: `${z.name} is approaching development capacity (${Math.round(z.developed01 * 100)}% developed).` });
    }
  }
  const proj = 1 + input.cityPopGrowth;
  for (const r of input.routes) {
    const peak = input.counters.routePeakOcc[r.id] ?? 0;
    const yearsToFull = peak > 0 && peak < 1 && proj > 1 ? Math.log(1 / peak) / Math.log(proj) : Infinity;
    if (peak >= 1) {
      warnings.push({ level: 'warn', text: `${r.name} is over 100% peak occupancy.` });
      recommendations.push({
        intervention: `Increase ${r.name} frequency or vehicle size.`,
        reason: `Peak occupancy ${(peak * 100).toFixed(0)}% with denied boardings likely.`,
        metrics: `peak ${(peak * 100).toFixed(0)}%, boardings ${Math.round(input.counters.routeBoardings[r.id] ?? 0)}/day`,
        area: r.name,
      });
    } else if (yearsToFull < 6) {
      warnings.push({ level: 'info', text: `${r.name} is projected to exceed 100% peak capacity within ${Math.max(1, Math.ceil(yearsToFull))} years.` });
    }
  }
  for (const id in input.edgeState) {
    const st = input.edgeState[id];
    if (st.vc > 0.95) {
      const e = input.roadGraph.edgeById.get(id);
      const label = e ? `${e.a.replace(/^rn-/, '').toUpperCase()}–${e.b.replace(/^rn-/, '').toUpperCase()}` : id;
      warnings.push({ level: 'warn', text: `Road ${label} is severely congested (V/C ${st.vc.toFixed(2)}).` });
    }
  }
  for (const z of input.zones) {
    if (z.popGrowthRate > 0.04 && z.accessScore < 45) {
      warnings.push({ level: 'info', text: `${z.name} has high population growth but weak rapid-transit access.` });
      recommendations.push({
        intervention: `Add rapid transit serving ${z.name}.`,
        reason: `Growth +${(z.popGrowthRate * 100).toFixed(1)}%/yr with access score ${z.accessScore.toFixed(0)}.`,
        metrics: `pop ${z.population.toLocaleString()}, access ${z.accessScore.toFixed(0)}`,
        area: z.name,
      });
    }
  }

  const rank = (w: Warning) => (w.level === 'warn' ? 0 : 1);
  warnings.sort((a, b) => rank(a) - rank(b));
  return { warnings: warnings.slice(0, 6), recommendations: recommendations.slice(0, 4) };
}

export interface ForecastInput {
  zones: Zone[];
  city: CityData;
  stations: Station[];
  connections: Connection[];
  routes: TransportRoute[];
  routeLengths: Map<string, number>;
  routeCumDist: Map<string, number[]>;
  roadGraph: RoadGraph;
  edgeState: Record<string, RoadEdgeState>;
  zoneRoadAccess: Record<string, string>;
  service?: Record<string, ServicePlan>;
  startYear: number;
  transitShare01: number;
}

export interface ForecastResult {
  years: number;
  history: GrowthPoint[];
  endStats: SimStats;
  endAccess: number;
}

/**
 * Single-scenario forecast: grow N years from the given zones, then sample
 * transport with a representative 360-tick run at the horizon. Labeled as
 * simulation forecast, not prediction.
 */
export function forecastGrowth(seed: number, input: ForecastInput, years: number): ForecastResult {
  const grown = growZones(
    input.zones,
    {
      stations: input.stations,
      connections: input.connections,
      routes: input.routes,
      roadGraph: input.roadGraph,
      edgeState: input.edgeState,
      zoneRoadAccess: input.zoneRoadAccess,
    },
    years,
    input.startYear,
    input.transitShare01,
  );
  const grownCity: CityData = { ...input.city, zones: grown.zones };
  let sim = createSimulationFromParts(seed, grownCity, {
    stations: input.stations,
    routes: input.routes,
    connections: input.connections,
    routeLengths: input.routeLengths,
    routeCumDist: input.routeCumDist,
    service: input.service,
  });
  for (let i = 0; i < 360; i++) sim = stepSimulation(sim, 1);
  const endStats = computeStats(sim);
  const endAccess = computeAccessibility({
    zones: grown.zones,
    stations: input.stations,
    connections: input.connections,
    routes: input.routes,
  }).cityScore;
  return { years, history: grown.history, endStats, endAccess };
}
