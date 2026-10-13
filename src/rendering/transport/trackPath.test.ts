import { describe, expect, it } from 'vitest';
import { buildTrackCurve } from './trackPath.ts';

const line = [
  { x: 0, z: 0 },
  { x: 120, z: 30 },
  { x: 230, z: 140 },
  { x: 230, z: 300 },
  { x: 90, z: 360 },
];

describe('track alignment', () => {
  const curve = buildTrackCurve(line, 7);
  if (!curve) throw new Error('curve missing');

  it('passes through every station exactly, at the running height', () => {
    line.forEach((st, i) => {
      const p = curve.pointAtArc(curve.knots[i]);
      expect(Math.hypot(p.x - st.x, p.z - st.z)).toBeLessThan(1e-6);
      expect(p.y).toBe(7);
    });
  });

  it('holds a straight lead-in and lead-out at each platform', () => {
    line.forEach((_, i) => {
      const h = curve.headings[i];
      for (const off of [-8, 8]) {
        const s = curve.knots[i] + off;
        if (s < 0 || s > curve.length) continue;
        const t = curve.tangentAtArc(s);
        expect(t.x * h.x + t.z * h.z).toBeGreaterThan(0.999);
      }
    });
  });

  it('has no kinks: heading turns gently from sample to sample', () => {
    for (let i = 1; i + 1 < curve.pts.length; i++) {
      const a = curve.pts[i].clone().sub(curve.pts[i - 1]).setY(0).normalize();
      const b = curve.pts[i + 1].clone().sub(curve.pts[i]).setY(0).normalize();
      expect(a.dot(b)).toBeGreaterThan(0.93);
    }
  });

  it('is longer than the chords but never wanders far from them', () => {
    let chords = 0;
    for (let i = 0; i + 1 < line.length; i++) chords += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z);
    expect(curve.length).toBeGreaterThanOrEqual(chords);
    expect(curve.length).toBeLessThan(chords * 1.15);
  });

  it('maps simulation distance onto the curve piecewise, station to station', () => {
    expect(curve.arcAtSim(0)).toBe(0);
    curve.simKnots.forEach((s, i) => expect(curve.arcAtSim(s)).toBeCloseTo(curve.knots[i], 6));
    let prev = -1;
    for (let s = 0; s <= curve.simKnots[curve.simKnots.length - 1]; s += 7) {
      const arc = curve.arcAtSim(s);
      expect(arc).toBeGreaterThanOrEqual(prev);
      prev = arc;
    }
  });

  it('returns null for a route with fewer than two stations', () => {
    expect(buildTrackCurve([{ x: 1, z: 1 }], 0)).toBeNull();
  });
});

describe('track alignment at world scale', () => {
  // Station spacing x5: chords of 500 m to 1.6 km, the spans the scaled city has.
  const world = [
    { x: 0, z: 0 },
    { x: 760, z: 210 },
    { x: 1180, z: 900 },
    { x: 900, z: 1620 },
    { x: 180, z: 1900 },
  ];
  const curve = buildTrackCurve(world, 6.5);
  if (!curve) throw new Error('curve missing');

  it('still passes through every station and holds the platform straights', () => {
    world.forEach((st, i) => {
      const p = curve.pointAtArc(curve.knots[i]);
      expect(Math.hypot(p.x - st.x, p.z - st.z)).toBeLessThan(1e-6);
      const h = curve.headings[i];
      for (const off of [-8, 8]) {
        const s = curve.knots[i] + off;
        if (s < 0 || s > curve.length) continue;
        const t = curve.tangentAtArc(s);
        expect(t.x * h.x + t.z * h.z).toBeGreaterThan(0.999);
      }
    });
  });

  it('stays smooth over the longer spans, with no kink', () => {
    for (let i = 1; i + 1 < curve.pts.length; i++) {
      const a = curve.pts[i].clone().sub(curve.pts[i - 1]).setY(0).normalize();
      const b = curve.pts[i + 1].clone().sub(curve.pts[i]).setY(0).normalize();
      expect(a.dot(b)).toBeGreaterThan(0.93);
    }
  });

  it('eases between stations without wandering far from the chords', () => {
    let chords = 0;
    for (let i = 0; i + 1 < world.length; i++) chords += Math.hypot(world[i + 1].x - world[i].x, world[i + 1].z - world[i].z);
    expect(curve.length).toBeGreaterThanOrEqual(chords);
    expect(curve.length).toBeLessThan(chords * 1.15);
  });
});
