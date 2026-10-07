import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';
import { ZONE_ACCESS } from '../passengers/demand.ts';
import { buildRoutePlan } from '../passengers/passengers.ts';
import { findShortestPath } from '../transport/graph.ts';

function run(simSeed: number, steps: number, startMin?: number) {
  let sim = createSimulation(simSeed);
  if (startMin !== undefined) sim.timeMinutes = startMin;
  for (let i = 0; i < steps; i++) sim = stepSimulation(sim, 1);
  return sim;
}

describe('passenger simulation', () => {
  it('plans single-route and transfer journeys', () => {
    const sim = createSimulation(1337);
    const direct = buildRoutePlan(sim.connections, 'st-north-res', 'st-university');
    expect(direct).not.toBeNull();
    expect(direct?.length).toBe(1);
    expect(direct?.[0].routeId).toBe('rt-m1');
    const cross = buildRoutePlan(sim.connections, 'st-west-res', 'st-airport');
    expect(cross).not.toBeNull();
    expect((cross?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('can route every zone access pair', () => {
    const sim = createSimulation(1337);
    const entries = Object.entries(ZONE_ACCESS);
    for (const [, from] of entries) {
      for (const [, to] of entries) {
        if (from === to) continue;
        expect(findShortestPath(sim.connections, from, to)).not.toBeNull();
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = run(1337, 60);
    const b = run(1337, 60);
    expect(a.counters.generated).toBe(b.counters.generated);
    expect(a.counters.completed).toBe(b.counters.completed);
    expect(a.counters.boardingsTotal).toBe(b.counters.boardingsTotal);
    expect(a.passengers.length).toBe(b.passengers.length);
  });

  it('generates more demand in the AM peak than at night', () => {
    const am = run(1337, 60, 7 * 60);
    const night = run(1337, 60, 2 * 60);
    expect(am.counters.generated).toBeGreaterThan(night.counters.generated * 3);
  });

  it('boards, transfers, and completes journeys within capacity', () => {
    const sim = run(1337, 240);
    expect(sim.counters.generated).toBeGreaterThan(200);
    expect(sim.counters.completed).toBeGreaterThan(50);
    expect(sim.counters.boardingsTotal).toBeGreaterThan(sim.counters.completed);
    for (const vv of sim.vehicles) {
      expect(vv.riders.length).toBeLessThanOrEqual(vv.capacity);
      expect(vv.load).toBe(vv.riders.length);
    }
    // Station waiting matches actual waiting passenger states.
    for (const st of sim.stations) {
      const counted = sim.passengers.filter(
        (p) => (p.state === 'WAITING' || p.state === 'TRANSFERRING') && p.atStation === st.id,
      ).length;
      expect(st.waiting).toBe(counted);
    }
  });

  it('serves terminus stations (no stranded termini)', () => {
    const sim = run(1337, 120);
    for (const id of ['st-north-res', 'st-university', 'st-west-res', 'st-harbor', 'st-ne-suburb']) {
      const st = sim.stations.find((s) => s.id === id);
      expect(st?.boardedDay ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('trip decisions and recent trips', () => {
  const sim = run(1337, 240);

  it('records why every live trip took its mode', () => {
    expect(sim.passengers.length).toBeGreaterThan(0);
    for (const p of sim.passengers) {
      expect(p.decision.chose).toBe('transit');
      expect(p.decision.options === 'both' || p.decision.options === 'transit-only').toBe(true);
    }
    expect(sim.cars.length).toBeGreaterThan(0);
    for (const c of sim.cars) expect(c.decision.chose).toBe('car');
  });

  it('keeps probabilities sensible where there was a choice', () => {
    for (const t of [...sim.passengers, ...sim.cars]) {
      const d = t.decision;
      if (d.options === 'both') {
        expect(d.pCar).not.toBeNull();
        expect(d.pCar!).toBeGreaterThanOrEqual(0);
        expect(d.pCar!).toBeLessThanOrEqual(1);
        expect(d.transitMin).not.toBeNull();
        expect(d.roadMin).not.toBeNull();
      } else {
        expect(d.pCar).toBeNull();
      }
    }
  });

  it('remembers finished trips, bounded, oldest first', () => {
    const recent = sim.recentTrips;
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(200);
    for (const r of recent) {
      expect(r.end).not.toBe('active');
      if (r.kind === 'transit') expect(r.legs.length).toBeGreaterThan(0);
      else expect(r.legs).toEqual([]);
    }
    const ends = recent.map((r) => r.endMin);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
  });
});
