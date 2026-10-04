import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';

describe('simulation clock', () => {
  it('starts at 07:00 and advances one minute per step', () => {
    const sim = createSimulation(1337);
    expect(sim.tick).toBe(0);
    expect(sim.timeMinutes).toBe(420);
    const next = stepSimulation(sim, 1);
    expect(next.tick).toBe(1);
    expect(next.timeMinutes).toBe(421);
    // Original state untouched (immutable step).
    expect(sim.tick).toBe(0);
  });

  it('moves vehicles and accumulates boardings', () => {
    const sim = createSimulation(1337);
    const before = sim.vehicles.map((v) => v.s);
    let cur = sim;
    for (let i = 0; i < 10; i++) cur = stepSimulation(cur, 1);
    expect(cur.tick).toBe(10);
    const moved = cur.vehicles.some((v, i) => v.s !== before[i]);
    expect(moved).toBe(true);
    const boarded = cur.stations.reduce((s, st) => s + st.boardedDay, 0);
    expect(boarded).toBeGreaterThan(0);
  });
});
