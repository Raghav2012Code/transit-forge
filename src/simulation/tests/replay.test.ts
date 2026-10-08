import { describe, expect, it } from 'vitest';
import { createSimulation, createSimulationFromParts, stepSimulation, type SimulationState } from '../index.ts';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import type { EditOp } from '../scenario/scenario.ts';
import { advanceReplay, advanceReplayFor, replayProgress01, startReplay } from '../replay.ts';
import { computeStats } from '../statistics.ts';

const SEED = 1337;

function fingerprint(sim: SimulationState): string {
  return JSON.stringify({
    stats: computeStats(sim),
    rng: sim.rng,
    time: sim.timeMinutes,
    passengers: sim.passengers.length,
    cars: sim.cars.length,
    vehicles: sim.vehicles.map((v) => [v.id, Math.round(v.s * 100), v.load]),
  });
}

function straight(sim: SimulationState, to: number): SimulationState {
  let s = sim;
  while (s.timeMinutes < to) s = stepSimulation(s, 1);
  return s;
}

describe('replay', () => {
  it('reaches the target minute exactly', () => {
    const r = startReplay(createSimulation(SEED), 600);
    advanceReplay(r, 10_000);
    expect(r.done).toBe(true);
    expect(r.sim.timeMinutes).toBe(600);
  });

  it('gives the same day however it is chunked', () => {
    const expected = fingerprint(straight(createSimulation(SEED), 720));
    for (const chunk of [1, 7, 60]) {
      const r = startReplay(createSimulation(SEED), 720);
      while (!r.done) advanceReplay(r, chunk);
      expect(fingerprint(r.sim)).toBe(expected);
    }
  });

  it('matches a straight run when a timed edit is in the day', () => {
    const city = generateCity(SEED);
    const net = buildNetwork();
    const ops: EditOp[] = [
      { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 4, fleetSize: 7 }, atMin: 540 },
      { type: 'setFares', fares: { metro: 5, rail: 5, bus: 5 }, atMin: 600 },
    ];
    const build = () => {
      const mod = applyEdits(city, net, ops);
      return createSimulationFromParts(SEED, mod.city, mod);
    };
    const expected = fingerprint(straight(build(), 700));
    const r = startReplay(build(), 700);
    while (!r.done) advanceReplay(r, 13);
    expect(fingerprint(r.sim)).toBe(expected);
  });

  it('is done at once for a target that is not ahead', () => {
    expect(startReplay(createSimulation(SEED), 420).done).toBe(true);
    expect(startReplay(createSimulation(SEED), 100).done).toBe(true);
  });

  it('reports steps and progress', () => {
    const r = startReplay(createSimulation(SEED), 520);
    const seen: number[] = [];
    advanceReplay(r, 25, (s) => seen.push(s.timeMinutes));
    expect(seen).toHaveLength(25);
    expect(replayProgress01(r)).toBeCloseTo(0.25, 5);
    advanceReplay(r, 1000);
    expect(replayProgress01(r)).toBe(1);
  });

  it('a time budget always makes progress, even if the clock never moves', () => {
    const r = startReplay(createSimulation(SEED), 450);
    advanceReplayFor(r, 0, () => 1);
    expect(r.sim.timeMinutes).toBeGreaterThan(420);
  });

  it('a time budget stops when it is spent and carries on to the same result', () => {
    let t = 0;
    const clock = () => (t += 1); // every look at the clock costs 1 ms
    const r = startReplay(createSimulation(SEED), 600);
    let rounds = 0;
    while (!r.done) {
      advanceReplayFor(r, 5, clock);
      rounds++;
    }
    expect(rounds).toBeGreaterThan(1);
    expect(fingerprint(r.sim)).toBe(fingerprint(straight(createSimulation(SEED), 600)));
  });
});
