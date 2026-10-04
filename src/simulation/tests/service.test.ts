import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { defaultPlanFor, headwayAt } from '../service/servicePlan.ts';
import {
  cycleMin,
  dwellMin,
  effectiveHeadway,
  fleetRequired,
  nextArrivalMin,
  nextTerminusDeparture,
  oneWayMin,
  routeEffectiveHeadway,
} from '../service/timetable.ts';
import { tripCancelled, tripDelayMin } from '../service/reliability.ts';
import { marginalCostPerDay, operatingCost } from '../service/costs.ts';
import { classifyNetwork, occupancyBand } from '../service/classify.ts';
import type { EditOp } from '../scenario/scenario.ts';

const SEED = 1337;
const city = generateCity(SEED);
const base = buildNetwork();
const m1 = base.routes.find((r) => r.id === 'rt-m1');
if (!m1) throw new Error('missing M1');
const plan = defaultPlanFor(m1);

describe('scheduling', () => {
  it('generates departures from headway and operating window', () => {
    expect(nextTerminusDeparture(plan, 5, 0, 400)).toBe(400);
    expect(nextTerminusDeparture(plan, 5, 0, 401)).toBe(405);
    // Before opening, first departure is at start + offset.
    expect(nextTerminusDeparture(plan, 5, 2, 100)).toBe(332);
    // After close, no service.
    expect(nextTerminusDeparture(plan, 5, 0, 1410)).toBe(Infinity);
  });

  it('switches peak/off-peak headways', () => {
    expect(headwayAt(plan, 8 * 60)).toBe(plan.peakHeadwayMin);
    expect(headwayAt(plan, 12 * 60)).toBe(plan.offPeakHeadwayMin);
    expect(headwayAt(plan, 22 * 60)).toBe(plan.offPeakHeadwayMin);
    // Outside operating hours there is no service.
    expect(headwayAt(plan, 2 * 60)).toBe(Infinity);
    expect(headwayAt(plan, 4 * 60)).toBe(Infinity);
  });

  it('computes next arrivals at stations from either terminus', () => {
    const cum = base.routeCumDist.get('rt-m1') ?? [0];
    const arr = nextArrivalMin(plan, 5, 0, cum, 2, 400);
    expect(arr).toBeGreaterThanOrEqual(400);
    expect(arr).toBeLessThan(400 + 5 + 10);
  });
});

describe('fleet', () => {
  it('sizes fleet from cycle time including turnaround', () => {
    const oneWay = oneWayMin(1000, plan, 5);
    expect(oneWay).toBeGreaterThan(1000 / 1000 / 32 * 60);
    const cycle = cycleMin(1000, plan, 5);
    expect(cycle).toBeCloseTo(2 * oneWay + 2 * plan.turnaroundMin, 6);
    expect(fleetRequired(46, 4)).toBe(12);
    expect(fleetRequired(46, 10)).toBe(5);
  });

  it('degrades headway instead of spawning unlimited vehicles', () => {
    // 7 vehicles cannot hold a 4-min headway over a 46-min cycle.
    expect(effectiveHeadway(plan, 46, 7, 8 * 60)).toBeCloseTo(46 / 7, 6);
    // Sufficient fleet holds the schedule.
    expect(effectiveHeadway(plan, 46, 12, 8 * 60)).toBe(plan.peakHeadwayMin);
    // Auto fleet (0) resolves to exactly required.
    expect(effectiveHeadway({ ...plan, fleetSize: 0 }, 46, 0, 8 * 60)).toBe(plan.peakHeadwayMin);
  });

  it('requires more fleet when congestion lengthens the cycle', () => {
    // Fixed fleet cannot absorb a longer cycle: the experienced headway grows.
    const fixed = { ...plan, fleetSize: 3 };
    const free = routeEffectiveHeadway(fixed, 1000, 5, 1, 8 * 60);
    const congested = routeEffectiveHeadway(fixed, 1000, 5, 1.5, 8 * 60);
    expect(congested).toBeGreaterThan(free);
    // Auto fleet covers the longer cycle at the scheduled headway.
    const autoFree = routeEffectiveHeadway(plan, 1000, 5, 1, 8 * 60);
    const autoCong = routeEffectiveHeadway(plan, 1000, 5, 1.5, 8 * 60);
    expect(autoFree).toBe(plan.peakHeadwayMin);
    expect(autoCong).toBe(plan.peakHeadwayMin);
  });
});

describe('capacity and dwell', () => {
  it('boards below capacity and denies above it', () => {
    const tiny = { [m1.id]: { ...defaultPlanFor(m1), vehicleCapacity: 2, fleetSize: 2 } };
    let sim = createSimulationFromParts(SEED, city, base, tiny);
    for (let i = 0; i < 180; i++) sim = stepSimulation(sim, 1);
    for (const vv of sim.vehicles) {
      expect(vv.riders.length).toBeLessThanOrEqual(vv.capacity);
    }
    expect(sim.counters.deniedBoardings).toBeGreaterThan(0);
    expect(sim.counters.routeDenied[m1.id] ?? 0).toBeGreaterThan(0);
  });

  it('increases dwell with passenger volume', () => {
    const empty = dwellMin(plan, 0, 0, 0.2);
    const busy = dwellMin(plan, 20, 15, 0.5);
    const crushed = dwellMin(plan, 20, 15, 0.95);
    expect(busy).toBeGreaterThan(empty);
    expect(crushed).toBeGreaterThan(busy);
  });

  it('bands occupancy into documented categories', () => {
    expect(occupancyBand(0.5)).toBe('comfortable');
    expect(occupancyBand(0.8)).toBe('busy');
    expect(occupancyBand(0.95)).toBe('crowded');
    expect(occupancyBand(1.2)).toBe('over');
  });
});

describe('reliability', () => {
  it('draws deterministic delays independent of order', () => {
    const a = tripDelayMin(SEED, 'veh-rt-m1-0', 3, plan.reliability);
    const b = tripDelayMin(SEED, 'veh-rt-m1-0', 3, plan.reliability);
    expect(a).toBe(b);
    expect(tripDelayMin(SEED, 'veh-rt-m1-0', 3, { ...plan.reliability, delayProb: 0 })).toBe(0);
    expect(tripCancelled(SEED, 'veh-rt-m1-0', 3, { ...plan.reliability, cancelProb: 0 })).toBe(false);
    // High delay probability produces delays across trips.
    let delayed = 0;
    for (let t = 0; t < 50; t++) {
      if (tripDelayMin(SEED, 'veh-x', t, { delayProb: 0.5, meanDelayMin: 3, cancelProb: 0 }) > 0) delayed++;
    }
    expect(delayed).toBeGreaterThan(10);
    expect(delayed).toBeLessThan(45);
  });
});

describe('service costs', () => {
  it('scales with service supplied and frequency', () => {
    const low = operatingCost('metro', 10, 100, 5);
    const high = operatingCost('metro', 20, 200, 10);
    expect(high).toBeGreaterThan(low);
    expect(operatingCost('bus', 10, 100, 5)).toBeLessThan(operatingCost('metro', 10, 100, 5));
    expect(marginalCostPerDay('metro', 46, 8, 4, 1080)).toBeGreaterThan(0);
    expect(marginalCostPerDay('metro', 46, 4, 8, 1080)).toBe(0);
  });
});

describe('service classification', () => {
  it('labels problems from live metrics', () => {
    let sim = createSimulationFromParts(SEED, city, base);
    for (let i = 0; i < 120; i++) sim = stepSimulation(sim, 1);
    const plans: Record<string, ReturnType<typeof defaultPlanFor>> = {};
    for (const r of sim.routes) plans[r.id] = sim.service[r.id];
    const out = classifyNetwork({
      stations: sim.stations,
      routes: sim.routes,
      counters: sim.counters,
      plans,
      busSlowdown: sim.busRouteCongestion,
    });
    expect(Object.keys(out.stations).length).toBe(sim.stations.length);
    expect(Object.keys(out.routes).length).toBe(sim.routes.length);
    for (const v of Object.values(out.routes)) {
      expect(['balanced', 'underused', 'overcrowded', 'frequency-constrained', 'capacity-constrained', 'road-constrained']).toContain(v);
    }
  });
});

describe('service scenarios', () => {
  it('applies setService without mutating the base', () => {
    const before = JSON.stringify(base.routes.map((r) => [r.id, r.headwayMin]));
    const ops: EditOp[] = [{ type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 3 } }];
    const mod = applyEdits(city, base, ops);
    expect(mod.service['rt-m1'].peakHeadwayMin).toBe(3);
    expect(mod.service['rt-m2'].peakHeadwayMin).toBe(5);
    // Base untouched.
    expect(JSON.stringify(base.routes.map((r) => [r.id, r.headwayMin]))).toBe(before);
    // Unknown routes warn instead of throwing.
    const bad = applyEdits(city, base, [{ type: 'setService', routeId: 'nope', patch: {} }]);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });

  it('changes waiting when frequency changes', () => {
    const run = (headway: number) => {
      const svc = { 'rt-m1': { ...defaultPlanFor(m1), peakHeadwayMin: headway, offPeakHeadwayMin: headway } };
      let sim = createSimulationFromParts(SEED, city, base, svc);
      for (let i = 0; i < 180; i++) sim = stepSimulation(sim, 1);
      return sim;
    };
    const slow = run(12);
    const fast = run(3);
    const slowWait = slow.counters.totalWaitMin / Math.max(1, slow.counters.completed);
    const fastWait = fast.counters.totalWaitMin / Math.max(1, fast.counters.completed);
    expect(fastWait).toBeLessThan(slowWait);
  });
});
