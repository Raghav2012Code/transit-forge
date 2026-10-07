import * as THREE from 'three';
import type { CityData } from '../../types/index.ts';
import type { ScenePalette } from '../palette.ts';
import { merge } from '../transport/sweep.ts';
import { RIVER_HALF } from './terrain.ts';

/** A flat slab from a to b, `w` wide, with its top at `top` and `h` thick. */
function slab(ax: number, az: number, bx: number, bz: number, w: number, top: number, h: number): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len, h, w);
  g.rotateY(-Math.atan2(bz - az, bx - ax));
  g.translate((ax + bx) / 2, top - h / 2, (az + bz) / 2);
  return g.toNonIndexed();
}

function mesh(g: THREE.BufferGeometry, color: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.receiveShadow = true;
  m.castShadow = shadow;
  return m;
}

export interface StreetMeshes {
  roads: THREE.Group;
  roadMeshById: Map<string, THREE.Mesh>;
}

/** Arterials, local streets, bridges and airfield paving. */
export function buildStreets(city: CityData, palette: ScenePalette): StreetMeshes {
  const S = palette.scene;
  const roads = new THREE.Group();
  roads.name = 'roads';
  const roadMeshById = new Map<string, THREE.Mesh>();
  const nodeById = new Map(city.roadNodes.map((n) => [n.id, n.pos]));

  const kerbs: THREE.BufferGeometry[] = [];
  const marks: THREE.BufferGeometry[] = [];
  const junctions: THREE.BufferGeometry[] = [];

  for (const e of city.roadEdges) {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) continue;
    const w = e.isArterial ? 10 : 6;
    const base = e.isArterial ? S.roadArterial : S.roadLocal;
    const road = new THREE.Mesh(
      slab(a.x, a.z, b.x, b.z, w, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.92 }),
    );
    road.receiveShadow = true;
    road.userData = { kind: 'road', id: e.id, baseColor: base };
    roads.add(road);
    roadMeshById.set(e.id, road);
    kerbs.push(slab(a.x, a.z, b.x, b.z, w + 5, 0.42, 0.42));

    // Lane marking: a dashed centre line and solid edge lines, clear of the junctions.
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const rx = -uz;
    const rz = ux;
    const put = (s0: number, s1: number, off: number, width: number) => {
      marks.push(slab(a.x + ux * s0 + rx * off, a.z + uz * s0 + rz * off, a.x + ux * s1 + rx * off, a.z + uz * s1 + rz * off, width, 0.53, 0.04));
    };
    const margin = w / 2 + 3;
    if (e.isArterial) {
      for (let s = margin; s + 4.5 < len - margin; s += 10) put(s, s + 4.5, 0, 0.32);
      for (const off of [-(w / 2 - 0.8), w / 2 - 0.8]) put(margin, len - margin, off, 0.2);
    } else {
      for (let s = margin; s + 3 < len - margin; s += 8) put(s, s + 3, 0, 0.24);
    }
  }
  // Junction pads: the same asphalt, so a crossing is one clean square.
  for (const n of city.roadNodes) {
    const arterial = city.roadEdges.some((e) => (e.a === n.id || e.b === n.id) && e.isArterial);
    const w = arterial ? 10 : 6;
    junctions.push(slab(n.pos.x - w / 2, n.pos.z, n.pos.x + w / 2, n.pos.z, w, 0.505, 0.505));
  }

  roads.add(mesh(merge(kerbs), S.sidewalk, false));
  const pad = mesh(merge(junctions), S.roadArterial, false);
  pad.userData = { kind: 'junction' };
  roads.add(pad);
  roads.add(mesh(merge(marks), S.marking, false));

  // Local streets: one merged mesh of asphalt over one of pavement.
  const asphalt: THREE.BufferGeometry[] = [];
  const pave: THREE.BufferGeometry[] = [];
  for (const st of city.streets) {
    asphalt.push(slab(st.a.x, st.a.z, st.b.x, st.b.z, st.w, 0.3, 0.3));
    pave.push(slab(st.a.x, st.a.z, st.b.x, st.b.z, st.w + 3.4, 0.22, 0.22));
  }
  if (asphalt.length) {
    roads.add(mesh(merge(pave), S.sidewalk, false));
    roads.add(mesh(merge(asphalt), S.roadLocal, false));
  }

  // Bridges: girder under the road, parapet each side.
  const girders: THREE.BufferGeometry[] = [];
  const parapets: THREE.BufferGeometry[] = [];
  for (const br of city.bridges) {
    const len = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
    const ux = (br.b.x - br.a.x) / len;
    const uz = (br.b.z - br.a.z) / len;
    const half = RIVER_HALF + 9;
    const cx = (br.a.x + br.b.x) / 2;
    const cz = (br.a.z + br.b.z) / 2;
    girders.push(slab(cx - ux * half, cz - uz * half, cx + ux * half, cz + uz * half, 11.4, 0.52, 1.9));
    for (const side of [-1, 1]) {
      const ox = -uz * 5.4 * side;
      const oz = ux * 5.4 * side;
      parapets.push(slab(cx - ux * half + ox, cz - uz * half + oz, cx + ux * half + ox, cz + uz * half + oz, 0.5, 1.45, 0.9));
    }
  }
  if (girders.length) {
    roads.add(mesh(merge(girders), S.bridge));
    roads.add(mesh(merge(parapets), S.bridge));
  }

  // Airfield: runway and taxiways, and the piers that run out over the water.
  const paving: THREE.BufferGeometry[] = [];
  const paint: THREE.BufferGeometry[] = [];
  const piers: THREE.BufferGeometry[] = [];
  for (const lm of city.landmarks) {
    if (lm.kind === 'pier') {
      piers.push(slab(lm.a.x, lm.a.z, lm.b.x, lm.b.z, lm.w, 0.34, 1.8));
      continue;
    }
    const top = lm.kind === 'runway' ? 0.36 : 0.3;
    paving.push(slab(lm.a.x, lm.a.z, lm.b.x, lm.b.z, lm.w, top, 0.36));
    const len = Math.hypot(lm.b.x - lm.a.x, lm.b.z - lm.a.z);
    const ux = (lm.b.x - lm.a.x) / len;
    const uz = (lm.b.z - lm.a.z) / len;
    const step = lm.kind === 'runway' ? 16 : 10;
    for (let s = 8; s + 6 < len - 8; s += step) {
      paint.push(slab(lm.a.x + ux * s, lm.a.z + uz * s, lm.a.x + ux * (s + 6), lm.a.z + uz * (s + 6), lm.kind === 'runway' ? 0.9 : 0.4, top + 0.03, 0.04));
    }
  }
  if (paving.length) {
    roads.add(mesh(merge(paving), S.runway, false));
    roads.add(mesh(merge(paint), S.marking, false));
  }
  if (piers.length) roads.add(mesh(merge(piers), S.sidewalk));

  return { roads, roadMeshById };
}
