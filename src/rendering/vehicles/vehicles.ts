import * as THREE from 'three';
import type { Station, TransportRoute, VehicleState } from '../../types/index.ts';
import { MODE_Y } from '../transport/buildNetwork.ts';

export interface VehicleRig {
  group: THREE.Group;
  meshById: Map<string, THREE.Mesh>;
  segmentsByRoute: Map<string, { pts: THREE.Vector3[]; cum: number[]; total: number }>;
}

function routePolyline(route: TransportRoute, byId: Map<string, Station>): THREE.Vector3[] {
  const y = MODE_Y[route.mode] + 1.6;
  return route.stationIds
    .map((id) => byId.get(id))
    .filter((s): s is Station => Boolean(s))
    .map((s) => new THREE.Vector3(s.pos.x, y, s.pos.z));
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
  const segmentsByRoute = new Map<string, { pts: THREE.Vector3[]; cum: number[]; total: number }>();

  for (const route of routes) {
    const pts = routePolyline(route, byId);
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    segmentsByRoute.set(route.id, { pts, cum, total: cum[cum.length - 1] ?? 1 });
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

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpT = new THREE.Vector3();

/** Position vehicle meshes from sim distance-along-route. Pure data read. */
export function updateVehicles(rig: VehicleRig, vehicles: VehicleState[]): void {
  for (const v of vehicles) {
    const mesh = rig.meshById.get(v.id);
    const seg = rig.segmentsByRoute.get(v.routeId);
    if (!mesh || !seg || seg.pts.length < 2) continue;
    const total = Math.max(1, seg.total);
    const s = ((v.s % total) + total) % total;
    let i = 1;
    while (i < seg.cum.length - 1 && seg.cum[i] < s) i++;
    const s0 = seg.cum[i - 1];
    const s1 = seg.cum[i];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    tmpA.copy(seg.pts[i - 1]);
    tmpB.copy(seg.pts[i]);
    tmpT.lerpVectors(tmpA, tmpB, f);
    // Ease toward the target so fixed 1-minute sim steps render smoothly.
    if (!mesh.userData.init) {
      mesh.position.copy(tmpT);
      mesh.userData.init = true;
    } else {
      mesh.position.lerp(tmpT, 0.18);
    }
    mesh.lookAt(v.direction === 1 ? tmpB : tmpA);
  }
}
