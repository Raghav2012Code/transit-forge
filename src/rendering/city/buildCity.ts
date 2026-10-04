import * as THREE from 'three';
import type { CityData, DistrictKind } from '../../types/index.ts';

const DISTRICT_COLORS: Record<DistrictKind, number> = {
  cbd: 0x5b7fc4,
  residential: 0x3d4a6b,
  industrial: 0x7a6a55,
  university: 0x5f8f7b,
  airport: 0x6b7280,
  harbor: 0x4f7fa3,
  suburban: 0x35405a,
};

export interface CityMeshes {
  group: THREE.Group;
  buildings: THREE.Group;
  roads: THREE.Group;
  roadMeshById: Map<string, THREE.Mesh>;
}

/** Static city geometry: terrain, water, river, roads, bridges, buildings. */
export function buildCityMeshes(city: CityData): CityMeshes {
  const group = new THREE.Group();
  group.name = 'city';

  // Land base.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(1300, 1300),
    new THREE.MeshStandardMaterial({ color: 0x141c33 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.5;
  group.add(land);

  // Sea (west) + harbor bay tint.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 1300),
    new THREE.MeshStandardMaterial({ color: 0x0e2a44 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-470, -0.2, 0);
  group.add(sea);

  // River ribbon.
  const riverPts = city.river.map((p) => new THREE.Vector3(p.x, 0.1, p.z));
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverGeo = new THREE.TubeGeometry(riverCurve, 40, 13, 6, false);
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({ color: 0x11405e }),
  );
  river.scale.y = 0.08;
  river.position.y = 0.4;
  river.rotation.x = 0;
  // Flatten tube into a ribbon look by squashing vertically.
  group.add(river);

  // Roads group (toggleable).
  const roads = new THREE.Group();
  roads.name = 'roads';
  const roadMeshById = new Map<string, THREE.Mesh>();
  const nodeById = new Map(city.roadNodes.map((n) => [n.id, n.pos]));
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a3552 });
  const arterialMat = new THREE.MeshStandardMaterial({ color: 0x39496e });
  for (const e of city.roadEdges) {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.6, e.isArterial ? 9 : 5),
      (e.isArterial ? arterialMat : roadMat).clone(),
    );
    mesh.position.set((a.x + b.x) / 2, 0.4, (a.z + b.z) / 2);
    mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    mesh.userData = { kind: 'road', id: e.id, baseColor: e.isArterial ? 0x39496e : 0x2a3552 };
    roads.add(mesh);
    roadMeshById.set(e.id, mesh);
  }
  // Bridges across the river (deck + rails hint).
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8b9cc7 });
  for (const br of city.bridges) {
    const len = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 11), bridgeMat);
    deck.position.set((br.a.x + br.b.x) / 2, 2.2, (br.a.z + br.b.z) / 2);
    roads.add(deck);
  }
  group.add(roads);

  // Buildings: single InstancedMesh, per-instance color by district.
  const buildings = new THREE.Group();
  buildings.name = 'buildings';
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, city.buildings.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  city.buildings.forEach((b, i) => {
    dummy.position.set(b.pos.x, 0, b.pos.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.y = 0;
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    color.setHex(DISTRICT_COLORS[b.district]).offsetHSL(0, 0, ((i * 37) % 10) / 200);
    inst.setColorAt(i, color);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  buildings.add(inst);
  group.add(buildings);

  // Zone discs (subtle, used for district picking + readability).
  for (const z of city.zones) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(z.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0x6ea8fe, transparent: true, opacity: 0.05 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(z.center.x, 0.15, z.center.z);
    disc.userData = { kind: 'zone', id: z.id };
    group.add(disc);
  }

  return { group, buildings, roads, roadMeshById };
}
