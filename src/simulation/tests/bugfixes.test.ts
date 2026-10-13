import { describe, expect, it } from 'vitest';
import { createSimulation, stepSimulation } from '../index.ts';
import { deriveClosures } from '../incidents/incidents.ts';
import { baseVC } from '../traffic/cars.ts';
import { buildRoadGraph } from '../traffic/roadGraph.ts';
import { reconcileFleet } from '../service/live.ts';
import { computeStats } from '../statistics.ts';
import { generateCity } from '../city/generateCity.ts';
import type { Incident } from '../../types/index.ts';

const mkIncident = (over: Partial<Incident> & { id: string; kind: Incident['kind'] }): Incident => ({
  label: over.id, startMin: 500, durationMin: 60, recoveryMin: 10, severity01: 0.8,
  status: 'active', activeTicks: 0, baselineWaiting: 0, recovered90: false, strandedPeakDuringIncident: 0,
  ...over,
});

describe('bug fixes', () => {
  it('a capacity cut never re-opens an edge another incident closed', () => {
    const routes = createSimulation(1337).routes;
    const edge = 're-3';
    const closure = mkIncident({ id: 'c', kind: 'road-closure', edgeIds: [edge] });
    const capacity = mkIncident({ id: 'k', kind: 'road-capacity', edgeIds: [edge], capacityMult: 0.5 });
    // Order must not matter: capacity after closure.
    const a = deriveClosures([closure, capacity], routes);
    expect(a.closedEdges.has(edge)).toBe(true);
    // And closure after capacity.
    const b = deriveClosures([capacity, closure], routes);
    expect(b.closedEdges.has(edge)).toBe(true);
  });

  it('wraps the background peak curve past midnight', () => {
    const graph = buildRoadGraph(generateCity(1337));
    const edge = graph.edges[0].id;
    // 08:12 and 32:12 (next day) are the same time of day.
    expect(baseVC(edge, 8 * 60 + 12, graph)).toBeCloseTo(baseVC(edge, 32 * 60 + 12, graph), 10);
  });

  it('keeps the fleet when a service edit lands outside the operating window', () => {
    const sim = createSimulation(1337);
    const routeId = sim.routes[0].id;
    const before = sim.vehicles.filter((v) => v.routeId === routeId).length;
    expect(before).toBeGreaterThan(0);
    sim.timeMinutes = 1440; // 24:00, past the operating window
    reconcileFleet(sim, routeId);
    expect(sim.vehicles.filter((v) => v.routeId === routeId).length).toBe(before);
  });

  it('does not let a closed road drag the mean congestion', () => {
    const sim = createSimulation(1337);
    let s = sim;
    for (let i = 0; i < 40; i++) s = stepSimulation(s, 1);
    const open = computeStats(s).avgCongestion;
    const edge = s.roadGraph.edges[0].id;
    s.incidents.push(mkIncident({ id: 'closed', kind: 'road-closure', edgeIds: [edge] }));
    s = stepSimulation(s, 1);
    expect(s.edgeState[edge].vc).toBe(99);
    // The sentinel must not pull the network mean.
    expect(computeStats(s).avgCongestion).toBeLessThanOrEqual(open + 0.05);
  });

  it('retries stranded riders after the disruption resolves', () => {
    let s = createSimulation(1337);
    for (let i = 0; i < 60; i++) s = stepSimulation(s, 1);
    const route = s.routes.find((r) => r.mode === 'metro') ?? s.routes[0];
    const inc = mkIncident({ id: 'suspend', kind: 'route-suspension', targetRouteId: route.id, durationMin: 30, recoveryMin: 5 });
    s.incidents.push(inc);
    for (let i = 0; i < 30; i++) s = stepSimulation(s, 1);
    expect(s.passengers.some((p) => p.state === 'STRANDED')).toBe(true);
    // Let the incident resolve, then give the retry loop a few cycles.
    for (let i = 0; i < 60; i++) s = stepSimulation(s, 1);
    expect(s.passengers.some((p) => p.state === 'STRANDED' && p.strandedMin >= 45)).toBe(false);
  });
});
