import { describe, expect, it } from 'vitest';
import {
  START_MIN,
  buildSimulationAt,
  createSimulation,
  createSimulationFromParts,
  formatClock,
  stepSimulation,
  type SimulationState,
} from '../index.ts';

/** Everything a player would look at, so equality means "the same day". */
function signature(sim: SimulationState): string {
  return JSON.stringify({
    tick: sim.tick,
    timeMinutes: sim.timeMinutes,
    counters: sim.counters,
    vehicles: sim.vehicles.map((v) => [v.id, v.s, v.direction, v.load, v.riders, v.dwellLeft, v.trips]),
    passengers: sim.passengers.map((p) => [p.id, p.state, p.atStation, p.vehicleId, p.waitMin, p.legIndex]),
    incidents: sim.incidents.map((i) => [i.id, i.status, i.activeTicks]),
    events: sim.events.map((e) => [e.t, e.text, e.level]),
  });
}

const base = createSimulation(1337);

describe('rebuilding a session to a minute', () => {
  it('matches running there minute by minute', async () => {
    let run = createSimulationFromParts(1337, base.city, base);
    for (let i = 0; i < 300; i++) run = stepSimulation(run, 1);

    const rebuilt = await buildSimulationAt(1337, base.city, base, START_MIN + 300);
    expect(rebuilt).not.toBeNull();
    expect(formatClock(rebuilt!.timeMinutes)).toBe('12:00');
    expect(signature(rebuilt!)).toBe(signature(run));
  });

  it('is deterministic: the same minute twice is the same state', async () => {
    const a = await buildSimulationAt(1337, base.city, base, START_MIN + 500);
    const b = await buildSimulationAt(1337, base.city, base, START_MIN + 500);
    expect(signature(a!)).toBe(signature(b!));
  });

  it('reports progress from the first minute to the target', async () => {
    const seen: number[] = [];
    await buildSimulationAt(1337, base.city, base, START_MIN + 250, { onProgress: (m) => seen.push(m) });
    expect(seen[0]).toBe(START_MIN);
    expect(seen[seen.length - 1]).toBe(START_MIN + 250);
    expect(seen.length).toBeGreaterThan(1);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });

  it('resolves null and stops early when abandoned', async () => {
    let asked = 0;
    const built = await buildSimulationAt(1337, base.city, base, START_MIN + 900, {
      shouldStop: () => (asked += 1) > 100,
    });
    expect(built).toBeNull();
    expect(asked).toBeLessThan(905);
  });

  it('returns the fresh morning for a minute that has not started', async () => {
    const built = await buildSimulationAt(1337, base.city, base, START_MIN - 60);
    expect(built!.tick).toBe(0);
    expect(built!.timeMinutes).toBe(START_MIN);
  });
});
