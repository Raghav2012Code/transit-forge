import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRoutePath, buildVehicles, syncVehicleMeshes, updateVehicles } from './vehicles.ts';
import type { TrackCurve } from '../transport/trackPath.ts';
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

function vehicle(routeId: string, i: number): VehicleState {
  return {
    id: `v${i}`, routeId, s: 0, direction: 1, load: 0, capacity: 400,
    riders: [], dwellLeft: 0, trips: 0,
  };
}

describe('vehicles ride the drawn route line', () => {
  // A right-angle bend: chord interpolation would cut the corner.
  const stations = [station('a', 0, 0), station('b', 200, 0), station('c', 200, 200)];
  const rt = route(['a', 'b', 'c']);
  const fleet = [vehicle(rt.id, 0), vehicle(rt.id, 1), vehicle(rt.id, 2)];

  function nearestDistance(curve: TrackCurve, p: THREE.Vector3): number {
    let best = Infinity;
    for (let i = 0; i + 1 < curve.pts.length; i++) {
      const seg = new THREE.Line3(curve.pts[i], curve.pts[i + 1]);
      best = Math.min(best, seg.closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p));
    }
    return best;
  }

  it('keeps every vehicle on the curve at any clock', () => {
    const rig = buildVehicles(fleet, [rt], stations);
    const curve = rig.segmentsByRoute.get(rt.id)?.curve;
    if (!curve) throw new Error('rig setup failed');
    for (let clock = 0; clock < 40; clock += 0.37) {
      updateVehicles(rig, fleet, [rt], clock);
      for (const v of fleet) {
        const mesh = rig.meshById.get(v.id);
        if (!mesh) throw new Error('missing mesh');
        // The mesh sits one band-thickness above the path, nowhere else off it.
        const flat = mesh.position.clone();
        flat.y = curve.pts[0].y;
        expect(nearestDistance(curve, flat)).toBeLessThan(1e-6);
      }
    }
  });

  it('spreads a fleet evenly around the service cycle', () => {
    const rig = buildVehicles(fleet, [rt], stations);
    updateVehicles(rig, fleet, [rt], 3.3);
    const here = fleet.map((v) => rig.meshById.get(v.id)?.position.clone());
    // Distinct places, not stacked.
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        expect(here[i]?.distanceTo(here[j] as THREE.Vector3) ?? 0).toBeGreaterThan(5);
      }
    }
  });

  it('faces along the track through the bend', () => {
    const rig = buildVehicles([fleet[0]], [rt], stations);
    const curve = rig.segmentsByRoute.get(rt.id)?.curve;
    const mesh = rig.meshById.get('v0');
    if (!curve || !mesh) throw new Error('rig setup failed');
    for (let clock = 0; clock < 30; clock += 0.25) {
      updateVehicles(rig, [fleet[0]], [rt], clock);
      const fwd = new THREE.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i + 1 < curve.pts.length; i++) {
        const d = curve.pts[i].distanceToSquared(new THREE.Vector3(mesh.position.x, curve.pts[i].y, mesh.position.z));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const tangent = curve.pts[best + 1].clone().sub(curve.pts[best]).setY(0).normalize();
      // Either way along the track; a rigid body on a bend sits a few degrees off the tangent.
      expect(Math.abs(fwd.dot(tangent))).toBeGreaterThan(0.9);
    }
  });

  it('builds path entries for routes the rig has never seen', () => {
    const rig = buildVehicles([], [rt], stations);
    const shuttle: TransportRoute = { ...route(['a', 'c']), id: 'rt-rep-1', name: 'Shuttle', mode: 'bus' };
    const v = vehicle(shuttle.id, 9);
    syncVehicleMeshes(rig, [v], [rt, shuttle], stations);
    expect(rig.segmentsByRoute.has(shuttle.id)).toBe(true);
    expect(rig.meshById.has(v.id)).toBe(true);
    updateVehicles(rig, [v], [rt, shuttle], 2);
    expect(rig.meshById.get(v.id)?.userData.init).toBe(true);
  });

  it('shares one consist geometry per mode and colour', () => {
    const rig = buildVehicles(fleet, [rt], stations);
    const geos = new Set([...rig.meshById.values()].map((m) => m.geometry));
    expect(geos.size).toBe(1);
  });

  it('skips degenerate single-station routes without throwing', () => {
    const solo: TransportRoute = { ...route(['a']), id: 'rt-solo', name: 'Solo' };
    const byId = new Map(stations.map((s) => [s.id, s]));
    expect(buildRoutePath(solo, byId).curve).toBeNull();
    const rig = buildVehicles([vehicle(solo.id, 0)], [solo], stations);
    expect(() => updateVehicles(rig, [vehicle(solo.id, 0)], [solo], 1)).not.toThrow();
  });
});
