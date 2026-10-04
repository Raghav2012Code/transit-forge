import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import {
  evaluateConstraints,
  evaluateObjective,
  readMetric,
  type MetricsBundle,
  type Objective,
} from '../planning/objectives.ts';
import { generateBriefs } from '../planning/briefs.ts';
import { detectProblems } from '../planning/problems.ts';
import { recommendFor, type RecContext } from '../planning/recommendations.ts';
import { summarizeOps } from '../planning/intervention.ts';
import { buildReport, reportToHtml, reportToJson, reportToText } from '../planning/report.ts';
import { evaluatePlan } from '../scenario/evaluate.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { deletePlan, listPlans, savePlan } from '../planning/planStore.ts';
import { buildUtilization } from '../analytics/utilization.ts';
import { computeAccessibility } from '../analytics/accessibility.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import type { EditOp } from '../scenario/scenario.ts';

const SEED = 1337;

function bundle(over: Partial<MetricsBundle> = {}): MetricsBundle {
  return {
    stats: {
      population: 100000, jobs: 50000, stationCount: 10, routeCount: 4, vehicleCount: 20,
      generated: 5000, completed: 4500, activeNow: 500, waitingNow: 200, onboardNow: 300,
      avgTravelMin: 28, avgWaitMin: 4, avgTransfers: 0.4, boardingsTotal: 6000,
      metroShare: 40, railShare: 20, busShare: 40,
      topStation: 'Central', topStationCount: 1000, crowdedStation: 'Central', crowdedCount: 120,
      topRoute: 'M1', topRouteCount: 2000, maxOccupancy: 80,
      roadTrips: 4000, roadCompleted: 3800, activeCars: 150, avgRoadMin: 12, avgCongestion: 0.6,
      worstRoad: 'R1', worstVC: 0.9, transitShare: 55, carShare: 45, avgTransitMin: 28,
      deniedBoardings: 50, avgOcc: 60, vehKm: 500, vehHr: 40, opCost: 8000, opCostPerPax: 1.5,
      avgHeadway: 8, totalDelayMin: 100, rerouted: 0, strandedNow: 0, strandedPeak: 0,
      cancelledTrips: 0, activeIncidents: 0,
    },
    access: { cityScore: 72, zones: [] },
    coverage: { pct: 80, perZone: [], coveredPop: 80000, totalPop: 100000, thresholdM: 500, metroPop: 0, railPop: 0, busPop: 0 },
    routePeakOcc: {},
    edgeVC: {},
    resilienceScore: null,
    constructionCost: 0,
    ...over,
  };
}

describe('objectives', () => {
  const obj = (partial: Partial<Objective>): Objective => ({
    id: 'o1', title: 'T', description: 'D', category: 'capacity',
    metric: 'peak-crowding', op: '<', target: 85, horizonYears: 5, ...partial,
  });

  it('passes, fails, and reports progress from a baseline', () => {
    const b = bundle();
    expect(evaluateObjective(obj({}), b, 95).passed).toBe(true);
    expect(evaluateObjective(obj({}), b, 95).progress).toBe(1);
    expect(evaluateObjective(obj({ op: '>', target: 90 }), b, 70).passed).toBe(false);
    const mid = evaluateObjective(obj({}), { ...b, stats: { ...b.stats, maxOccupancy: 90 } }, 95);
    expect(mid.passed).toBe(false);
    expect(mid.progress).toBeCloseTo(0.5, 5);
  });

  it('handles multiple objectives and missing targets gracefully', () => {
    const b = bundle();
    expect(evaluateObjective(obj({ metric: 'crowd-route' }), b, 50).passed).toBe(false);
    expect(evaluateObjective(obj({ metric: 'crowd-route' }), b, 50).value).toBeNull();
    expect(evaluateObjective(obj({ metric: 'access-zone', targetId: 'nope', op: '>', target: 10 }), b, 0).value).toBeNull();
  });

  it('reads zone, route, and edge metrics', () => {
    const b = bundle({
      access: { cityScore: 70, zones: [{ zoneId: 'z1', zoneName: 'Z', accessStation: null, walkMin: 5, toCBD: 20, toUniv: 20, toAirport: 20, toIndustrial: 20, toHarbor: 20, avgToMajors: 20, reach15: 1, reach30: 3, reach45: 5, score: 66, grade: 'good' }] },
      routePeakOcc: { 'rt-m1': 0.97 },
      edgeVC: { 're-1': 0.9 },
    });
    expect(readMetric(b, 'access-zone', 'z1')).toBe(66);
    expect(readMetric(b, 'crowd-route', 'rt-m1')).toBe(97);
    expect(readMetric(b, 'road-vc', 're-1')).toBe(90);
  });
});

describe('constraints', () => {
  it('enforces budget, operating cost, and infrastructure limits', () => {
    const cons = [
      { id: 'c1', label: 'Budget', kind: 'budget' as const, limit: 1000 },
      { id: 'c2', label: 'Op cost', kind: 'op-cost' as const, limit: 9000 },
      { id: 'c3', label: 'Stations', kind: 'stations' as const, limit: 2 },
      { id: 'c4', label: 'Districts', kind: 'districts' as const, limit: 5 },
    ];
    const pass = evaluateConstraints(cons, { constructionCost: 800, opCostPerDay: 8000, newStations: 2, districtsAffected: 3 });
    expect(pass.every((r) => r.passed)).toBe(true);
    const fail = evaluateConstraints(cons, { constructionCost: 1200, opCostPerDay: 8000, newStations: 2, districtsAffected: 3 });
    expect(fail.find((r) => r.constraintId === 'c1')?.passed).toBe(false);
  });
});

describe('briefs', () => {
  it('generates deterministic applicable briefs', () => {
    const city = generateCity(SEED);
    const facts = {
      transitShare: 50, avgCongestion: 0.9, avgTravelMin: 30, maxOccupancy: 97,
      accessScore: 70, coveragePct: 80, opCost: 8000, population: 200000,
      worstRoute: { id: 'rt-m1', name: 'M1', occ: 97 },
      worstEdge: { id: 're-1', label: 'R1', vc: 95 },
      worstBridge: { id: 're-2', label: 'B1', vc: 90 },
      lowAccessZones: [{ id: 'z1', name: 'North', score: 50, population: 30000 }],
      growthZones: [{ id: 'z1', name: 'North', popGrowthRate: 0.04, population: 30000 }],
      airportZone: { id: 'za', name: 'Airport', jobs: 12000 },
      centralStationId: 'st-central',
      busiestRouteId: 'rt-m1',
    };
    void city;
    const a = generateBriefs(facts, 'medium', 8000);
    const b = generateBriefs(facts, 'medium', 8000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
    for (const brief of a) {
      expect(brief.objectives.length).toBeGreaterThan(0);
      expect(brief.horizonYears).toBe(5);
    }
    expect(a.some((x) => x.id === 'overcrowding')).toBe(true);
    const expert = generateBriefs(facts, 'expert', 8000);
    expect(expert.find((x) => x.id === 'network-resilience')).toBeDefined();
    expect(expert[0].horizonYears).toBe(20);
  });
});

describe('problems and recommendations', () => {
  const ctx: RecContext = {
    routePeakOcc: { 'rt-m1': 0.97 },
    routeHeadway: { 'rt-m1': 6 },
    routeBoardings: { 'rt-m1': 5000 },
    edgeVC: { 're-1': 0.9 },
    zoneAccess: { z1: 70 },
    zoneGrowth: { z1: 0.01 },
    transitAccessibility: 70,
    criticalRoutes: [],
    criticalBridges: [],
  };

  it('detects ranked problems with drill-down data', () => {
    const problems = detectProblems({
      bottlenecks: {
        stations: [],
        routes: [{ kind: 'route', id: 'rt-m1', label: 'M1', metric: 'peak occupancy', value: 97, detail: 'x' }],
        roads: [{ kind: 'road', id: 're-1', label: 'R1', metric: 'V/C ratio', value: 0.9, detail: 'y' }],
      },
      gaps: [],
      zones: [{ id: 'z1', name: 'Z', population: 10000, popGrowthRate: 0.01, accessScore: 70 }],
      routes: [{ id: 'rt-m1', name: 'M1', mode: 'metro' }],
      routeBoardings: { 'rt-m1': 5000 },
      routePeakOcc: { 'rt-m1': 0.97 },
      criticalRoutes: [],
      criticalBridges: [],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.length).toBeLessThanOrEqual(8);
    const first = problems[0];
    expect(first.severity).toBeGreaterThanOrEqual(problems[problems.length - 1].severity);
    expect(first.metrics.length).toBeGreaterThan(0);
    expect(first.why.length).toBeGreaterThan(0);
  });

  it('fires each recommendation rule with its triggering metric', () => {
    const crowd = detectProblems({
      bottlenecks: {
        stations: [],
        routes: [{ kind: 'route', id: 'rt-m1', label: 'M1', metric: 'peak occupancy', value: 97, detail: 'x' }],
        roads: [],
      },
      gaps: [],
      zones: [{ id: 'z1', name: 'Z', population: 10000, popGrowthRate: 0.01, accessScore: 70 }],
      routes: [{ id: 'rt-m1', name: 'M1', mode: 'metro' }],
      routeBoardings: { 'rt-m1': 5000 },
      routePeakOcc: { 'rt-m1': 0.97 },
      criticalRoutes: [],
      criticalBridges: [],
    })[0];
    const recs = recommendFor(crowd, ctx);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].why.join(' ')).toContain('97');

    const cong = detectProblems({
      bottlenecks: {
        stations: [],
        routes: [],
        roads: [{ kind: 'road', id: 're-1', label: 'R1', metric: 'V/C ratio', value: 0.9, detail: 'y' }],
      },
      gaps: [],
      zones: [{ id: 'z1', name: 'Z', population: 10000, popGrowthRate: 0.01, accessScore: 70 }],
      routes: [],
      routeBoardings: {},
      routePeakOcc: {},
      criticalRoutes: [],
      criticalBridges: [],
    })[0];
    const recs2 = recommendFor(cong, ctx);
    expect(recs2.length).toBeGreaterThan(0);
    expect(recs2[0].intervention.toLowerCase()).toContain('transit');
  });

  it('flags over-service with its metric', () => {
    const low = { ...ctx, routePeakOcc: { 'rt-b9': 0.1 }, routeBoardings: { 'rt-b9': 100 } };
    const problems = detectProblems({
      bottlenecks: { stations: [], routes: [], roads: [] },
      gaps: [],
      zones: [{ id: 'z1', name: 'Z', population: 10000, popGrowthRate: 0.01, accessScore: 70 }],
      routes: [{ id: 'rt-b9', name: 'B9', mode: 'bus' }],
      routeBoardings: { 'rt-b9': 100 },
      routePeakOcc: { 'rt-b9': 0.1 },
      criticalRoutes: [],
      criticalBridges: [],
    });
    const over = problems.find((p) => p.kind === 'overservice');
    expect(over).toBeDefined();
    expect(recommendFor(over!, low)[0].intervention.toLowerCase()).toContain('frequency');
  });
});

describe('intervention summary and reports', () => {
  const city = generateCity(SEED);
  const base = buildNetwork();
  const ops: EditOp[] = [
    { type: 'addStation', station: { id: 'st-x1', name: 'X1', x: 10, z: 10, capacityPerHr: 3000 } },
    { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 5 } },
  ];

  it('summarizes ops from real scenario state', () => {
    const mod = applyEdits(city, base, ops);
    const baseRoadKm = city.roadEdges.reduce((s, e) => s + e.lengthM / 1000, 0);
    const modRoadKm = mod.city.roadEdges.reduce((s, e) => s + e.lengthM / 1000, 0);
    const summary = summarizeOps(ops, base, mod, modRoadKm, baseRoadKm);
    expect(summary.newStations).toBe(1);
    expect(summary.infra.join(' ')).toContain('X1');
    expect(summary.service.join(' ')).toContain('5 min');
  });

  it('evaluates plans deterministically end to end', { timeout: 60000 }, () => {
    const run = () => evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops,
      objectives: [
        { id: 'o1', title: 'Wait', description: '', category: 'capacity', metric: 'avg-wait', op: '<', target: 8, horizonYears: 0 },
      ],
      constraints: [{ id: 'c1', label: 'Budget', kind: 'budget', limit: 200_00_00_000 }],
      horizonYears: 0,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    const a = run();
    const b = run();
    expect(a.passed).toBe(b.passed);
    expect(a.score.total).toBe(b.score.total);
    expect(a.objectiveResults.length).toBe(1);
    expect(a.constraintResults.length).toBe(1);
    expect(a.intervention.newStations).toBe(1);
  });

  it('builds deterministic reports with all sections and exports', () => {
    const ev = evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops,
      objectives: [
        { id: 'o1', title: 'Wait', description: '', category: 'capacity', metric: 'avg-wait', op: '<', target: 8, horizonYears: 0 },
      ],
      constraints: [],
      horizonYears: 0,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    const input = {
      title: 'Plan — T',
      briefTitle: 'T',
      briefParagraphs: ['p'],
      horizonYears: 0,
      objectives: [
        { id: 'o1', title: 'Wait', description: '', category: 'capacity' as const, metric: 'avg-wait' as const, op: '<' as const, target: 8, horizonYears: 0 },
      ],
      objectiveResults: ev.objectiveResults,
      constraints: [],
      constraintResults: ev.constraintResults,
      comparisonRows: ev.rows,
      resilienceRows: ev.resilienceRows,
      intervention: ev.intervention,
      constructionCost: ev.mod.cost,
      opCost: ev.plan.stats.opCost,
      score: ev.score,
    };
    const r1 = buildReport(input);
    const r2 = buildReport(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(['PASSED', 'FAILED']).toContain(r1.verdict);
    expect(r1.performance.length).toBeGreaterThan(0);
    expect(r1.cost.construction.length).toBeGreaterThan(0);
    const text = reportToText(r1);
    for (const section of ['PROBLEM', 'INTERVENTION', 'OBJECTIVES', 'PERFORMANCE', 'TRADEOFFS', 'COST', 'SCORE']) {
      expect(text).toContain(section);
    }
    expect(reportToJson(r1)).toContain(r1.verdict);
    expect(reportToHtml(r1)).toContain('<html>');
  });

  it('evaluates a 1-year horizon plan', () => {
    const ev = evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops,
      objectives: [
        { id: 'o1', title: 'Crowd', description: '', category: 'capacity', metric: 'peak-crowding', op: '<', target: 120, horizonYears: 1 },
      ],
      constraints: [],
      horizonYears: 1,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    expect(ev.horizonYears).toBe(1);
    expect(ev.objectiveResults[0].passed).toBe(true);
  });

  it('persists plans without throwing when storage is unavailable', () => {
    const before = listPlans();
    expect(Array.isArray(before)).toBe(true);
    savePlan({
      id: 'plan-test-1', name: 'T', seed: SEED, briefId: null, ops: [],
      objectives: [], constraints: [], horizonYears: 5, createdAt: 0, attempts: [],
    });
    deletePlan('plan-test-1');
    expect(listPlans().some((p) => p.id === 'plan-test-1')).toBe(false);
  });

  it('generates briefs from a live snapshot and evaluates a crowd objective', () => {
    const city = generateCity(SEED);
    const base = buildNetwork();
    let sim = createSimulationFromParts(SEED, city, base);
    for (let i = 0; i < 120; i++) sim = stepSimulation(sim, 1);
    const util = buildUtilization(sim);
    const access = computeAccessibility({ zones: sim.city.zones, stations: sim.stations, connections: sim.connections, routes: sim.routes });
    const worstRouteRow = [...util.routes].sort((a, b) => b.peakOcc - a.peakOcc)[0];
    const worstRoadRow = [...util.roads].sort((a, b) => b.vc - a.vc)[0];
    const airport = sim.city.zones.find((z) => z.kind === 'airport') ?? null;
    const central = [...sim.stations].sort((a, b) => b.routeIds.length - a.routeIds.length)[0] ?? null;
    const briefs = generateBriefs({
      transitShare: sim.counters.completed > 0 ? 50 : 50,
      avgCongestion: 0.9,
      avgTravelMin: 30,
      maxOccupancy: 97,
      accessScore: access.cityScore,
      coveragePct: 80,
      opCost: 8000,
      population: 200000,
      worstRoute: worstRouteRow ? { id: worstRouteRow.id, name: worstRouteRow.name, occ: worstRouteRow.peakOcc } : null,
      worstEdge: worstRoadRow ? { id: worstRoadRow.id, label: worstRoadRow.label, vc: worstRoadRow.vc * 100 } : null,
      worstBridge: null,
      lowAccessZones: [...access.zones].sort((a, b) => a.score - b.score).slice(0, 3).map((z) => {
        const zn = sim.city.zones.find((x) => x.id === z.zoneId);
        return { id: z.zoneId, name: z.zoneName, score: z.score, population: zn?.population ?? 0 };
      }),
      growthZones: [...sim.city.zones].sort((a, b) => b.popGrowthRate - a.popGrowthRate).slice(0, 3).map((z) => ({
        id: z.id, name: z.name, popGrowthRate: z.popGrowthRate, population: z.population,
      })),
      airportZone: airport ? { id: airport.id, name: airport.name, jobs: airport.jobs } : null,
      centralStationId: central ? central.id : null,
      busiestRouteId: worstRouteRow ? worstRouteRow.id : null,
    }, 'medium', 8000);
    expect(briefs.length).toBeGreaterThan(0);
    // A service improvement on the worst route evaluates end to end.
    const target = worstRouteRow ? worstRouteRow.id : 'rt-m1';
    const ev = evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops: [{ type: 'setService', routeId: target, patch: { peakHeadwayMin: 3 } }],
      objectives: [
        { id: 'o1', title: 'Crowd', description: '', category: 'capacity', metric: 'crowd-route', targetId: target, op: '<', target: 120, horizonYears: 0 },
      ],
      constraints: [],
      horizonYears: 0,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    expect(ev.objectiveResults[0].value).not.toBeNull();
    expect(ev.passed).toBe(true);
  });
});
