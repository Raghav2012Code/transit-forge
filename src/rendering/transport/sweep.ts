import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackCurve } from './trackPath.ts';

/** A cross-section: [across, up] corners, counter-clockwise, `across` to the track's right. */
export type Profile = [number, number][];

export function rectProfile(width: number, y0: number, y1: number): Profile {
  const h = width / 2;
  return [[-h, y0], [h, y0], [h, y1], [-h, y1]];
}

/**
 * Extrude `profile` along the curve with hard-edged faces. Sampled by arc
 * length, so long straights stay cheap and bends stay smooth.
 */
export function sweep(curve: TrackCurve, profile: Profile, yOffset = 0, from = 0, to = curve.length, step = 3): THREE.BufferGeometry {
  const span = Math.max(0, to - from);
  const rings = Math.max(2, Math.ceil(span / step) + 1);
  const E = profile.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const centres: THREE.Vector3[] = [];
  const sides: THREE.Vector3[] = [];
  for (let k = 0; k < rings; k++) {
    const s = from + (span * k) / (rings - 1);
    curve.pointAtArc(s, p);
    curve.tangentAtArc(s, t);
    t.y = 0;
    t.normalize();
    centres.push(p.clone());
    sides.push(new THREE.Vector3(-t.z, 0, t.x));
  }
  for (let e = 0; e < E; e++) {
    const [ax, ay] = profile[e];
    const [bx, by] = profile[(e + 1) % E];
    // Outward normal of this profile edge (counter-clockwise profile).
    const ex = by - ay;
    const ey = -(bx - ax);
    const el = Math.hypot(ex, ey) || 1;
    const nx = ex / el;
    const ny = ey / el;
    const base = pos.length / 3;
    for (let k = 0; k < rings; k++) {
      const c = centres[k];
      const sd = sides[k];
      for (const [px, py] of [[ax, ay], [bx, by]]) {
        pos.push(c.x + sd.x * px, c.y + yOffset + py, c.z + sd.z * px);
        nrm.push(sd.x * nx, ny, sd.z * nx);
      }
    }
    for (let k = 0; k < rings - 1; k++) {
      const v = base + k * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  // Wind every triangle to face the way its normal says, whatever the curve's handedness.
  const ia = g.index?.array as Uint32Array | Uint16Array;
  const pa = g.attributes.position.array as Float32Array;
  const na = g.attributes.normal.array as Float32Array;
  for (let i = 0; i < ia.length; i += 3) {
    const a = ia[i] * 3;
    const b = ia[i + 1] * 3;
    const c = ia[i + 2] * 3;
    const ux = pa[b] - pa[a];
    const uy = pa[b + 1] - pa[a + 1];
    const uz = pa[b + 2] - pa[a + 2];
    const vx = pa[c] - pa[a];
    const vy = pa[c + 1] - pa[a + 1];
    const vz = pa[c + 2] - pa[a + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    if (fx * na[a] + fy * na[a + 1] + fz * na[a + 2] < 0) {
      const tmp = ia[i + 1];
      ia[i + 1] = ia[i + 2];
      ia[i + 2] = tmp;
    }
  }
  return g;
}

/** Paint a whole geometry one vertex colour (multiplied by the material colour). */
export function tint(g: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3).fill(shade);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(nonIndexed, false);
  return out ?? new THREE.BufferGeometry();
}
