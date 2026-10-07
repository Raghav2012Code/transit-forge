import * as THREE from 'three';
import type { CityData, DistrictKind } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { merge, tint } from '../transport/sweep.ts';
import { RIVER_HALF } from './terrain.ts';
import { hash01 } from './buildings.ts';
import { xAtZ, type BuildingIndex, type DiscIndex } from './spatial.ts';

/** How leafy a district's streets are. */
const LEAF: Record<DistrictKind, number> = {
  cbd: 0.22,
  residential: 0.7,
  suburban: 0.95,
  university: 0.9,
  industrial: 0.12,
  harbor: 0.08,
  airport: 0,
};

export function buildParks(city: CityData, palette: ScenePalette): THREE.Mesh | null {
  if (city.parks.length === 0) return null;
  const geos = city.parks.map((p) => {
    const g = new THREE.BoxGeometry(p.w, 0.2, p.d);
    g.rotateY(p.rot);
    g.translate(p.pos.x, 0.1, p.pos.z);
    return g.toNonIndexed();
  });
  const mesh = new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ color: palette.scene.park, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Street trees and park trees as one instanced mesh. Seeded by position, so stable. */
export function buildTrees(
  city: CityData,
  palette: ScenePalette,
  buildings: BuildingIndex,
  avoid: DiscIndex,
): THREE.InstancedMesh | null {
  const spots: { x: number; z: number; s: number; v: number }[] = [];
  const zoneKindAt = (x: number, z: number): DistrictKind => {
    let best: DistrictKind = 'suburban';
    let bestR = Infinity;
    for (const zn of city.zones) {
      const r = Math.hypot(x - zn.center.x, z - zn.center.z) / zn.radius;
      if (r < bestR) {
        bestR = r;
        best = zn.kind;
      }
    }
    return best;
  };
  const ok = (x: number, z: number): boolean =>
    x > xAtZ(city.coast, z) + 16 &&
    Math.abs(x - xAtZ(city.river, z)) > RIVER_HALF + 8 &&
    !buildings.covers(x, z, 1.8) &&
    !avoid.near(x, z, 3);
  const arterials = city.roadEdges.filter((e) => e.isArterial);
  const nodes = new Map(city.roadNodes.map((n) => [n.id, n.pos]));
  const offRoads = (x: number, z: number): boolean =>
    arterials.every((e) => {
      const a = nodes.get(e.a);
      const b = nodes.get(e.b);
      if (!a || !b) return true;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) > 9;
    });

  let n = 0;
  for (const st of city.streets) {
    const len = Math.hypot(st.b.x - st.a.x, st.b.z - st.a.z);
    const ux = (st.b.x - st.a.x) / len;
    const uz = (st.b.z - st.a.z) / len;
    for (let s = 7; s < len - 4; s += 13) {
      for (const side of [-1, 1]) {
        n++;
        const x = st.a.x + ux * s - uz * (st.w / 2 + 1.3) * side;
        const z = st.a.z + uz * s + ux * (st.w / 2 + 1.3) * side;
        if (hash01(n * 1.7) > LEAF[zoneKindAt(x, z)]) continue;
        if (ok(x, z) && offRoads(x, z)) spots.push({ x, z, s: 0.8 + hash01(n) * 0.5, v: hash01(n + 9) });
      }
    }
  }
  for (const p of city.parks) {
    const count = Math.round((p.w * p.d) / 70);
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (let i = 0; i < count; i++) {
      n++;
      const u = (hash01(n * 2.3) - 0.5) * (p.w - 4);
      const v = (hash01(n * 3.1 + 5) - 0.5) * (p.d - 4);
      const x = p.pos.x + u * c + v * s;
      const z = p.pos.z - u * s + v * c;
      if (ok(x, z)) spots.push({ x, z, s: 0.9 + hash01(n) * 0.7, v: hash01(n + 4) });
    }
  }
  if (spots.length === 0) return null;

  const crown = new THREE.IcosahedronGeometry(2.6, 1);
  crown.scale(1, 0.92, 1);
  crown.translate(0, 4.6, 0);
  const trunk = new THREE.CylinderGeometry(0.28, 0.4, 2.6, 5);
  trunk.translate(0, 1.3, 0);
  const geo = merge([tint(crown.toNonIndexed(), 1), tint(trunk.toNonIndexed(), 0.45)]);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }), spots.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const a = new THREE.Color(palette.scene.tree);
  const b = new THREE.Color(palette.scene.treeDark);
  spots.forEach((t, i) => {
    dummy.position.set(t.x, 0.2, t.z);
    dummy.rotation.set(0, t.v * 6.28, 0);
    dummy.scale.set(t.s, t.s * (0.9 + t.v * 0.3), t.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color().lerpColors(a, b, t.v));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
