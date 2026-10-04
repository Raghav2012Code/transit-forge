import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { computeAccessibility } from '../analytics/accessibility.ts';
import { computeCoverage } from '../analytics/coverage.ts';
import { circleOverlapFraction, stationCatchment } from '../analytics/catchment.ts';
import { findBottlenecks } from '../analytics/bottlenecks.ts';
import { findTransitGaps } from '../analytics/gaps.ts';
import { planningScore, populationImpact } from '../analytics/impact.ts';
import { runHeadlessSeries } from '../analytics/series.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { compareScenarios, runHeadless } from '../scenario/compare.ts';
import type { EditOp } from '../scenario/scenario.ts';

const SEED = 1337;
const city = generateCity(SEED);
const base = buildNetwork();
const accessInput = { zones: city.zones, stations: base.stations, connections: base.connections, routes: base.routes };

describe('accessibility', () => {
  it('is deterministic with valid grades and times', () => {
    const a = computeAccessibility(accessInput);
    const b = computeAccessibility(accessInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cityScore).toBeGreaterThanOrEqual(0);
    expect(a.cityScore).toBeLessThanOrEqual(100);
    for (const z of a.zones) {
      expect(['excellent', 'good', 'moderate', 'poor', 'very poor']).toContain(z.grade);
      expect(z.reach15).toBeLessThanOrEqual(z.reach30);
      expect(z.reach30).toBeLessThanOrEqual(z.reach45);
    }
    const resN = a.zones.find((z) => z.zoneId === 'z-res-n');
    expect(resN?.toCBD).not.toBeNull();
    expect(resN?.toCBD ?? 0).toBeGreaterThan(0);
  });

  it('responds to infrastructure removal', () => {
    const before = computeAccessibility(accessInput).cityScore;
    const mod = applyEdits(city, base, [{ type: 'removeRoute', routeId: 'rt-b1' }]);
    const after = computeAccessibility({ zones: mod.city.zones, stations: mod.stations, connections: mod.connections, routes: mod.routes }).cityScore;
    expect(after).toBeLessThanOrEqual(before);
  });
});

describe('coverage and catchment', () => {
  it('measures coverage with threshold sensitivity', () => {
    const narrow = computeCoverage(city.zones, base.stations, 300);
    const wide = computeCoverage(city.zones, base.stations, 800);
    expect(wide.coveredPop).toBeGreaterThanOrEqual(narrow.coveredPop);
    expect(wide.pct).toBeGreaterThanOrEqual(0);
    expect(wide.pct).toBeLessThanOrEqual(100);
    expect(wide.metroPop + wide.railPop + wide.busPop).toBeGreaterThan(0);
    // Deterministic per-zone breakdown sums to the total.
    const sum = wide.perZone.reduce((s, z) => s + z.coveredPop, 0);
    expect(Math.abs(sum - wide.coveredPop)).toBeLessThanOrEqual(wide.perZone.length);
  });

  it('computes geometric catchments', () => {
    expect(circleOverlapFraction(10, 10, 0)).toBeCloseTo(1, 6);
    expect(circleOverlapFraction(10, 10, 25)).toBe(0);
    expect(circleOverlapFraction(10, 20, 0)).toBe(1);
    const central = base.stations.find((s) => s.id === 'st-central');
    if (!central) throw new Error('missing central');
    const c = stationCatchment(central, city.zones, 800);
    expect(c.population).toBeGreaterThan(0);
    expect(c.jobs).toBeGreaterThan(0);
    expect(c.utilization01).toBeGreaterThanOrEqual(0);
  });
});

describe('bottlenecks and gaps', () => {
  it('ranks live bottlenecks in descending order', () => {
    let sim = createSimulationFromParts(SEED, city, base);
    for (let i = 0; i < 120; i++) sim = stepSimulation(sim, 1);
    const out = findBottlenecks({
      stations: sim.stations,
      routes: sim.routes,
      counters: sim.counters,
      edgeState: sim.edgeState,
      roadGraph: sim.roadGraph,
      busRouteCongestion: sim.busRouteCongestion,
    });
    expect(out.stations.length).toBeGreaterThan(0);
    expect(out.routes.length).toBeGreaterThan(0);
    expect(out.roads.length).toBeGreaterThan(0);
    for (const group of [out.stations, out.routes, out.roads]) {
      for (let i = 1; i < group.length; i++) expect(group[i - 1].value).toBeGreaterThanOrEqual(group[i].value);
      for (const b of group) expect(b.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds deterministic gap candidates', () => {
    const a = findTransitGaps({ ...accessInput });
    const b = findTransitGaps({ ...accessInput });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
    for (const c of a) {
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(c.population).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('impact, score, and series', () => {
  const ops: EditOp[] = [
    {
      type: 'addRoute',
      route: {
        id: 'rt-um3', name: 'M3', mode: 'metro', color: '#22d3ee',
        stationIds: ['st-central', 'st-park-east', 'st-airport'],
        headwayMin: 6, speedKph: 32, vehicleCapacity: 800,
      },
    },
  ];
  const mod = applyEdits(city, base, ops);
  const modAccess = { zones: mod.city.zones, stations: mod.stations, connections: mod.connections, routes: mod.routes };

  it('attributes population gains and losses that sum to total pop', () => {
    const baseA = computeAccessibility(accessInput);
    const modA = computeAccessibility(modAccess);
    const baseC = computeCoverage(city.zones, base.stations, 500);
    const modC = computeCoverage(mod.city.zones, mod.stations, 500);
    const impact = populationImpact(baseA, modA, city.zones, baseC, modC);
    const totalPop = city.zones.reduce((s, z) => s + z.population, 0);
    expect(impact.improvedPop + impact.worsenedPop + impact.unchangedPop).toBe(totalPop);
    expect(impact.perZone.length).toBe(city.zones.length);
  });

  it('scores scenarios on a bounded explainable scale', () => {
    const stats = runHeadless(SEED, city, base, 60);
    const access = computeAccessibility(accessInput);
    const cov = computeCoverage(city.zones, base.stations, 500);
    const score = planningScore(stats, access, cov);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 6);
  });

  it('samples headless series on a fixed grid', () => {
    const out = runHeadlessSeries(SEED, city, base, 60, 15);
    expect(out.series.length).toBe(1 + 60 / 15);
    expect(out.series[0].t).toBe(7 * 60);
    expect(out.topStations.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < out.series.length; i++) {
      expect(out.series[i].generated).toBeGreaterThanOrEqual(out.series[i - 1].generated);
    }
  });

  it('compares scenarios with analytics rows', () => {
    const cmp = compareScenarios(SEED, city, base, mod.city, mod, mod.cost, 500, 60);
    const labels = cmp.rows.map((r) => r.label);
    for (const l of ['Accessibility', 'Coverage', 'Pop. improved', 'Pop. worsened', 'Planning score']) {
      expect(labels).toContain(l);
    }
    const totalPop = city.zones.reduce((s, z) => s + z.population, 0);
    expect(cmp.impact.improvedPop + cmp.impact.worsenedPop + cmp.impact.unchangedPop).toBe(totalPop);
  });
});
