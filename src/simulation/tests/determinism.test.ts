import { describe, expect, it } from 'vitest';
import { generateCity } from '../city/generateCity.ts';

describe('city generator determinism', () => {
  it('produces identical output for the same seed', () => {
    const a = generateCity(1337);
    const b = generateCity(1337);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('creates the required districts and river crossings', () => {
    const city = generateCity(1337);
    const kinds = new Set(city.zones.map((z) => z.kind));
    for (const k of ['cbd', 'residential', 'industrial', 'university', 'airport', 'harbor', 'suburban'] as const) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(city.zones.length).toBeGreaterThanOrEqual(10);
    expect(city.bridges.length).toBeGreaterThanOrEqual(2);
    expect(city.buildings.length).toBeGreaterThan(500);
  });
});
