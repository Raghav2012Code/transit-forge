import * as THREE from 'three';
import type { CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';


export interface CityMeshes {
  group: THREE.Group;
  buildings: THREE.Group;
  roads: THREE.Group;
  roadMeshById: Map<string, THREE.Mesh>;
  zoneDiscById: Map<string, THREE.Mesh>;
}

/** Static city geometry: terrain, water, river, roads, bridges, buildings. */
export function buildCityMeshes(city: CityData, palette: ScenePalette): CityMeshes {
  const { scene: SCENE, district: DISTRICT_COLORS, mark: MARK } = palette;
  const group = new THREE.Group();
  group.name = 'city';

  // Land base.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(1300, 1300),
    new THREE.MeshStandardMaterial({ color: SCENE.land }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.5;
  group.add(land);

  // Sea (west) + harbor bay tint.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 1300),
    new THREE.MeshStandardMaterial({ color: SCENE.sea }),
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
    new THREE.MeshStandardMaterial({ color: SCENE.river }),
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
  const roadMat = new THREE.MeshStandardMaterial({ color: SCENE.roadLocal });
  const arterialMat = new THREE.MeshStandardMaterial({ color: SCENE.roadArterial });
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
    mesh.userData = { kind: 'road', id: e.id, baseColor: e.isArterial ? SCENE.roadArterial : SCENE.roadLocal };
    roads.add(mesh);
    roadMeshById.set(e.id, mesh);
  }
  // Bridges across the river (deck + rails hint).
  const bridgeMat = new THREE.MeshStandardMaterial({ color: SCENE.bridge });
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
    color.setHex(DISTRICT_COLORS[b.district]).offsetHSL(0, 0, (((i * 37) % 10) - 5) / 200);
    inst.setColorAt(i, color);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  buildings.add(inst);
  group.add(buildings);

  // Zone discs (subtle, used for district picking + readability).
  const zoneDiscById = new Map<string, THREE.Mesh>();
  for (const z of city.zones) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(z.radius, 40),
      new THREE.MeshBasicMaterial({ color: MARK.blue, transparent: true, opacity: 0.05 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(z.center.x, 0.15, z.center.z);
    disc.userData = { kind: 'zone', id: z.id };
    group.add(disc);
    zoneDiscById.set(z.id, disc);
  }

  return { group, buildings, roads, roadMeshById, zoneDiscById };
}
