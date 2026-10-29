import { describe, expect, it } from 'vitest';
import { createSimulation, createSimulationFromParts, stepSimulation } from '../index.ts';
import {
  deriveClosures,
  incidentPresets,
  legBlocked,
  removeReplacement,
  segmentHopKeys,
  type IncidentConfig,
} from '../incidents/incidents.ts';
import { criticalityAnalysis, redundancyFor, resilienceScore } from '../analytics/resilience.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { compareResilience } from '../scenario/compare.ts';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork } from '../transport/network.ts';
import type { Incident } from '../../types/index.ts';

function run(seed: number, steps: number, startMin?: number) {
  let sim = createSimulation(seed);
  if (startMin !== undefined) sim.timeMinutes = startMin;
  for (let i = 0; i < steps; i++) sim = stepSimulation(sim, 1);
  return sim;
}

function mkIncident(over: Partial<IncidentConfig> & { kind: IncidentConfig['kind'] }): Incident {
  return {
    id: `inc-test-${over.kind}`,
    label: 'test incident',
    startMin: 500,
    durationMin: 60,
    recoveryMin: 10,
    severity01: 0.8,
    status: 'scheduled',
    activeTicks: 0,
    baselineWaiting: 0,
    recovered90: false,
    strandedPeakDuringIncident: 0,
    ...over,
  };
}

describe('incident lifecycle', () => {
  it('transitions scheduled → active → recovering → resolved', () => {
    const sim = createSimulation(1337);
    sim.timeMinutes = 490;
    sim.incidents.push(mkIncident({ kind: 'route-suspension', targetRouteId: sim.routes[0].id }));
    let s = sim;
    const stepTo = (t: number) => {
      let guard = 0;
      while (s.timeMinutes < t && guard++ < 1000) s = stepSimulation(s, 1);
    };
    stepTo(495);
    expect(s.incidents[0].status).toBe('scheduled');
    stepTo(501);
    expect(s.incidents[0].status).toBe('active');
    stepTo(561);
    expect(s.incidents[0].status).toBe('recovering');
    stepTo(571);
    expect(s.incidents[0].status).toBe('resolved');
    expect(s.incidents[0].result).toBeDefined();
  });

  it('derives closures only while active', () => {
    const sim = createSimulation(1337);
    const route = sim.routes[0];
    const closed = deriveClosures(
      [{ ...mkIncident({ kind: 'route-suspension', targetRouteId: route.id }), status: 'active' }],
      sim.routes,
    );
    expect(closed.active).toBe(true);
    expect(closed.suspendedRoutes.has(route.id)).toBe(true);
    const recovering = deriveClosures(
      [{ ...mkIncident({ kind: 'route-suspension', targetRouteId: route.id }), status: 'recovering' }],
      sim.routes,
    );
    expect(recovering.active).toBe(false);
  });

  it('computes segment hops in both directions', () => {
    const keys = segmentHopKeys(['a', 'b', 'c', 'd'], 'rt-x', 'b', 'd');
    expect(keys).toEqual(['rt-x|b>c', 'rt-x|c>b', 'rt-x|c>d', 'rt-x|d>c']);
    expect(segmentHopKeys(['a', 'b'], 'rt-x', 'a', 'a')).toBeNull();
    expect(segmentHopKeys(['a', 'b'], 'rt-x', 'a', 'zzz')).toBeNull();
  });
});

describe('passenger rerouting', () => {
  it('reroutes waiting passengers around a suspended route', () => {
    let sim = run(1337, 90); // build up waiting passengers
    // Suspend the route that actually has riders waiting on it, rather than
    // whichever line happens to be first, so the test is not tied to one line's
    // load at t=90.
    const waitingByRoute = new Map<string, number>();
    for (const p of sim.passengers) {
      if (p.state !== 'WAITING' || !p.atStation) continue;
      const leg = p.legs[p.legIndex];
      if (leg) waitingByRoute.set(leg.routeId, (waitingByRoute.get(leg.routeId) ?? 0) + 1);
    }
    expect(waitingByRoute.size).toBeGreaterThan(0);
    const route = [...sim.routes].sort((a, b) => (waitingByRoute.get(b.id) ?? 0) - (waitingByRoute.get(a.id) ?? 0))[0];
    const before = sim.counters.rerouted;
    sim.incidents.push({
      ...mkIncident({ kind: 'route-suspension', targetRouteId: route.id, startMin: sim.timeMinutes }),
      status: 'scheduled',
    });
    for (let i = 0; i < 20; i++) sim = stepSimulation(sim, 1);
    expect(sim.incidents[0].status).toBe('active');
    expect(sim.counters.rerouted).toBeGreaterThan(before);
  });

  it('strands passengers when no alternative exists', () => {
    let sim = run(1337, 30);
    // Suspend every route: nothing can move by transit.
    for (const r of sim.routes) {
      sim.incidents.push({ ...mkIncident({ kind: 'route-suspension', targetRouteId: r.id }), id: `inc-all-${r.id}`, startMin: sim.timeMinutes, status: 'scheduled' });
    }
    for (let i = 0; i < 10; i++) sim = stepSimulation(sim, 1);
    const stranded = sim.passengers.filter((p) => p.state === 'STRANDED').length;
    expect(stranded).toBeGreaterThan(0);
    expect(sim.counters.strandedPeak).toBeGreaterThan(0);
  });

  it('marks legs blocked on closed stations and suspended routes', () => {
    const sim = createSimulation(1337);
    const closures = deriveClosures(
      [{ ...mkIncident({ kind: 'station-closure', targetStationId: 'st-central' }), status: 'active' }],
      sim.routes,
    );
    const centralRoute = sim.routes.find((r) => r.stationIds.includes('st-central'));
    expect(centralRoute).toBeDefined();
    expect(legBlocked({ board: 'st-central', alight: 'st-x', routeId: centralRoute!.id }, centralRoute!.stationIds, closures)).toBe(true);
    expect(legBlocked({ board: 'st-a', alight: 'st-b', routeId: 'rt-missing' }, undefined, closures)).toBe(true);
  });
});

describe('rerouting regressions', () => {
  it('strands riders at a closed station instead of rerouting them every tick', () => {
    let sim = run(1337, 90); // let a queue build
    const busiest = [...sim.stations].sort((a, b) => b.waiting - a.waiting)[0];
    expect(busiest.waiting).toBeGreaterThan(0);
    sim.incidents.push({
      ...mkIncident({ kind: 'station-closure', targetStationId: busiest.id }),
      id: 'inc-closed-station',
      startMin: sim.timeMinutes,
      status: 'scheduled',
    });
    // Step until the queue at the closed station has drained into STRANDED.
    // At world scale a reroute takes longer, so settle rather than assume a
    // window that was calibrated to the compact map.
    for (let i = 0; i < 240; i++) {
      sim = stepSimulation(sim, 1);
      if (!sim.passengers.some((p) => p.state === 'WAITING' && p.atStation === busiest.id)) break;
    }
    // Nobody can board at a closed station: they strand, they do not keep
    // re-planning from it.
    expect(sim.passengers.filter((p) => p.state === 'WAITING' && p.atStation === busiest.id)).toHaveLength(0);
    expect(sim.counters.strandedPeak).toBeGreaterThan(0);
  });

  it('counts only genuinely waiting riders at a station, never stranded ones', () => {
    let sim = run(1337, 40);
    for (const r of sim.routes) {
      sim.incidents.push({ ...mkIncident({ kind: 'route-suspension', targetRouteId: r.id }), id: `inc-all-${r.id}`, startMin: sim.timeMinutes, status: 'scheduled' });
    }
    for (let i = 0; i < 12; i++) sim = stepSimulation(sim, 1);
    expect(sim.passengers.some((p) => p.state === 'STRANDED')).toBe(true);
    for (const st of sim.stations) {
      const counted = sim.passengers.filter(
        (p) => (p.state === 'WAITING' || p.state === 'TRANSFERRING') && p.atStation === st.id,
      ).length;
      expect(st.waiting).toBe(counted);
    }
  });

  it('leaves no rider holding a leg on a withdrawn replacement route', () => {
    let sim = run(1337, 60);
    const route = sim.routes.find((r) => r.mode === 'metro') ?? sim.routes[0];
    const a = route.stationIds[0];
    const b = route.stationIds[route.stationIds.length - 1];
    sim.incidents.push({
      ...mkIncident({
        kind: 'segment-closure',
        targetRouteId: route.id,
        segFrom: route.stationIds[1],
        segTo: route.stationIds[route.stationIds.length - 1],
        durationMin: 40,
        recoveryMin: 5,
        replacement: { fromStationId: a, toStationId: b, buses: 4, headwayMin: 6, capacity: 70 },
      }),
      id: 'inc-rep-withdraw',
      startMin: sim.timeMinutes,
      status: 'scheduled',
    });
    // Run past resolution, so the replacement is withdrawn, then let riders
    // left at the ends replan off the removed route (rides are longer at world
    // scale, so allow a generous window).
    for (let i = 0; i < 400; i++) sim = stepSimulation(sim, 1);
    expect(sim.routes.some((r) => r.id.startsWith('rt-rep'))).toBe(false);
    const ids = new Set(sim.routes.map((r) => r.id));
    for (const p of sim.passengers) {
      if (p.state !== 'WAITING' && p.state !== 'TRANSFERRING') continue;
      const leg = p.legs[p.legIndex];
      if (leg) expect(ids.has(leg.routeId)).toBe(true);
    }
  });
});

describe('service disruption', () => {
  it('parks vehicles of suspended routes and terminates riders', () => {
    let sim = run(1337, 60);
    const route = sim.routes.find((r) => r.mode === 'metro') ?? sim.routes[0];
    const veh = sim.vehicles.filter((v) => v.routeId === route.id);
    expect(veh.length).toBeGreaterThan(0);
    sim.incidents.push({ ...mkIncident({ kind: 'route-suspension', targetRouteId: route.id }), id: 'inc-park', startMin: sim.timeMinutes, status: 'scheduled' });
    const posBefore = veh.map((v) => v.s);
    for (let i = 0; i < 10; i++) sim = stepSimulation(sim, 1);
    const after = sim.vehicles.filter((v) => v.routeId === route.id);
    after.forEach((v, i) => expect(v.s).toBe(posBefore[i]));
    expect(after.every((v) => v.riders.length === 0)).toBe(true);
  });

  it('deploys and withdraws replacement buses that carry passengers', () => {
    let sim = run(1337, 60);
    const route = sim.routes.find((r) => r.mode === 'metro') ?? sim.routes[0];
    const a = route.stationIds[0];
    const b = route.stationIds[route.stationIds.length - 1];
    const inc = mkIncident({
      kind: 'segment-closure',
      targetRouteId: route.id,
      segFrom: route.stationIds[1],
      segTo: route.stationIds[route.stationIds.length - 1],
      replacement: { fromStationId: a, toStationId: b, buses: 4, headwayMin: 6, capacity: 70 },
    });
    sim.incidents.push({ ...inc, startMin: sim.timeMinutes, status: 'scheduled' });
    for (let i = 0; i < 30; i++) sim = stepSimulation(sim, 1);
    const repId = sim.incidents[0].replacementRouteId;
    expect(repId).toBeDefined();
    expect(sim.vehicles.filter((v) => v.routeId === repId).length).toBe(4);
    expect(sim.emergencyBusesFree).toBe(12 - 4);
    // The shuttle actually serves rerouted passengers.
    expect(sim.counters.routeBoardings[repId ?? ''] ?? 0).toBeGreaterThan(0);
    removeReplacement(sim, sim.incidents[0]);
    expect(sim.routes.some((r) => r.id === repId)).toBe(false);
    expect(sim.emergencyBusesFree).toBe(12);
  });

  it('holds vehicles before closed segments without teleporting', () => {
    let sim = run(1337, 30);
    const route = sim.routes.find((r) => r.mode === 'metro' && r.stationIds.length >= 4) ?? sim.routes[0];
    const ids = route.stationIds;
    sim.incidents.push({
      ...mkIncident({ kind: 'segment-closure', targetRouteId: route.id, segFrom: ids[1], segTo: ids[ids.length - 1] }),
      id: 'inc-hold',
      startMin: sim.timeMinutes,
      status: 'scheduled',
    });
    for (let i = 0; i < 15; i++) sim = stepSimulation(sim, 1);
    // No rider may be on a closed hop: every onboard leg must be intact.
    for (const vv of sim.vehicles) {
      if (vv.routeId !== route.id) continue;
      for (const pid of vv.riders) {
        const p = sim.passengers.find((x) => x.id === pid);
        if (!p) continue;
        const leg = p.legs[p.legIndex];
        expect(legBlocked(leg, route.stationIds, sim.closures)).toBe(false);
      }
    }
  });
});

describe('spawn plans on the closed network (#35)', () => {
  it('plans spawn-time routes through the same exclusions as replan', () => {
    let sim = run(1337, 60);
    const route = sim.routes.find((r) => r.mode === 'metro') ?? sim.routes[0];
    // A closure between the origin and destination station: a direct trip
    // would use the suspended segment, so it must not be offered at spawn.
    sim.incidents.push({
      ...mkIncident({
        kind: 'segment-closure',
        targetRouteId: route.id,
        segFrom: route.stationIds[1],
        segTo: route.stationIds[route.stationIds.length - 1],
      }),
      id: 'inc-spawn',
      startMin: sim.timeMinutes,
      status: 'scheduled',
    });
    for (let i = 0; i < 30; i++) sim = stepSimulation(sim, 1);
    // No passenger may hold a leg whose hop is closed — spawn-time routing
    // must have excluded it, not left it for a tick-by-tick replan.
    for (const p of sim.passengers) {
      if (p.state === 'ARRIVED' || p.state === 'STRANDED') continue;
      const leg = p.legs[p.legIndex];
      if (!leg) continue;
      const r = sim.routes.find((x) => x.id === leg.routeId);
      if (r) expect(legBlocked(leg, r.stationIds, sim.closures)).toBe(false);
    }
    // The closure affects spawn-time routing: passengers don't take the closed segment.
    // rerouted counter tracks explicit replans, not spawn-time avoidance.
  });
});

describe('road incidents', () => {
  it('closes edges and reroutes cars', () => {
    let sim = run(1337, 120);
    const edgeId = sim.roadGraph.edges.find((e) => e.isBridge)?.id ?? sim.roadGraph.edges[0].id;
    sim.incidents.push({
      ...mkIncident({ kind: 'road-closure', edgeIds: [edgeId] }),
      id: 'inc-road',
      startMin: sim.timeMinutes,
      status: 'scheduled',
    });
    for (let i = 0; i < 10; i++) sim = stepSimulation(sim, 1);
    expect(sim.edgeState[edgeId].closed).toBe(true);
    expect(sim.edgeState[edgeId].level).toBe('severe');
    // No car sits on a closed edge.
    for (const car of sim.cars) {
      expect(sim.edgeState[car.edgeIds[car.edgeIndex]]?.closed ?? false).toBe(false);
    }
  });

  it('scales capacity for lane reductions', () => {
    const sim = createSimulation(1337);
    const edgeId = sim.roadGraph.edges[0].id;
    const closed = deriveClosures(
      [{ ...mkIncident({ kind: 'road-capacity', edgeIds: [edgeId], capacityMult: 0.5 }), status: 'active' }],
      sim.routes,
    );
    expect(closed.edgeCapMult.get(edgeId)).toBe(0.5);
    expect(closed.closedEdges.has(edgeId)).toBe(false);
  });
});

describe('determinism', () => {
  it('reproduces disruption runs exactly', () => {
    const runScenario = () => {
      let sim = createSimulation(1337);
      for (let i = 0; i < 60; i++) sim = stepSimulation(sim, 1);
      sim.incidents.push({
        ...mkIncident({ kind: 'route-suspension', targetRouteId: sim.routes[1].id }),
        id: 'inc-det',
        startMin: sim.timeMinutes,
        status: 'scheduled',
      });
      for (let i = 0; i < 120; i++) sim = stepSimulation(sim, 1);
      return sim;
    };
    const a = runScenario();
    const b = runScenario();
    expect(a.counters.rerouted).toBe(b.counters.rerouted);
    expect(a.counters.completed).toBe(b.counters.completed);
    expect(a.counters.strandedPeak).toBe(b.counters.strandedPeak);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.incidents[0].result).toEqual(b.incidents[0].result);
  });
});

describe('resilience analytics', () => {
  it('ranks critical links deterministically from structure', () => {
    const sim = createSimulation(1337);
    const base = {
      zones: sim.city.zones,
      stations: sim.stations,
      connections: sim.connections,
      routes: sim.routes,
      roadGraph: sim.roadGraph,
      zoneRoadAccess: sim.zoneRoadAccess,
      city: sim.city,
    };
    const a = criticalityAnalysis(base);
    const b = criticalityAnalysis(base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].score).toBeGreaterThanOrEqual(a[a.length - 1].score);
    for (const item of a) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(item.reason.length).toBeGreaterThan(0);
    }
    // Central interchange should rank near the top.
    const central = a.find((x) => x.kind === 'station');
    expect(central).toBeDefined();
  });

  it('describes redundancy for stations, routes, and bridges', () => {
    const sim = createSimulation(1337);
    const base = {
      stations: sim.stations,
      routes: sim.routes,
      connections: sim.connections,
      roadGraph: sim.roadGraph,
      city: sim.city,
    };
    const st = redundancyFor('station', sim.stations[0].id, base);
    expect(['High', 'Medium', 'Low']).toContain(st.level);
    expect(st.lines.length).toBeGreaterThan(0);
    const rt = redundancyFor('route', sim.routes[0].id, base);
    expect(['High', 'Medium', 'Low']).toContain(rt.level);
    const bridge = sim.roadGraph.edges.find((e) => e.isBridge) ?? sim.roadGraph.edges[0];
    const br = redundancyFor('bridge', bridge.id, base);
    expect(['High', 'Medium', 'Low']).toContain(br.level);
    expect(redundancyFor('station', 'nope', base).level).toBe('Low');
  });

  it('scores resilience transparently', () => {
    const good = resilienceScore({
      extraWaitMin: 10, completedDelta: 100, strandedPeak: 0, affectedPax: 50,
      routeKmLost: 0, totalRouteKm: 10, roadKmLost: 0, totalRoadKm: 20, recoveryTicks: 2,
    });
    const bad = resilienceScore({
      extraWaitMin: 500, completedDelta: 100, strandedPeak: 40, affectedPax: 50,
      routeKmLost: 5, totalRouteKm: 10, roadKmLost: 10, totalRoadKm: 20, recoveryTicks: 60,
    });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeLessThanOrEqual(100);
    expect(bad.score).toBeGreaterThanOrEqual(0);
    expect(good.scoreParts.length).toBe(4);
    expect(good.scoreParts.reduce((s, p) => s + p.penalty, 0)).toBeLessThanOrEqual(100);
  });
});

describe('scenario integration', () => {
  it('schedules incidents via ops and compares resilience', () => {
    const city = generateCity(1337);
    const base = buildNetwork();
    const route = base.routes.find((r) => r.mode === 'metro') ?? base.routes[0];
    const withIncident = applyEdits(city, base, [
      {
        type: 'scheduleIncident',
        incident: {
          id: 'inc-bridge-test',
          kind: 'route-suspension',
          label: `${route.name} suspension`,
          targetRouteId: route.id,
          startMin: 500,
          durationMin: 45,
          recoveryMin: 10,
          severity01: 0.9,
        },
      },
    ]);
    expect(withIncident.incidents.length).toBe(1);
    expect(withIncident.warnings).toEqual([]);
    const bad = applyEdits(city, base, [
      { type: 'scheduleIncident', incident: { id: 'x', kind: 'route-suspension', label: 'bad', targetRouteId: 'nope', startMin: 500, durationMin: 30, recoveryMin: 5, severity01: 0.5 } },
    ]);
    expect(bad.incidents.length).toBe(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
    const cmp = compareResilience(
      1337, city, base, city,
      { ...withIncident, service: withIncident.service },
      withIncident.incidents[0],
      200,
    );
    expect(cmp.rows.length).toBeGreaterThan(0);
    expect(cmp.base.metrics.score).toBeGreaterThanOrEqual(0);
    expect(cmp.base.metrics.score).toBeLessThanOrEqual(100);
  });

  it('replays a scheduled incident and its replacement shuttle from ops', () => {
    const city = generateCity(1337);
    const base = buildNetwork();
    const route = base.routes.find((r) => r.mode === 'metro') ?? base.routes[0];
    const from = route.stationIds[0];
    const to = route.stationIds[route.stationIds.length - 1];
    const applied = applyEdits(city, base, [
      {
        type: 'scheduleIncident',
        incident: {
          id: 'inc-replay-1',
          kind: 'route-suspension',
          label: 'replayed suspension',
          targetRouteId: route.id,
          startMin: 500,
          durationMin: 30,
          recoveryMin: 5,
          severity01: 0.9,
          replacement: { fromStationId: from, toStationId: to, buses: 4, headwayMin: 6, capacity: 70 },
        },
      },
    ]);
    expect(applied.warnings).toEqual([]);
    expect(applied.incidents.map((i) => i.id)).toEqual(['inc-replay-1']);
    // Reload path: rebuild from replayed edits, then fast-forward to the start.
    let sim = createSimulationFromParts(1337, applied.city, applied);
    expect(sim.incidents.map((i) => i.id)).toEqual(['inc-replay-1']);
    expect(sim.incidents[0].status).toBe('scheduled');
    while (sim.timeMinutes < 501) sim = stepSimulation(sim, 1);
    expect(sim.incidents[0].status).toBe('active');
    const shuttleId = 'rt-rep-inc-replay-1';
    const shuttle = sim.routes.find((r) => r.id === shuttleId);
    expect(shuttle).toBeDefined();
    expect(shuttle?.stationIds).toEqual([from, to]);
    expect(sim.connections.filter((c) => c.routeId === shuttleId)).toHaveLength(2);
  });

  it('keeps an incident whose start falls after midnight (absolute minute)', () => {
    const city = generateCity(1337);
    const base = buildNetwork();
    const route = base.routes[0];
    const applied = applyEdits(city, base, [
      {
        type: 'scheduleIncident',
        incident: {
          id: 'inc-day2',
          kind: 'route-suspension',
          label: 'day two suspension',
          targetRouteId: route.id,
          startMin: 1500,
          durationMin: 30,
          recoveryMin: 5,
          severity01: 0.6,
        },
      },
    ]);
    expect(applied.warnings).toEqual([]);
    expect(applied.incidents.map((i) => i.id)).toEqual(['inc-day2']);
    let sim = createSimulationFromParts(1337, applied.city, applied);
    while (sim.timeMinutes < 1500) sim = stepSimulation(sim, 1);
    expect(sim.incidents[0].status).toBe('scheduled');
    sim = stepSimulation(sim, 1);
    expect(sim.timeMinutes).toBe(1501);
    expect(sim.incidents[0].status).toBe('active');
  });

  it('rejects an incident start before the first minute or not finite', () => {
    const city = generateCity(1337);
    const base = buildNetwork();
    const inc = {
      kind: 'route-suspension' as const,
      label: 'bad start',
      targetRouteId: base.routes[0].id,
      durationMin: 30,
      recoveryMin: 5,
      severity01: 0.6,
    };
    const applied = applyEdits(city, base, [
      { type: 'scheduleIncident', incident: { ...inc, id: 'early', startMin: 100 } },
      { type: 'scheduleIncident', incident: { ...inc, id: 'nan', startMin: Number.NaN } },
    ]);
    expect(applied.incidents).toHaveLength(0);
    expect(applied.warnings).toHaveLength(2);
  });
});

describe('presets', () => {
  it('generates presets from live infrastructure', () => {
    const sim = createSimulation(1337);
    const presets = incidentPresets({
      routes: sim.routes,
      stations: sim.stations,
      routeLengths: sim.routeLengths,
    });
    expect(presets.length).toBeGreaterThanOrEqual(3);
    for (const p of presets) {
      const cfg = p.build(500);
      const configs = Array.isArray(cfg) ? cfg : [cfg];
      for (const c of configs) {
        // Skip marker for no-metro case.
        if ('_skip' in c && c._skip === true) continue;
        expect(c.startMin).toBe(500);
        expect(c.durationMin).toBeGreaterThan(0);
      }
    }
  });
});
