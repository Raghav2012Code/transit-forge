import * as THREE from 'three';
import type { Station, TransportMode, TransportRoute } from '../../types/index.ts';

export const MODE_Y: Record<TransportMode, number> = {
  metro: 7,
  rail: 10,
  bus: 3,
  road: 1,
};

export interface NetworkMeshes {
  group: THREE.Group;
  byMode: Record<TransportMode, THREE.Group>;
  pickables: THREE.Object3D[];
  stationMeshById: Map<string, THREE.Mesh>;
}

function routePoints(route: TransportRoute, byId: Map<string, Station>): THREE.Vector3[] {
  const y = MODE_Y[route.mode];
  return route.stationIds
    .map((id) => byId.get(id))
    .filter((s): s is Station => Boolean(s))
    .map((s) => new THREE.Vector3(s.pos.x, y, s.pos.z));
}

export function buildNetworkMeshes(stations: Station[], routes: TransportRoute[]): NetworkMeshes {
  const group = new THREE.Group();
  group.name = 'network';
  const byMode: Record<TransportMode, THREE.Group> = {
    metro: new THREE.Group(),
    rail: new THREE.Group(),
    bus: new THREE.Group(),
    road: new THREE.Group(),
  };
  byMode.metro.name = 'metro';
  byMode.rail.name = 'rail';
  byMode.bus.name = 'bus';
  const pickables: THREE.Object3D[] = [];
  const byId = new Map(stations.map((s) => [s.id, s]));

  for (const route of routes) {
    const pts = routePoints(route, byId);
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts);
    const isBus = route.mode === 'bus';
    const geo = new THREE.TubeGeometry(curve, 48, isBus ? 0.7 : 1.3, 6, false);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: route.color, emissive: route.color, emissiveIntensity: 0.35 }),
    );
    mesh.userData = { kind: 'route', id: route.id };
    byMode[route.mode].add(mesh);
    pickables.push(mesh);
  }

  const stationGeo = new THREE.CylinderGeometry(3.2, 3.2, 3, 12);
  const interchangeGeo = new THREE.CylinderGeometry(5, 5, 4.5, 8);
  for (const st of stations) {
    const interchange = st.routeIds.length > 1;
    const mesh = new THREE.Mesh(
      interchange ? interchangeGeo : stationGeo,
      new THREE.MeshStandardMaterial({
        color: interchange ? 0xf8fafc : 0xcbd5e1,
        emissive: 0x334155,
        emissiveIntensity: 0.4,
      }),
    );
    const topMode = st.modes.includes('metro') ? 'metro' : st.modes.includes('rail') ? 'rail' : 'bus';
    mesh.position.set(st.pos.x, MODE_Y[topMode as TransportMode] ?? 4, st.pos.z);
    mesh.userData = { kind: 'station', id: st.id };
    group.add(mesh);
    pickables.push(mesh);
  }

  const stationMeshById = new Map<string, THREE.Mesh>();
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    if (mesh.userData?.kind === 'station') stationMeshById.set(mesh.userData.id as string, mesh);
  }

  group.add(byMode.metro, byMode.rail, byMode.bus);
  return { group, byMode, pickables, stationMeshById };
}
