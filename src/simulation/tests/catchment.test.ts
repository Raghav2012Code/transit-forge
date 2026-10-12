import { describe, expect, it } from 'vitest';
import { circleOverlapFraction } from '../analytics/catchment.ts';

// acos is only defined on [-1, 1]; a near-tangent pair used to round outside it
// and leak NaN into catchment population. The result is always a fraction.
describe('circleOverlapFraction', () => {
  const cases: [number, number, number][] = [
    [1000, 800, 1799.9999999],
    [1000, 800, 200.0000001],
    [1000, 1000, 1e-9],
    [500, 500, 999.9999999],
  ];
  it('never returns NaN at tangency and stays within [0, 1]', () => {
    for (const [r0, r1, d] of cases) {
      const f = circleOverlapFraction(r0, r1, d);
      expect(Number.isNaN(f)).toBe(false);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
