import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildRoutePath,
  buildVehicles,
  syncVehicleMeshes,
  updateVehicles,
} from './vehicles.ts';
import type { Station, TransportRoute, VehicleState } from '../../types/index.ts';

function station(id: string, x: number, z: number): Station {
  return {
    id, name: id, pos: { x, y: 0, z }, modes: ['metro'], routeIds: ['rt-bend'],
    capacityPerHr: 3000, waiting: 0, boardedDay: 0, alightedDay: 0,
    peakWaiting: 0, transfersDay: 0,
  };
}

function route(ids: string[]): TransportRoute {
  return {
    id: 'rt-bend', name: 'Bend', mode: 'metro', color: '#38bdf8',
    stationIds: ids, headwayMin: 5, speedKph: 32, vehicleCapacity: 400,
  };
}

function vehicle(routeId: string, s: number): VehicleState {
  return {
    id: 'v1', routeId, s, direction: 1, load: 0, capacity: 400,
    riders: [], dwellLeft: 0, trips: 0,
  };
}

describe('vehicle path follows the drawn route line', () => {
  // Right-angle bend: straight-line interpolation would cut the corner, the
  // smoothed route curve does not.
  const stations = [station('a', 0, 0), station('b', 100, 0), station('c', 100, 100)];
  const rt = route(['a', 'b', 'c']);

  it('places vehicles on the route curve, not on straight chords', () => {
    const rig = buildVehicles([vehicle(rt.id, 0)], [rt], stations);
    const seg = rig.segmentsByRoute.get(rt.id);
    expect(seg?.curve).not.toBeNull();

    // Half of the straight-polyline distance lands mid-second-leg on chords.
    const total = seg?.total ?? 1;
    const mesh = rig.meshById.get('v1');
    if (!mesh || !seg?.curve) throw new Error('rig setup failed');
    updateVehicles(rig, [vehicle(rt.id, total / 2)], 1 / 60);
    const expected = seg.curve.getPointAt(0.5, new THREE.Vector3());
    expect(mesh.position.distanceTo(expected)).toBeLessThan(1e-6);

    // The old chord midpoint for this bend is far from the curve point.
    const chordMid = new THREE.Vector3(75, mesh.position.y, 25);
    expect(mesh.position.distanceTo(chordMid)).toBeGreaterThan(5);
  });

  it('builds path entries for routes the rig has never seen', () => {
    const rig = buildVehicles([], [rt], stations);
    const shuttle: TransportRoute = { ...route(['a', 'c']), id: 'rt-rep-1', name: 'Shuttle', mode: 'bus' };
    const v = vehicle(shuttle.id, 10);
    syncVehicleMeshes(rig, [v], [rt, shuttle], stations);
    expect(rig.segmentsByRoute.has(shuttle.id)).toBe(true);
    expect(rig.meshById.has(v.id)).toBe(true);
    updateVehicles(rig, [v], 1 / 60);
    const mesh = rig.meshById.get(v.id);
    expect(mesh?.userData.init).toBe(true);
  });

  it('skips degenerate single-station routes without throwing', () => {
    const solo: TransportRoute = { ...route(['a']), id: 'rt-solo', name: 'Solo' };
    const byId = new Map(stations.map((s) => [s.id, s]));
    expect(buildRoutePath(solo, byId).curve).toBeNull();
    const rig = buildVehicles([vehicle(solo.id, 0)], [solo], stations);
    expect(() => updateVehicles(rig, [vehicle(solo.id, 0)], 1 / 60)).not.toThrow();
  });
});
