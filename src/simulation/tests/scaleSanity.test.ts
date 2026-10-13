import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation, START_MIN } from '../index.ts';
import { cycleMin, resolvedFleet } from '../service/timetable.ts';

/**
 * World-scale sanity: at WORLD_SCALE=5 every route's one-way time is ~5x, so
 * the cycle a route must cover is ~5x. These tests pin the two properties the
 * world-scale pass depends on, so a later scaling bump that breaks them fails
 * loudly instead of silently degrading service:
 *   1. The fleet caps in initVehicles (12 per route, 64 total) do NOT truncate
 *      any route at this scale. A route capped below its required fleet runs at
 *      cycle/fleet headway — real, invisible service degradation.
 *   2. A full undisrupted day carries essentially all demand and strands nobody.
 */

/** The 12-vehicle per-route and 64-vehicle total caps applied by initVehicles. */
const PER_ROUTE_CAP = 12;
const TOTAL_CAP = 64;

describe('world-scale fleet sanity', () => {
  it('no route is truncated by the fleet caps at WORLD_SCALE=5', () => {
    const sim = createSimulation(1337);
    let totalRequired = 0;
    for (const r of sim.routes) {
      const plan = sim.service[r.id];
      const length = Math.max(1, sim.routeLengths.get(r.id) ?? 1);
      const required = resolvedFleet(plan, cycleMin(length, plan, r.stationIds.length), START_MIN);
      // If this fails, raise the caps in src/simulation/index.ts (per-route and
      // total) by WORLD_SCALE — the route cannot hold its scheduled headway.
      expect(required, `${r.id} needs ${required} > per-route cap ${PER_ROUTE_CAP}`).toBeLessThanOrEqual(PER_ROUTE_CAP);
      totalRequired += Math.min(PER_ROUTE_CAP, required);
    }
    expect(totalRequired).toBeLessThanOrEqual(TOTAL_CAP);
  });
});

describe('full-day totals at world scale', () => {
  it('carries demand, denies little, strands nobody and never overloads a vehicle', () => {
    let sim = createSimulation(1337);
    const ticks = 1440 - START_MIN; // 07:00 to midnight, the simulated day
    for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
    const c = sim.counters;

    // Somebody actually travelled (not an empty run).
    expect(c.generated).toBeGreaterThan(0);
    expect(c.completed).toBeGreaterThan(0);

    // Bands are deliberately loose: they flag mass failure, not small drift.
    // A service that cannot carry its demand fails the day well before 95%.
    expect(c.completed / c.generated).toBeGreaterThanOrEqual(0.95);

    // A handful of denials is tolerable; systematic capacity denial is not.
    expect(c.deniedBoardings).toBeLessThanOrEqual(0.02 * Math.max(1, c.boardingsTotal));

    // No mass stranding on an undisrupted day.
    expect(c.strandedPeak).toBeLessThanOrEqual(0.01 * c.generated);

    // Reliability cancellations stay a small fraction of the day's demand.
    expect(c.cancelledTrips).toBeLessThanOrEqual(0.02 * c.generated);

    // Unroutable demand is negligible on the fixed network.
    expect(c.unrouted).toBeLessThanOrEqual(0.01 * c.generated);

    // Occupancy is a fraction of capacity: over 1 means riders were carried past
    // capacity (a bug), and 0 would mean no vehicle ever carried anyone.
    expect(c.maxOccupancy01).toBeGreaterThan(0);
    expect(c.maxOccupancy01).toBeLessThanOrEqual(1);
  });
});
