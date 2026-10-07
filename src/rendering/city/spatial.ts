import type { Building } from '../../types/index.ts';

const CELL = 32;

/** x of a north-south polyline at depth z (linear between samples). */
export function xAtZ(poly: { x: number; z: number }[], z: number): number {
  if (poly.length === 0) return 0;
  if (z <= poly[0].z) return poly[0].x;
  for (let i = 1; i < poly.length; i++) {
    if (z <= poly[i].z) {
      const a = poly[i - 1];
      const b = poly[i];
      return a.x + ((b.x - a.x) * (z - a.z)) / Math.max(1e-6, b.z - a.z);
    }
  }
  return poly[poly.length - 1].x;
}
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

export interface Disc {
  x: number;
  z: number;
  r: number;
}

/** Circles to keep clear of (transit corridors, stations): "is (x, z) within pad of any?" */
export class DiscIndex {
  private cells = new Map<number, Disc[]>();
  constructor(discs: Disc[]) {
    for (const d of discs) {
      const i = Math.floor(d.x / CELL);
      const j = Math.floor(d.z / CELL);
      const k = key(i, j);
      const list = this.cells.get(k);
      if (list) list.push(d);
      else this.cells.set(k, [d]);
    }
  }
  /** Any disc within `reach` of (x, z) that satisfies `test`. */
  some(x: number, z: number, reach: number, test: (d: Disc) => boolean): boolean {
    const span = Math.ceil((reach + 40) / CELL);
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        const list = this.cells.get(key(i, j));
        if (list) for (const d of list) if (test(d)) return true;
      }
    }
    return false;
  }
  near(x: number, z: number, pad: number): boolean {
    const reach = Math.ceil((pad + 40) / CELL);
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    for (let i = ci - reach; i <= ci + reach; i++) {
      for (let j = cj - reach; j <= cj + reach; j++) {
        const list = this.cells.get(key(i, j));
        if (!list) continue;
        for (const d of list) if (Math.hypot(x - d.x, z - d.z) < d.r + pad) return true;
      }
    }
    return false;
  }
}

/** Does any disc reach into the box (centre, half-extents, yaw)? Exact, not a circumscribed circle. */
export function discsHitBox(index: DiscIndex, b: Building, margin = 0): boolean {
  return index.some(b.pos.x, b.pos.z, Math.hypot(b.w, b.d) / 2, (d) => {
    const dx = d.x - b.pos.x;
    const dz = d.z - b.pos.z;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const nx = Math.max(-b.w / 2, Math.min(b.w / 2, lx));
    const nz = Math.max(-b.d / 2, Math.min(b.d / 2, lz));
    return Math.hypot(lx - nx, lz - nz) < d.r + margin;
  });
}

/** Buildings by footprint, to ask whether a point lies on or beside one. */
export class BuildingIndex {
  private cells = new Map<number, Building[]>();
  constructor(buildings: Building[]) {
    for (const b of buildings) {
      const r = Math.hypot(b.w, b.d) / 2;
      for (let i = Math.floor((b.pos.x - r) / CELL); i <= Math.floor((b.pos.x + r) / CELL); i++) {
        for (let j = Math.floor((b.pos.z - r) / CELL); j <= Math.floor((b.pos.z + r) / CELL); j++) {
          const k = key(i, j);
          const list = this.cells.get(k);
          if (list) list.push(b);
          else this.cells.set(k, [b]);
        }
      }
    }
  }
  /** True when (x, z) is inside any footprint grown by `pad`. */
  covers(x: number, z: number, pad: number): boolean {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return false;
    for (const b of list) {
      const dx = x - b.pos.x;
      const dz = z - b.pos.z;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad) return true;
    }
    return false;
  }
}
