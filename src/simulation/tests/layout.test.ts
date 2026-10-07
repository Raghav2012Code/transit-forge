import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';
import { coastXAt, riverXAt, roadSegments } from '../city/layout.ts';
import type { Building } from '../../types/index.ts';

const city = generateCity(1337);

/** Point inside a building's footprint, grown by `pad`. */
function inside(b: Building, x: number, z: number, pad = 0): boolean {
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return Math.abs(dx * c - dz * s) <= b.w / 2 + pad && Math.abs(dx * s + dz * c) <= b.d / 2 + pad;
}

function corners(b: Building, grow = 0): [number, number][] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const out: [number, number][] = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = (u * (b.w / 2 + grow));
    const lz = (v * (b.d / 2 + grow));
    out.push([b.pos.x + lx * c + lz * s, b.pos.z - lx * s + lz * c]);
  }
  return out;
}

function segDist(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

describe('city layout', () => {
  it('is deterministic and rich enough to read as a city', () => {
    const again = generateCity(1337);
    expect(JSON.stringify(again.buildings)).toBe(JSON.stringify(city.buildings));
    expect(JSON.stringify(again.streets)).toBe(JSON.stringify(city.streets));
    expect(city.buildings.length).toBeGreaterThan(550);
    expect(city.streets.length).toBeGreaterThan(100);
    expect(city.parks.length).toBeGreaterThan(5);
    expect(city.landmarks.some((l) => l.kind === 'runway')).toBe(true);
    expect(city.landmarks.some((l) => l.kind === 'pier')).toBe(true);
  });

  it('keeps every building on land and off the river', () => {
    for (const b of city.buildings) {
      for (const [x, z] of corners(b)) {
        expect(x).toBeGreaterThan(coastXAt(z));
        expect(Math.abs(x - riverXAt(city.river, z))).toBeGreaterThan(13);
      }
    }
  });

  it('keeps every building clear of the arterial roads', () => {
    const segs = roadSegments(city.roadNodes, city.roadEdges);
    for (const b of city.buildings) {
      for (const [x, z] of corners(b)) {
        for (const r of segs) expect(segDist(x, z, r.a, r.b)).toBeGreaterThan(r.w / 2);
      }
    }
  });

  it('never stands one building inside another except a tower on its podium', () => {
    for (let i = 0; i < city.buildings.length; i++) {
      const a = city.buildings[i];
      for (let j = i + 1; j < city.buildings.length; j++) {
        const b = city.buildings[j];
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 90) continue;
        const bInA = corners(b, -0.3).every(([x, z]) => inside(a, x, z));
        const aInB = corners(a, -0.3).every(([x, z]) => inside(b, x, z));
        const clash = corners(a, -0.3).some(([x, z]) => inside(b, x, z)) || corners(b, -0.3).some(([x, z]) => inside(a, x, z));
        if (clash) {
          // Allowed only as containment, with the inner building the taller one.
          expect(bInA || aInB).toBe(true);
          const [inner, outer] = bInA ? [b, a] : [a, b];
          expect(inner.h).toBeGreaterThan(outer.h);
        }
      }
    }
  });

  it('runs no street through a building', () => {
    for (const st of city.streets) {
      const len = Math.hypot(st.b.x - st.a.x, st.b.z - st.a.z);
      for (let s = 0; s <= len; s += 6) {
        const x = st.a.x + ((st.b.x - st.a.x) * s) / len;
        const z = st.a.z + ((st.b.z - st.a.z) * s) / len;
        for (const b of city.buildings) {
          if (Math.abs(b.pos.x - x) < 80 && Math.abs(b.pos.z - z) < 80) expect(inside(b, x, z)).toBe(false);
        }
      }
    }
  });

  it('gives each district its own skyline', () => {
    const tallest = (k: string) => Math.max(...city.buildings.filter((b) => b.district === k).map((b) => b.h));
    expect(tallest('cbd')).toBeGreaterThan(60);
    expect(tallest('suburban')).toBeLessThan(12);
    expect(tallest('cbd')).toBeGreaterThan(tallest('residential'));
  });
});
