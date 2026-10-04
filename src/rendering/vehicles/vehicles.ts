import * as THREE from 'three';
import type { Station, TransportRoute, VehicleState } from '../../types/index.ts';
import { MODE_Y } from '../transport/buildNetwork.ts';

export interface RoutePath {
  pts: THREE.Vector3[];
  cum: number[];
  total: number;
  /**
   * The same smoothed curve the route-line mesh is drawn from. Vehicles are
   * placed on this curve (by fraction of route completed) so moving traffic
   * always matches the drawn line, even through bends.
   */
  curve: THREE.CatmullRomCurve3 | null;
}

export interface VehicleRig {
  group: THREE.Group;
  meshById: Map<string, THREE.Mesh>;
  segmentsByRoute: Map<string, RoutePath>;
}

function routePolyline(route: TransportRoute, byId: Map<string, Station>): THREE.Vector3[] {
  const y = MODE_Y[route.mode] + 1.6;
  return route.stationIds
    .map((id) => byId.get(id))
    .filter((s): s is Station => Boolean(s))
    .map((s) => new THREE.Vector3(s.pos.x, y, s.pos.z));
}

/** Path entry for one route; shared by the initial build and live sync. */
export function buildRoutePath(route: TransportRoute, byId: Map<string, Station>): RoutePath {
  const pts = routePolyline(route, byId);
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return {
    pts,
    cum,
    total: cum[cum.length - 1] ?? 1,
    curve: pts.length >= 2 ? new THREE.CatmullRomCurve3(pts) : null,
  };
}

export function buildVehicles(
  vehicles: VehicleState[],
  routes: TransportRoute[],
  stations: Station[],
): VehicleRig {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const meshById = new Map<string, THREE.Mesh>();
  const byId = new Map(stations.map((s) => [s.id, s]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const segmentsByRoute = new Map<string, RoutePath>();

  for (const route of routes) {
    segmentsByRoute.set(route.id, buildRoutePath(route, byId));
  }

  for (const v of vehicles) {
    const route = routeById.get(v.routeId);
    const color = route?.color ?? '#ffffff';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(v.capacity > 100 ? 7 : 4.5, 2.4, 2.6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
    );
    mesh.userData = { kind: 'vehicle', id: v.id };
    group.add(mesh);
    meshById.set(v.id, mesh);
  }
  return { group, meshById, segmentsByRoute };
}

/**
 * Reconcile meshes with the live vehicle list (fleet changes add/remove).
 * Also builds path entries for routes the rig has never seen (e.g. replacement
 * shuttles deployed mid-day), so those vehicles are visible and on their line.
 */
export function syncVehicleMeshes(
  rig: VehicleRig,
  vehicles: VehicleState[],
  routes: TransportRoute[],
  stations: Station[],
): void {
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const byId = new Map(stations.map((s) => [s.id, s]));
  for (const v of vehicles) {
    if (!rig.segmentsByRoute.has(v.routeId)) {
      const route = routeById.get(v.routeId);
      if (route) rig.segmentsByRoute.set(v.routeId, buildRoutePath(route, byId));
    }
  }
  const live = new Set(vehicles.map((v) => v.id));
  for (const [id, mesh] of rig.meshById) {
    if (!live.has(id)) {
      rig.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      rig.meshById.delete(id);
    }
  }
  for (const v of vehicles) {
    if (rig.meshById.has(v.id)) continue;
    const route = routeById.get(v.routeId);
    const color = route?.color ?? '#ffffff';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(v.capacity > 100 ? 7 : 4.5, 2.4, 2.6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
    );
    mesh.userData = { kind: 'vehicle', id: v.id };
    rig.group.add(mesh);
    rig.meshById.set(v.id, mesh);
  }
}

/** Position vehicle meshes from sim distance-along-route. Pure data read. */
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpTan = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
export function updateVehicles(rig: VehicleRig, vehicles: VehicleState[]): void {
  for (const v of vehicles) {
    const mesh = rig.meshById.get(v.id);
    const seg = rig.segmentsByRoute.get(v.routeId);
    if (!mesh || !seg || seg.pts.length < 2) continue;
    const total = Math.max(1, seg.total);
    const s = ((v.s % total) + total) % total;
    if (seg.curve) {
      // Same smoothed curve the route-line tube is drawn from, so vehicles
      // follow the visible line through bends. Sim distance maps by fraction
      // of route completed, so timetable timing is unchanged — only the path.
      const u = Math.max(0, Math.min(1, s / total));
      seg.curve.getPointAt(u, tmpT);
      seg.curve.getTangentAt(u, tmpTan);
      if (v.direction !== 1) tmpTan.negate();
      tmpLook.copy(tmpT).add(tmpTan);
    } else {
      let i = 1;
      while (i < seg.cum.length - 1 && seg.cum[i] < s) i++;
      const s0 = seg.cum[i - 1];
      const s1 = seg.cum[i];
      const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      tmpA.copy(seg.pts[i - 1]);
      tmpB.copy(seg.pts[i]);
      tmpT.lerpVectors(tmpA, tmpB, f);
      tmpLook.copy(v.direction === 1 ? tmpB : tmpA);
    }
    // Ease toward the target so fixed 1-minute sim steps render smoothly.
    if (!mesh.userData.init) {
      mesh.position.copy(tmpT);
      mesh.userData.init = true;
    } else {
      mesh.position.lerp(tmpT, 0.18);
    }
    mesh.lookAt(tmpLook);
  }
}
