import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { buildNetwork, validateNetwork } from '../transport/network.ts';
import { applyEdits } from '../scenario/applyEdits.ts';
import { buildCompareRows, runHeadless } from '../scenario/compare.ts';
import {
  nextRouteId,
  nextStationId,
  pushOp,
  redoOp,
  undoOp,
  validateStationPlacement,
  type EditOp,
} from '../scenario/scenario.ts';
import { deserializeScenario, serializeScenario } from '../scenario/store.ts';
import { buildRoutePlan } from '../passengers/passengers.ts';

const SEED = 1337;
const city = generateCity(SEED);
const base = buildNetwork();

describe('scenario edits', () => {
  it('adds a station and a metro route that passengers can use', () => {
    const ops: EditOp[] = [
      { type: 'addStation', station: { id: 'st-u1', name: 'Uptown', x: -80, z: -200, capacityPerHr: 4000 } },
      {
        type: 'addRoute',
        route: {
          id: 'rt-um3', name: 'M3 Metro', mode: 'metro', color: '#22d3ee',
          stationIds: ['st-north-res', 'st-u1', 'st-mid-north'],
          headwayMin: 6, speedKph: 32, vehicleCapacity: 800,
        },
      },
    ];
    const mod = applyEdits(city, base, ops);
    expect(mod.warnings).toEqual([]);
    expect(validateNetwork({ ...base, stations: mod.stations, routes: mod.routes, connections: mod.connections })).toEqual([]);
    const legs = buildRoutePlan(mod.connections, 'st-north-res', 'st-u1');
    expect(legs).not.toBeNull();
    expect(legs?.[0].routeId).toBe('rt-um3');
    expect(mod.cost).toBeGreaterThan(0);
  });

  it('extends a route and builds roads', () => {
    const ops: EditOp[] = [
      { type: 'addStation', station: { id: 'st-u1', name: 'Uptown', x: -80, z: -200, capacityPerHr: 4000 } },
      { type: 'extendRoute', routeId: 'rt-m1', stationIds: ['st-u1'] },
      {
        type: 'addRoad',
        nodes: [{ id: 'rn-u1-1', x: 60, z: 60 }, { id: 'rn-u1-2', x: 60, z: 180 }],
        edges: [{ id: 're-u1-1', a: 'rn-u1-1', b: 'rn-u1-2', kind: 'arterial' }],
      },
    ];
    const mod = applyEdits(city, base, ops);
    expect(mod.warnings).toEqual([]);
    const m1 = mod.routes.find((r) => r.id === 'rt-m1');
    expect(m1?.stationIds).toContain('st-u1');
    expect(mod.city.roadEdges.some((e) => e.id === 're-u1-1')).toBe(true);
  });

  it('deletes infrastructure without invalid states', () => {
    const ops: EditOp[] = [
      { type: 'removeRoute', routeId: 'rt-b3' },
      { type: 'removeStation', stationId: 'st-west-mid' },
      { type: 'removeRoad', edgeId: 're-0' },
    ];
    const mod = applyEdits(city, base, ops);
    expect(mod.routes.some((r) => r.id === 'rt-b3')).toBe(false);
    expect(mod.stations.some((s) => s.id === 'st-west-mid')).toBe(false);
    expect(mod.city.roadEdges.some((e) => e.id === 're-0')).toBe(false);
    // No dangling references remain.
    const stationIds = new Set(mod.stations.map((s) => s.id));
    for (const r of mod.routes) {
      expect(r.stationIds.length).toBeGreaterThanOrEqual(2);
      for (const sid of r.stationIds) expect(stationIds.has(sid)).toBe(true);
    }
    expect(validateNetwork({ ...base, stations: mod.stations, routes: mod.routes, connections: mod.connections })).toEqual([]);
  });

  it('skips invalid ops with warnings instead of throwing', () => {
    const ops: EditOp[] = [
      { type: 'addRoute', route: { id: 'rt-bad', name: 'Bad', mode: 'bus', color: '#fff', stationIds: ['nope'], headwayMin: 10, speedKph: 18, vehicleCapacity: 70 } },
      { type: 'removeStation', stationId: 'nope' },
      { type: 'removeRoad', edgeId: 'nope' },
    ];
    const mod = applyEdits(city, base, ops);
    expect(mod.warnings.length).toBeGreaterThanOrEqual(3);
    expect(mod.routes.length).toBe(base.routes.length);
  });

  it('prices bus below metro and validates placement', () => {
    const metro = applyEdits(city, base, [
      { type: 'addRoute', route: { id: 'rt-um3', name: 'M3', mode: 'metro', color: '#fff', stationIds: ['st-central', 'st-old-town'], headwayMin: 6, speedKph: 32, vehicleCapacity: 800 } },
    ]);
    const bus = applyEdits(city, base, [
      { type: 'addRoute', route: { id: 'rt-ub4', name: 'B4', mode: 'bus', color: '#fff', stationIds: ['st-central', 'st-old-town'], headwayMin: 12, speedKph: 18, vehicleCapacity: 70 } },
    ]);
    expect(metro.cost).toBeGreaterThan(bus.cost);
    expect(validateStationPlacement(0, 0)).toBeNull();
    expect(validateStationPlacement(-400, 0)).not.toBeNull();
    expect(validateStationPlacement(120, 0)).not.toBeNull();
  });
});

describe('scenario history and serialization', () => {
  it('supports undo/redo as pure op-log operations', () => {
    const op: EditOp = { type: 'removeRoute', routeId: 'rt-b1' };
    const s1 = pushOp([], [], op);
    expect(s1.ops.length).toBe(1);
    expect(s1.redo.length).toBe(0);
    const s2 = undoOp(s1.ops, s1.redo);
    expect(s2.ops.length).toBe(0);
    expect(s2.redo.length).toBe(1);
    const s3 = redoOp(s2.ops, s2.redo);
    expect(s3.ops.length).toBe(1);
    // New op clears redo.
    const s4 = pushOp(s2.ops, s2.redo, op);
    expect(s4.redo.length).toBe(0);
  });

  it('round-trips through versioned serialization', () => {
    const ops: EditOp[] = [{ type: 'addStation', station: { id: nextStationId([]), name: 'U', x: 0, z: 100, capacityPerHr: 4000 } }];
    void nextRouteId;
    const sc = { version: 1 as const, id: 'sc-1', name: 'Test', seed: SEED, ops, updatedAt: 0 };
    const back = deserializeScenario(serializeScenario(sc));
    expect(back).toEqual(sc);
    expect(deserializeScenario('garbage')).toBeNull();
    expect(deserializeScenario('{"version":99}')).toBeNull();
  });

  it('derives deterministic ids from the op sequence', () => {
    expect(nextStationId([])).toBe('st-u1');
    expect(nextStationId([{ type: 'removeRoute', routeId: 'rt-b1' }])).toBe('st-u1');
  });
});

describe('scenario comparison', () => {
  it('runs headless base vs modified and builds rows', () => {
    const ops: EditOp[] = [
      {
        type: 'addRoute',
        route: {
          id: 'rt-um3', name: 'M3 Metro', mode: 'metro', color: '#22d3ee',
          stationIds: ['st-central', 'st-park-east', 'st-airport'],
          headwayMin: 6, speedKph: 32, vehicleCapacity: 800,
        },
      },
    ];
    const mod = applyEdits(city, base, ops);
    const baseStats = runHeadless(SEED, city, base, 60);
    const modStats = runHeadless(SEED, mod.city, mod, 60);
    expect(baseStats.generated).toBeGreaterThan(0);
    expect(modStats.generated).toBeGreaterThan(0);
    const rows = buildCompareRows(baseStats, modStats, 0, mod.cost);
    expect(rows.length).toBe(12);
    expect(rows.some((r) => r.label === 'Fare revenue')).toBe(true);
    expect(rows.some((r) => r.label === 'Cost recovery')).toBe(true);
    expect(rows.some((r) => r.label === 'Subsidy')).toBe(true);
    expect(rows[rows.length - 1].mod).not.toBe('₹0L');
  });
});
