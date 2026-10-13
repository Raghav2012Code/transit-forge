import { describe, expect, it } from 'vitest';
import { createSimulation, createSimulationFromParts, stepSimulation, type SimulationState } from '../index.ts';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import type { EditOp } from '../scenario/scenario.ts';
import { applyFares, applyServicePatch } from '../service/live.ts';
import { computeStats } from '../statistics.ts';

const SEED = 1337;
const ROUTE = 'rt-m1';
const START = 420;

const city = generateCity(SEED);
const net = buildNetwork();

function build(ops: EditOp[]): SimulationState {
  const mod = applyEdits(city, net, ops);
  return createSimulationFromParts(SEED, mod.city, mod);
}

function step(sim: SimulationState, ticks: number): SimulationState {
  let s = sim;
  for (let i = 0; i < ticks; i++) s = stepSimulation(s, 1);
  return s;
}

/** Everything a day's result is made of, in one comparable string. */
function fingerprint(sim: SimulationState): string {
  return JSON.stringify({
    stats: computeStats(sim),
    rng: sim.rng,
    tick: sim.tick,
    time: sim.timeMinutes,
    passengers: sim.passengers.length,
    cars: sim.cars.length,
    vehicles: sim.vehicles.map((v) => [v.id, v.routeId, Math.round(v.s * 100), v.load]),
    service: sim.service,
    fares: sim.fares,
  });
}

describe('applyEdits and timed ops', () => {
  const patch = { peakHeadwayMin: 4 };

  it('folds an op with no atMin into the start-of-day plan, as before', () => {
    const mod = applyEdits(city, net, [{ type: 'setService', routeId: ROUTE, patch }]);
    expect(mod.service[ROUTE].peakHeadwayMin).toBe(4);
    expect(mod.timed).toEqual([]);
  });

  it('leaves a timed op out of the start-of-day plan and returns it', () => {
    const base = applyEdits(city, net, []);
    const mod = applyEdits(city, net, [{ type: 'setService', routeId: ROUTE, patch, atMin: 600 }]);
    expect(mod.service[ROUTE].peakHeadwayMin).toBe(base.service[ROUTE].peakHeadwayMin);
    expect(mod.timed).toHaveLength(1);
    expect(mod.timed[0].atMin).toBe(600);
  });

  it('does the same for fares', () => {
    const mod = applyEdits(city, net, [{ type: 'setFares', fares: { metro: 5, rail: 5, bus: 5 }, atMin: 600 }]);
    expect(mod.fares).toEqual({ metro: 0, rail: 0, bus: 0 });
    expect(mod.timed).toHaveLength(1);
  });

  it('skips a timed edit for an unknown route with a warning', () => {
    const mod = applyEdits(city, net, [{ type: 'setService', routeId: 'rt-nope', patch, atMin: 600 }]);
    expect(mod.timed).toEqual([]);
    expect(mod.warnings.some((w) => /unknown route/.test(w))).toBe(true);
  });

  it('orders timed ops by time, then by the order given', () => {
    const mod = applyEdits(city, net, [
      { type: 'setFares', fares: { metro: 3, rail: 3, bus: 3 }, atMin: 700 },
      { type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 10 }, atMin: 600 },
      { type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 6 }, atMin: 600 },
    ]);
    expect(mod.timed.map((o) => o.atMin)).toEqual([600, 600, 700]);
    expect(mod.timed[0].type === 'setService' && mod.timed[0].patch.peakHeadwayMin).toBe(10);
    expect(mod.timed[1].type === 'setService' && mod.timed[1].patch.peakHeadwayMin).toBe(6);
  });
});

describe('a timed op fires at its minute', () => {
  const ops: EditOp[] = [{ type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 4 }, atMin: 600 }];

  it('changes nothing before the minute and applies at the first step that reaches it', () => {
    let sim = build(ops);
    const before = sim.service[ROUTE].peakHeadwayMin;
    sim = step(sim, 600 - START); // clock now 600; the op fires at the start of the next step
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(before);
    expect(sim.pendingTimed).toHaveLength(1);
    sim = step(sim, 1);
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(4);
    expect(sim.pendingTimed).toHaveLength(0);
  });

  it('applies two ops with the same minute in the order given', () => {
    let sim = build([
      { type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 10 }, atMin: 600 },
      { type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 6 }, atMin: 600 },
    ]);
    sim = step(sim, 600 - START + 1);
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(6);
  });

  it('fires an op whose minute is already past on the first step', () => {
    let sim = build([{ type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 4 }, atMin: 0 }]);
    sim = step(sim, 1);
    expect(sim.service[ROUTE].peakHeadwayMin).toBe(4);
  });
});

describe('live, replay and headless agree', () => {
  it('a no-edit scenario matches the plain simulation exactly', () => {
    expect(fingerprint(step(build([]), 200))).toBe(fingerprint(step(createSimulation(SEED), 200)));
  });

  it('an edit made live at a minute equals the same edit replayed from the start', () => {
    // Live: step to 10:00, edit, carry on.
    let live = createSimulation(SEED);
    live = step(live, 600 - START);
    applyServicePatch(live, ROUTE, { peakHeadwayMin: 4, fleetSize: 7 });
    live = step(live, 200);
    // Replay: the same edit as a timed op, stepped straight through.
    const replay = step(build([{ type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 4, fleetSize: 7 }, atMin: 600 }]), 600 - START + 200);
    expect(fingerprint(replay)).toBe(fingerprint(live));
  });

  it('a fare change made live equals the same change replayed', () => {
    let live = createSimulation(SEED);
    live = step(live, 120);
    applyFares(live, { metro: 6, rail: 6, bus: 6 });
    live = step(live, 200);
    const replay = step(build([{ type: 'setFares', fares: { metro: 6, rail: 6, bus: 6 }, atMin: START + 120 }]), 320);
    expect(fingerprint(replay)).toBe(fingerprint(live));
  });

  it('is identical to the unedited day before the edit minute', () => {
    const edited = step(build([{ type: 'setService', routeId: ROUTE, patch: { peakHeadwayMin: 4 }, atMin: 600 }]), 600 - START);
    const plain = step(createSimulation(SEED), 600 - START);
    expect(fingerprint(edited)).toBe(fingerprint(plain));
  });

  it('stepping the same timed scenario twice gives the same day', () => {
    const ops: EditOp[] = [
      { type: 'setService', routeId: ROUTE, patch: { fleetSize: 6 }, atMin: 500 },
      { type: 'setFares', fares: { metro: 4, rail: 4, bus: 4 }, atMin: 700 },
    ];
    expect(fingerprint(step(build(ops), 400))).toBe(fingerprint(step(build(ops), 400)));
  });
});
