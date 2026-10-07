import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';
import { LOOP_ROUTES } from '../passengers/passengers.ts';
import { cycleMin } from '../service/timetable.ts';

function run(ticks: number, onTick: (sim: ReturnType<typeof createSimulation>) => void) {
  let sim = createSimulation(1337);
  for (let t = 0; t < ticks; t++) {
    sim = stepSimulation(sim, 1);
    onTick(sim);
  }
  return sim;
}

describe('vehicle movement', () => {
  it('only ever stands still on a station', () => {
    run(240, (sim) => {
      for (const v of sim.vehicles) {
        if (v.dwellLeft <= 1e-9) continue;
        const cum = sim.routeCumDist.get(v.routeId) ?? [];
        expect(cum.some((c) => Math.abs(c - v.s) < 1e-6)).toBe(true);
      }
    });
  });

  it('never jumps further than a tick of travel', () => {
    let prev = new Map<string, number>();
    run(240, (sim) => {
      for (const v of sim.vehicles) {
        const route = sim.routes.find((r) => r.id === v.routeId);
        const plan = sim.service[v.routeId];
        const kph = plan?.speedKph ?? route?.speedKph ?? 0;
        const was = prev.get(v.id);
        if (was !== undefined) expect(Math.abs(v.s - was)).toBeLessThanOrEqual((kph * 1000) / 60 + 1e-6);
        prev.set(v.id, v.s);
      }
    });
    expect(LOOP_ROUTES.size).toBe(0);
  });

  it('turns round only at the ends of a line', () => {
    const dir = new Map<string, number>();
    run(240, (sim) => {
      for (const v of sim.vehicles) {
        const cum = sim.routeCumDist.get(v.routeId) ?? [0];
        const was = dir.get(v.id);
        if (was !== undefined && was !== v.direction) {
          const atEnd = Math.abs(v.s) < 1e-6 || Math.abs(v.s - cum[cum.length - 1]) < 1e-6;
          expect(atEnd).toBe(true);
        }
        dir.set(v.id, v.direction);
      }
    });
  });

  it('pays for every stop: a line cannot run faster than its cycle allows', () => {
    const ticks = 240;
    const sim0 = createSimulation(1337);
    const sim = run(ticks, () => undefined);
    for (const r of sim0.routes) {
      const plan = sim0.service[r.id];
      const length = sim0.routeLengths.get(r.id) ?? 0;
      const km = sim.counters.routeVehKm[r.id] ?? 0;
      const hr = sim.counters.routeVehHr[r.id] ?? 0;
      if (hr <= 0) continue; // congestion only slows buses, so the same ceiling holds
      const cycle = cycleMin(length, plan, r.stationIds.length);
      const ceiling = (2 * length) / 1000 / (cycle / 60);
      expect(km / hr).toBeLessThanOrEqual(ceiling * 1.02);
    }
  });
});
