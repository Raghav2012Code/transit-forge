import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';
import { bprRatio, congestionLevel } from '../traffic/bpr.ts';
import { carProbability, chooseMode } from '../traffic/modeChoice.ts';
import { findRoadPath, validateRoadGraph } from '../traffic/roadGraph.ts';
import { refreshEdges } from '../traffic/cars.ts';

function run(seed: number, steps: number, startMin?: number) {
  let sim = createSimulation(seed);
  if (startMin !== undefined) sim.timeMinutes = startMin;
  for (let i = 0; i < steps; i++) sim = stepSimulation(sim, 1);
  return sim;
}

describe('road graph', () => {
  it('is valid and fully connected', () => {
    const sim = createSimulation(1337);
    const nodeIds = sim.city.roadNodes.map((n) => n.id);
    expect(validateRoadGraph(sim.roadGraph, nodeIds)).toEqual([]);
    for (const a of nodeIds) {
      for (const b of nodeIds) {
        expect(findRoadPath(sim.roadGraph, a, b, (id) => sim.roadGraph.freeMin.get(id) ?? 1)).not.toBeNull();
      }
    }
  });

  it('finds shortest paths and respects custom costs', () => {
    const sim = createSimulation(1337);
    const free = (id: string) => sim.roadGraph.freeMin.get(id) ?? 1;
    const direct = findRoadPath(sim.roadGraph, 'rn-w1', 'rn-a1', free);
    expect(direct).not.toBeNull();
    expect(direct?.edgeIds.length ?? 0).toBeGreaterThan(0);
    expect(direct?.totalMin ?? 0).toBeGreaterThan(0);
    // Inflating the bridge edge cost reroutes around it.
    const first = direct?.edgeIds[0] ?? '';
    const avoid = findRoadPath(sim.roadGraph, 'rn-w1', 'rn-a1', (id) => (id === first ? 1000 : free(id)));
    expect(avoid).not.toBeNull();
    expect(avoid?.edgeIds).not.toContain(first);
  });
});

describe('congestion model', () => {
  it('matches BPR behavior across load regimes', () => {
    expect(bprRatio(0)).toBeCloseTo(1, 6);
    expect(bprRatio(1)).toBeCloseTo(1.15, 6);
    expect(bprRatio(2)).toBeCloseTo(3.4, 6);
    expect(congestionLevel(0.2)).toBe('free');
    expect(congestionLevel(0.5)).toBe('light');
    expect(congestionLevel(0.7)).toBe('moderate');
    expect(congestionLevel(0.9)).toBe('heavy');
    expect(congestionLevel(1.2)).toBe('severe');
  });

  it('raises travel time with load and never below free-flow', () => {
    const sim = createSimulation(1337);
    refreshEdges(sim);
    for (const e of sim.roadGraph.edges) {
      const st = sim.edgeState[e.id];
      expect(st.vc).toBeGreaterThanOrEqual(0);
      expect(st.currentMin).toBeGreaterThanOrEqual(sim.roadGraph.freeMin.get(e.id) ?? 0);
    }
    const before = sim.edgeState['re-3'].currentMin;
    sim.edgeState['re-3'].load = 200;
    refreshEdges(sim);
    expect(sim.edgeState['re-3'].currentMin).toBeGreaterThan(before * 1.5);
  });
});

describe('mode choice', () => {
  it('is deterministic and penalizes transfers and CBD parking', () => {
    const a = chooseMode(0.3, 10, 0, 8, 'suburban');
    expect(chooseMode(0.3, 10, 0, 8, 'suburban')).toBe(a);
    // More transfers push travelers toward cars.
    expect(carProbability(10, 3, 8, 'suburban')).toBeGreaterThan(carProbability(10, 0, 8, 'suburban'));
    // CBD parking penalty suppresses car use.
    expect(carProbability(10, 0, 8, 'cbd')).toBeLessThan(carProbability(10, 0, 8, 'suburban'));
  });
});

describe('multimodal simulation', () => {
  it('generates car trips that complete on the road graph', () => {
    const sim = run(1337, 240);
    expect(sim.roadCounters.generated).toBeGreaterThan(50);
    expect(sim.roadCounters.completed).toBeGreaterThan(20);
    for (const car of sim.cars) {
      expect(car.edgeIndex).toBeLessThan(car.edgeIds.length);
      expect(car.s).toBeGreaterThanOrEqual(0);
    }
    for (const id in sim.edgeState) expect(sim.edgeState[id].load).toBeGreaterThanOrEqual(0);
  });

  it('slows buses when their roads congest', () => {
    const sim = createSimulation(1337);
    const busRoute = sim.routes.find((r) => r.mode === 'bus' && (sim.busRoadMap[r.id]?.length ?? 0) > 0);
    expect(busRoute).toBeDefined();
    for (const id of sim.busRoadMap[busRoute?.id ?? ''] ?? []) sim.edgeState[id].load = 200;
    const next = stepSimulation(sim, 1);
    expect(next.busRouteCongestion[busRoute?.id ?? ''] ?? 1).toBeGreaterThan(1.2);
  });

  it('produces stronger road demand in the AM peak than at night', () => {
    const am = run(1337, 60, 7 * 60);
    const night = run(1337, 60, 2 * 60);
    expect(am.roadCounters.generated).toBeGreaterThan(night.roadCounters.generated * 2);
  });

  it('stays deterministic including road state', () => {
    const a = run(1337, 90);
    const b = run(1337, 90);
    expect(a.roadCounters.generated).toBe(b.roadCounters.generated);
    expect(a.roadCounters.completed).toBe(b.roadCounters.completed);
    expect(a.cars.length).toBe(b.cars.length);
    expect(JSON.stringify(a.edgeState)).toBe(JSON.stringify(b.edgeState));
    expect(a.counters.generated).toBe(b.counters.generated);
    expect(a.counters.completed).toBe(b.counters.completed);
  });
});
