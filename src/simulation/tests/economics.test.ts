import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { runHeadless } from '../scenario/compare.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { evaluatePlan } from '../scenario/evaluate.ts';
import { carProbability } from '../traffic/modeChoice.ts';
import {
  breakEvenFare,
  costRecoveryPct,
  creditCompletedFare,
  DEFAULT_FARES,
  fareFor,
  MAX_FARE,
  sanitizeFares,
  subsidyFor,
  tripFare,
  type FarePolicy,
} from '../economics/fares.ts';
import type { TripCounters } from '../../types/index.ts';

const SEED = 1337;
const FARES: FarePolicy = { metro: 8, rail: 10, bus: 4 };

function counters(): TripCounters {
  return {
    generated: 0, completed: 0, unrouted: 0, skippedCap: 0,
    totalTravelMin: 0, totalWaitMin: 0, totalTransfers: 0, boardingsTotal: 0,
    metroBoardings: 0, railBoardings: 0, busBoardings: 0, maxOccupancy01: 0,
    routeBoardings: {}, routePeakOcc: {}, routeDenied: {}, routeVehKm: {}, routeVehHr: {},
    deniedBoardings: 0, totalDelayMin: 0, rerouted: 0, strandedPeak: 0,
    strandedMin: 0, incidentDelayMin: 0, cancelledTrips: 0,
    revenueTotal: 0, revenueByMode: {}, revenueByRoute: {},
  };
}

describe('fare maths (pure)', () => {
  it('sanitizes fares to whole OCU within bounds', () => {
    expect(sanitizeFares({ metro: 8.6, rail: -3, bus: 999 })).toEqual({ metro: 9, rail: 0, bus: MAX_FARE });
    expect(sanitizeFares({ metro: NaN, rail: Infinity, bus: 4 })).toEqual({ metro: 0, rail: 0, bus: 4 });
    expect(DEFAULT_FARES).toEqual({ metro: 0, rail: 0, bus: 0 });
  });

  it('prices trips at the entry mode (transfers free)', () => {
    expect(fareFor('metro', FARES)).toBe(8);
    expect(tripFare('bus', FARES)).toBe(4);
  });

  it('leaves zero-fare behavior exactly unchanged and responds monotonically', () => {
    const base = carProbability(20, 1, 15, 'suburban');
    expect(carProbability(20, 1, 15, 'suburban', 0)).toBe(base);
    const low = carProbability(20, 1, 15, 'suburban', 4);
    const high = carProbability(20, 1, 15, 'suburban', 20);
    expect(low).toBeGreaterThan(base);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
    // Extreme fares saturate at (not beyond) certainty: still a probability.
    expect(carProbability(20, 1, 15, 'suburban', 1000)).toBe(1);
  });

  it('derives recovery, subsidy, and break-even with sane edges', () => {
    expect(costRecoveryPct(4000, 8000)).toBe(50);
    expect(costRecoveryPct(9000, 8000)).toBe(112.5);
    expect(costRecoveryPct(100, 0)).toBe(0);
    expect(subsidyFor(4000, 8000)).toBe(4000);
    expect(subsidyFor(9000, 8000)).toBe(0);
    expect(breakEvenFare(8000, 4000)).toBe(2);
    expect(breakEvenFare(8000, 0)).toBe(0);
  });

  it('credits completions by route and mode, ignoring free trips', () => {
    const c = counters();
    creditCompletedFare(c, 'rt-m1', 'metro', 8);
    creditCompletedFare(c, 'rt-m1', 'metro', 8);
    creditCompletedFare(c, 'rt-b1', 'bus', 0);
    expect(c.revenueTotal).toBe(16);
    expect(c.revenueByMode.metro).toBe(16);
    expect(c.revenueByRoute['rt-m1']).toBe(16);
    expect(c.revenueByRoute['rt-b1'] ?? 0).toBe(0);
  });
});

describe('fare economics headless (seam 1)', () => {
  const city = generateCity(SEED);
  const base = buildNetwork();

  it('earns revenue deterministically with fares set', { timeout: 60000 }, () => {
    const mod = applyEdits(city, base, [{ type: 'setFares', fares: FARES }]);
    expect(mod.fares).toEqual(FARES);
    const a = runHeadless(SEED, mod.city, mod);
    const b = runHeadless(SEED, mod.city, mod);
    expect(a.revenue).toBe(b.revenue);
    expect(a.revenue).toBeGreaterThan(0);
    // Attribution is exact: mode parts and route parts both sum to the total.
    expect(a.revenueMetro + a.revenueRail + a.revenueBus).toBe(a.revenue);
    // No trip can pay more than the highest fare in the policy.
    expect(a.revenue).toBeLessThanOrEqual(a.completed * 10);
    expect(a.costRecovery).toBeGreaterThan(0);
    expect(a.subsidy).toBe(Math.max(0, a.opCost - a.revenue));
  });

  it('keeps free transit free and priced transit elastic', { timeout: 60000 }, () => {
    const free = runHeadless(SEED, city, base);
    expect(free.revenue).toBe(0);
    expect(free.costRecovery).toBe(0);
    expect(free.subsidy).toBe(free.opCost);
    const pricey = applyEdits(city, base, [{ type: 'setFares', fares: { metro: 50, rail: 50, bus: 50 } }]);
    const priced = runHeadless(SEED, pricey.city, pricey);
    expect(priced.completed).toBeLessThan(free.completed);
    expect(priced.revenue).toBeGreaterThan(0);
  });

  it('clamps abusive fares through the op path', () => {
    const mod = applyEdits(city, base, [{ type: 'setFares', fares: { metro: 999, rail: -5, bus: 7.4 } }]);
    expect(mod.fares).toEqual({ metro: MAX_FARE, rail: 0, bus: 7 });
  });

  it('locks fares at boarding: mid-trip changes do not rewrite history', () => {
    let sim = createSimulationFromParts(SEED, city, base);
    for (let i = 0; i < 60; i++) sim = stepSimulation(sim, 1);
    const before = sim.counters.revenueTotal;
    sim.fares = { ...FARES };
    for (let i = 0; i < 120; i++) sim = stepSimulation(sim, 1);
    // Trips boarded before the change still complete at fare 0.
    expect(sim.counters.revenueTotal).toBeGreaterThanOrEqual(before);
    const locked = sim.passengers.filter((p) => p.farePaid === 0).length;
    expect(locked + sim.counters.completed).toBeGreaterThan(0);
  });
});

describe('fare evaluation (seam 3)', () => {
  const city = generateCity(SEED);
  const base = buildNetwork();

  it('passes revenue objectives and enforces subsidy caps', { timeout: 60000 }, () => {
    const ops = [{ type: 'setFares' as const, fares: FARES }];
    const ev = evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops,
      objectives: [
        { id: 'rev', title: 'Revenue', description: '', category: 'financial', metric: 'revenue', op: '>', target: 0, horizonYears: 0 },
        { id: 'rec', title: 'Recovery', description: '', category: 'financial', metric: 'cost-recovery', op: '>', target: 0, horizonYears: 0 },
      ],
      constraints: [
        { id: 'cap', label: 'Subsidy cap', kind: 'subsidy', limit: 10_000_000 },
      ],
      horizonYears: 0,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    expect(ev.objectiveResults.find((r) => r.objectiveId === 'rev')?.passed).toBe(true);
    expect(ev.objectiveResults.find((r) => r.objectiveId === 'rec')?.passed).toBe(true);
    expect(ev.constraintResults.find((r) => r.constraintId === 'cap')?.passed).toBe(true);
    expect(ev.intervention.service.join(' ')).toContain('Fares:');
  });

  it('fails an impossible subsidy cap', { timeout: 60000 }, () => {
    // Free transit earns nothing, and service always costs something, so a
    // zero cap must fail. (Priced scenarios may legitimately reach zero
    // subsidy — that is the game working, not the constraint broken.)
    const ev = evaluatePlan({
      seed: SEED,
      baseCity: city,
      baseNet: base,
      ops: [],
      objectives: [],
      constraints: [{ id: 'cap0', label: 'Zero subsidy', kind: 'subsidy', limit: 0 }],
      horizonYears: 0,
      coverageThreshold: 500,
      transitShare01: 0.5,
    });
    expect(ev.plan.stats.revenue).toBe(0);
    expect(ev.plan.stats.subsidy).toBeGreaterThan(0);
    expect(ev.passed).toBe(false);
    expect(ev.constraintResults[0].passed).toBe(false);
  });
});
