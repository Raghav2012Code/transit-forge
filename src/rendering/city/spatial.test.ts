import { describe, expect, it } from 'vitest';
import { BUILDING_PAD, BuildingIndex } from './spatial.ts';
import type { Building } from '../../types/index.ts';

function slab(w: number, d: number, x = 0, z = 0): Building {
  return { id: 'slab', pos: { x, y: 0, z }, w, d, rot: 0, height: 10, kind: 'industrial' } as unknown as Building;
}

describe('BuildingIndex.covers', () => {
  it('finds a footprint and a point just inside its pad', () => {
    const index = new BuildingIndex([slab(40, 8)], BUILDING_PAD);
    expect(index.covers(0, 0, BUILDING_PAD)).toBe(true);
    expect(index.covers(20 + BUILDING_PAD - 0.1, 0, BUILDING_PAD)).toBe(true);
    expect(index.covers(20 + BUILDING_PAD + 0.1, 0, BUILDING_PAD)).toBe(false);
  });

  it('answers in the pad annulus when the circle ends just short of the query cell', () => {
    // 63.6 m long, 2 m deep: the circumscribed circle ends at x = 31.81, so the
    // footprint cell index stops before the query point at 33.5.
    const index = new BuildingIndex([slab(63.6, 2)], BUILDING_PAD);
    expect(index.covers(33.5, 0, BUILDING_PAD)).toBe(true);
    expect(index.covers(33.9, 0, BUILDING_PAD)).toBe(false);
  });
});
