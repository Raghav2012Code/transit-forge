import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { buildDemandMatrix, purposeOf } from '../passengers/demand.ts';
import { buildRoadGraph } from '../traffic/roadGraph.ts';
import { buildEdgeStates, buildZoneRoadAccess } from '../traffic/cars.ts';
import {
  BASE_YEAR,
  computeDemandLayers,
  growZones,
  growthStep,
  planAdvice,
  zoneAttractiveness,
  type GrowthWorld,
} from '../growth/growth.ts';
import { CAPACITY_BY_KIND, developedShare } from '../growth/landUse.ts';

const SEED = 1337;

function makeWorld(): GrowthWorld {
  const city = generateCity(SEED);
  const net = buildNetwork();
  const roadGraph = buildRoadGraph(city);
  return {
    zones: city.zones,
    stations: net.stations,
    connections: net.connections,
    routes: net.routes,
    roadGraph,
    edgeState: buildEdgeStates(roadGraph),
    zoneRoadAccess: buildZoneRoadAccess(city),
  };
}

describe('growth determinism', () => {
  it('produces identical results for the same start', () => {
    const a = makeWorld();
    const b = makeWorld();
    for (let y = 0; y < 5; y++) {
      growthStep(a, BASE_YEAR + y + 1, 0.5);
      growthStep(b, BASE_YEAR + y + 1, 0.5);
    }
    expect(JSON.stringify(a.zones)).toBe(JSON.stringify(b.zones));
  });

  it('initializes capacity above current levels', () => {
    const city = generateCity(SEED);
    for (const z of city.zones) {
      expect(z.capacityPop).toBeGreaterThan(z.population);
      expect(z.capacityJobs).toBeGreaterThan(z.jobs);
      expect(z.developed01).toBeGreaterThanOrEqual(0);
      expect(z.developed01).toBeLessThan(1);
      expect(z.students).toBeGreaterThanOrEqual(0);
      expect(z.households).toBeGreaterThan(0);
    }
  });
});

describe('growth capacity', () => {
  it('respects capacity and slows near it over 20 years', () => {
    const w = makeWorld();
    const rates: number[] = [];
    for (let y = 0; y < 20; y++) {
      const before = w.zones.reduce((s, z) => s + z.population, 0);
      const { point } = growthStep(w, BASE_YEAR + y + 1, 0.5);
      expect(Number.isFinite(point.pop)).toBe(true);
      const after = w.zones.reduce((s, z) => s + z.population, 0);
      rates.push((after - before) / before);
    }
    for (const z of w.zones) {
      expect(z.population).toBeLessThanOrEqual(z.capacityPop);
      expect(z.jobs).toBeLessThanOrEqual(z.capacityJobs);
      expect(Number.isFinite(z.population)).toBe(true);
      expect(Number.isFinite(z.attractiveness)).toBe(true);
    }
    // Growth decelerates as the city fills up.
    const early = rates.slice(0, 5).reduce((s, r) => s + r, 0) / 5;
    const late = rates.slice(-5).reduce((s, r) => s + r, 0) / 5;
    expect(late).toBeLessThan(early);
    // Bounded: 20 years cannot triple the city.
    const start = generateCity(SEED).zones.reduce((s, z) => s + z.population, 0);
    const end = w.zones.reduce((s, z) => s + z.population, 0);
    expect(end / start).toBeLessThan(2.2);
  });

  it('behaves differently by district type', () => {
    const w = makeWorld();
    for (let y = 0; y < 5; y++) growthStep(w, BASE_YEAR + y + 1, 0.5);
    const attrs = new Map(w.zones.map((z) => [z.kind, z.attractiveness]));
    // CBD appeal exceeds harbor appeal given similar access (type weight differs).
    expect(CAPACITY_BY_KIND.cbd.typeAppeal).toBeGreaterThan(CAPACITY_BY_KIND.harbor.typeAppeal);
    expect(attrs.size).toBeGreaterThan(3);
  });
});

describe('accessibility feedback', () => {
  it('rewards accessibility in attractiveness with lag', () => {
    const w = makeWorld();
    const z = w.zones[0];
    const low = zoneAttractiveness(z, 0.2, 0.7, 0.5);
    const high = zoneAttractiveness(z, 0.9, 0.7, 0.5);
    expect(high).toBeGreaterThan(low);
    // Lag: one good year moves memory only partway.
    z.accessMem = 30;
    growthStep(w, BASE_YEAR + 1, 0.5);
    expect(z.accessMem).toBeGreaterThan(30);
    expect(z.accessMem).toBeLessThan(z.accessScore + 0.001);
  });

  it('regenerates demand from grown population', () => {
    const before = buildDemandMatrix(generateCity(SEED).zones).totalDaily;
    const w = makeWorld();
    for (let y = 0; y < 5; y++) growthStep(w, BASE_YEAR + y + 1, 0.5);
    const after = buildDemandMatrix(w.zones).totalDaily;
    expect(after).toBeGreaterThan(before);
  });
});

describe('trip purposes', () => {
  it('maps O/D kinds to valid purposes', () => {
    expect(purposeOf('residential', 'cbd')).toBe('work');
    expect(purposeOf('residential', 'university')).toBe('education');
    expect(purposeOf('suburban', 'airport')).toBe('airport');
    expect(purposeOf('residential', 'industrial')).toBe('industrial');
    const kinds = ['cbd', 'residential', 'industrial', 'university', 'airport', 'harbor', 'suburban'] as const;
    for (const a of kinds) {
      for (const b of kinds) {
        expect(['work', 'education', 'shopping', 'leisure', 'airport', 'industrial', 'other']).toContain(purposeOf(a, b));
      }
    }
  });
});

describe('demand layers', () => {
  it('partitions trips without loss', () => {
    const city = generateCity(SEED);
    const net = buildNetwork();
    const roadGraph = buildRoadGraph(city);
    const layers = computeDemandLayers({
      zones: city.zones,
      demand: buildDemandMatrix(city.zones),
      connections: net.connections,
      roadGraph,
      zoneRoadAccess: buildZoneRoadAccess(city),
      stations: net.stations,
      routes: net.routes,
    });
    const sumOrigins = Object.values(layers.origins).reduce((s, v) => s + v, 0);
    const sumTransitCar = Object.values(layers.transit).reduce((s, v) => s + v, 0) +
      Object.values(layers.car).reduce((s, v) => s + v, 0);
    // Transit + car partition the origins (rounding tolerance).
    expect(Math.abs(sumOrigins - sumTransitCar)).toBeLessThanOrEqual(Object.keys(layers.origins).length * 2);
    expect(sumOrigins).toBeGreaterThan(0);
  });
});

describe('horizon scenarios', () => {
  it('reproduces long-term runs and leaves the base untouched', () => {
    const city = generateCity(SEED);
    const net = buildNetwork();
    const roadGraph = buildRoadGraph(city);
    const structural = {
      stations: net.stations,
      connections: net.connections,
      routes: net.routes,
      roadGraph,
      edgeState: buildEdgeStates(roadGraph),
      zoneRoadAccess: buildZoneRoadAccess(city),
    };
    const before = JSON.stringify(city.zones);
    const a = growZones(city.zones, structural, 10, BASE_YEAR, 0.5);
    const b = growZones(city.zones, structural, 10, BASE_YEAR, 0.5);
    expect(JSON.stringify(a.zones)).toBe(JSON.stringify(b.zones));
    expect(JSON.stringify(a.history)).toBe(JSON.stringify(b.history));
    expect(JSON.stringify(city.zones)).toBe(before);
    expect(a.history.length).toBe(10);
    expect(a.history[9].year).toBe(BASE_YEAR + 10);
    for (const p of a.history) {
      expect(Number.isFinite(p.pop)).toBe(true);
      expect(Number.isFinite(p.transitDay)).toBe(true);
    }
  });

  it('keeps developed share consistent', () => {
    const city = generateCity(SEED);
    for (const z of city.zones) {
      expect(Math.abs(developedShare(z) - z.developed01)).toBeLessThan(0.001);
    }
  });
});

describe('warnings', () => {
  it('flags capacity and congestion from real thresholds', () => {
    const w = makeWorld();
    const full = w.zones[0];
    full.population = full.capacityPop; // force near-capacity
    full.developed01 = developedShare(full);
    const advice = planAdvice({
      zones: w.zones,
      stations: w.stations,
      routes: w.routes,
      counters: { routePeakOcc: {}, routeBoardings: {} },
      edgeState: w.edgeState,
      roadGraph: w.roadGraph,
      cityPopGrowth: 0.02,
    });
    expect(advice.warnings.length).toBeGreaterThan(0);
    expect(advice.warnings.length).toBeLessThanOrEqual(6);
    expect(advice.recommendations.length).toBeLessThanOrEqual(4);
    for (const r of advice.recommendations) {
      expect(r.intervention.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.area.length).toBeGreaterThan(0);
    }
  });
});
