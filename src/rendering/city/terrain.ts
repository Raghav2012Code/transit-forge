import * as THREE from 'three';
import type { CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { TrackCurve } from '../transport/trackPath.ts';
import { merge, rectProfile, sweep } from '../transport/sweep.ts';

/** Half-extent of the plate the city stands on (north-south, east, west). */
export const PLATE = { z: 660, east: 700, west: -700 } as const;
export const RIVER_HALF = 13;
const SLAB = 16;
const SEA_Y = -1.4;

/** Water sits below the land, so the river and the sea read as cut into the plate. */
export const WATER_Y = SEA_Y;

function polyline(points: { x: number; z: number }[]): TrackCurve {
  return new TrackCurve(points.map((p) => new THREE.Vector3(p.x, 0, p.z)), [], [], []);
}

function slab(points: { x: number; z: number }[], topY: number, top: THREE.Material, side: THREE.Material): THREE.Mesh {
  // Shape y runs opposite to world z once the slab is laid flat.
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, topY - SLAB, 0);
  const mesh = new THREE.Mesh(g, [top, side]);
  mesh.receiveShadow = true;
  return mesh;
}

export interface Riverbed {
  centre: { x: number; z: number }[];
  left: { x: number; z: number }[];
  right: { x: number; z: number }[];
}

/** The river as the renderer draws it: a smooth centre line and both banks (left = west), edge to edge of the plate. */
export function riverBanks(river: CityData['river']): Riverbed {
  const pts = river.map((p) => new THREE.Vector3(p.x, 0, p.z));
  if (pts.length >= 2) {
    pts.unshift(new THREE.Vector3(pts[0].x, 0, -PLATE.z - 40));
    pts.push(new THREE.Vector3(pts[pts.length - 1].x, 0, PLATE.z + 40));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const centre: { x: number; z: number }[] = [];
  const left: { x: number; z: number }[] = [];
  const right: { x: number; z: number }[] = [];
  const n = Math.ceil(curve.getLength() / 6);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    if (Math.abs(p.z) > PLATE.z + 0.001) continue;
    const t = curve.getTangentAt(u);
    const nx = -t.z;
    const nz = t.x;
    centre.push({ x: p.x, z: p.z });
    left.push({ x: p.x + nx * RIVER_HALF, z: p.z + nz * RIVER_HALF });
    right.push({ x: p.x - nx * RIVER_HALF, z: p.z - nz * RIVER_HALF });
  }
  // Pin the ends to the plate's edge.
  for (const arr of [centre, left, right]) {
    arr[0].z = -PLATE.z;
    arr[arr.length - 1].z = PLATE.z;
  }
  return { centre, left, right };
}

export function buildTerrain(city: CityData, palette: ScenePalette, bed: Riverbed): THREE.Group {
  const S = palette.scene;
  const group = new THREE.Group();
  group.name = 'terrain';
  const landTop = new THREE.MeshStandardMaterial({ color: S.land, roughness: 1 });
  const landSide = new THREE.MeshStandardMaterial({ color: S.plateEdge, roughness: 1 });
  const water = new THREE.MeshStandardMaterial({ color: S.sea, roughness: 0.35, metalness: 0.05 });
  const riverWater = new THREE.MeshStandardMaterial({ color: S.river, roughness: 0.35, metalness: 0.05 });
  const wall = new THREE.MeshStandardMaterial({ color: S.bank, roughness: 1 });

  const coast = city.coast.filter((p) => Math.abs(p.z) <= PLATE.z);
  if (coast[0].z > -PLATE.z) coast.unshift({ x: coast[0].x, y: 0, z: -PLATE.z });
  if (coast[coast.length - 1].z < PLATE.z) coast.push({ x: coast[coast.length - 1].x, y: 0, z: PLATE.z });

  const lb = bed.left;
  const rb = bed.right;
  group.add(
    slab([...coast, ...[...lb].reverse()], 0, landTop, landSide),
    slab([...rb, { x: PLATE.east, z: PLATE.z }, { x: PLATE.east, z: -PLATE.z }], 0, landTop, landSide),
    slab([...coast, { x: PLATE.west, z: PLATE.z }, { x: PLATE.west, z: -PLATE.z }], SEA_Y, water, landSide),
    slab([...lb, ...[...rb].reverse()], SEA_Y, riverWater, wall),
  );

  // Shallows along the coast: a paler band that tells water depth at a glance.
  const shallow = new THREE.MeshStandardMaterial({ color: new THREE.Color(S.sea).lerp(new THREE.Color(0xffffff), 0.22), roughness: 0.4 });
  const shoal = polyline(coast.map((p) => ({ x: p.x - 9, z: p.z })));
  const shallowMesh = new THREE.Mesh(sweep(shoal, rectProfile(18, 0, 0.04), SEA_Y, 0, shoal.length, 6), shallow);
  shallowMesh.receiveShadow = true;
  group.add(shallowMesh);

  // Promenade along the water: pale pavement on the land side of every shore.
  const shore = new THREE.MeshStandardMaterial({ color: S.shore, roughness: 1 });
  const proms: THREE.BufferGeometry[] = [];
  const coastLine = polyline(coast.map((p) => ({ x: p.x + 3.5, z: p.z })));
  proms.push(sweep(coastLine, rectProfile(7, 0, 0.12), 0, 0, coastLine.length, 8));
  for (const [bank, dir] of [[lb, -1], [rb, 1]] as const) {
    const c = polyline(bank.map((p) => ({ x: p.x + dir * 3.2, z: p.z })));
    proms.push(sweep(c, rectProfile(6.4, 0, 0.12), 0, 0, c.length, 6));
  }
  const promMesh = new THREE.Mesh(merge(proms), shore);
  promMesh.receiveShadow = true;
  group.add(promMesh);
  return group;
}
