import { describe, expect, it } from 'vitest';
import { cycleNext, resolveClick } from './selectionCycle.ts';
import { changeMarkers, problemMarkers, type MarkerAnchors } from './markers.ts';
import { formatDistance, snapStation, straightDistance } from './measure.ts';
import { DEFAULT_LAYERS, sanitizeLayers } from './layerPrefs.ts';
import { cameraWedge, frameFor, project, unproject } from './minimap.ts';
import type { CityProblem } from '../../simulation/planning/problems.ts';

const anchors: MarkerAnchors = {
  stations: new Map([['st-central', { x: 0, z: 0 }]]),
  zones: new Map([['z-air', { x: 470, z: -40 }]]),
  routeMid: new Map([['rt-m1', { x: 45, z: -45 }]]),
  roadMid: new Map([['re-1', { x: 10, z: 10 }]]),
};

function problem(partial: Partial<CityProblem> & { id: string }): CityProblem {
  return {
    kind: 'crowding', title: 'P', severity: 50, metrics: [], causes: [], interventions: [], why: [],
    target: { kind: 'station', id: 'st-central' }, ...partial,
  };
}

describe('selection cycling', () => {
  it('starts at the top candidate and walks on repeated same-spot clicks', () => {
    const cands = [{ kind: 'station', id: 'a' }, { kind: 'route', id: 'b' }];
    const first = resolveClick(null, 10, 10, 1000, cands);
    expect(first.pick?.id).toBe('a');
    const second = resolveClick(first.state, 11, 11, 1500, cands);
    expect(second.pick?.id).toBe('b');
    const third = resolveClick(second.state, 11, 11, 2000, cands);
    expect(third.pick?.id).toBe('a');
    // A far-away click restarts at the top candidate.
    const moved = resolveClick(third.state, 300, 300, 2500, cands);
    expect(moved.pick?.id).toBe('a');
    // Stale clicks restart too.
    const stale = resolveClick(third.state, 11, 11, 9000, cands);
    expect(stale.pick?.id).toBe('a');
    expect(resolveClick(null, 0, 0, 0, []).pick).toBeNull();
  });

  it('wraps cycleNext in both directions', () => {
    expect(cycleNext(3, 2)).toBe(0);
    expect(cycleNext(3, 0, -1)).toBe(2);
    expect(cycleNext(0, 0)).toBe(-1);
  });
});

describe('problem markers', () => {
  it('anchors each problem kind and caps the count', () => {
    const problems = [
      problem({ id: 'p1', kind: 'crowding', severity: 90, target: { kind: 'route', id: 'rt-m1' } }),
      problem({ id: 'p2', kind: 'congestion', severity: 80, target: { kind: 'road', id: 're-1' } }),
      problem({ id: 'p3', kind: 'growth', severity: 70, target: { kind: 'zone', id: 'z-air' } }),
      problem({ id: 'p4', kind: 'criticality', severity: 60, target: { kind: 'station', id: 'st-central' } }),
      problem({ id: 'p5', kind: 'overservice', severity: 10, target: null }),
    ];
    const markers = problemMarkers(problems, anchors, new Map());
    // Null-target overservice has no anchor and is skipped.
    expect(markers.map((m) => m.selId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(markers[0]).toMatchObject({ x: 45, z: -45, tone: 'bad', selKind: 'problem' });
    const capped = problemMarkers(problems, anchors, new Map(), 2);
    expect(capped).toHaveLength(2);
  });

  it('places access gaps at gap coordinates', () => {
    const markers = problemMarkers(
      [problem({ id: 'gap-1-2', kind: 'access', target: null })],
      anchors,
      new Map([['gap-1-2', { x: 1, z: 2 }]]),
    );
    expect(markers[0]).toMatchObject({ x: 1, z: 2, tone: 'info' });
  });
});

describe('change markers', () => {
  const full = { ...anchors, centroid: { x: 40, z: 0 } };
  it('marks added/removed infrastructure and service edits', () => {
    const markers = changeMarkers(
      [
        { type: 'addStation', station: { id: 'st-x', name: 'X', x: 5, z: 6, capacityPerHr: 1000 } },
        { type: 'removeStation', stationId: 'st-gone' },
        { type: 'setService', routeId: 'rt-m1', patch: { peakHeadwayMin: 4 } },
        { type: 'setFares', fares: { metro: 1, rail: 1, bus: 1 } },
      ],
      full,
      (id) => id,
    );
    expect(markers.map((m) => m.change)).toEqual(['added-station', 'removed-station', 'service', 'fares']);
    expect(markers[0]).toMatchObject({ x: 5, z: 6, tone: 'good' });
    // Unknown removed station falls back to the network centroid.
    expect(markers[1]).toMatchObject({ x: 40, z: 0, tone: 'bad' });
  });
});

describe('measurement', () => {
  it('formats straight distances like the spec example', () => {
    expect(formatDistance(2400)).toBe('Distance: 2.4 km');
    expect(formatDistance(85)).toBe('Distance: 85 m');
    expect(straightDistance({ a: { x: 0, z: 0 }, b: { x: 30, z: 40 } })).toBe(50);
  });

  it('snaps to nearby stations only', () => {
    const stations = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 500, z: 0 }];
    expect(snapStation({ x: 10, z: 10 }, stations)).toBe('a');
    expect(snapStation({ x: 250, z: 0 }, stations)).toBeNull();
  });
});

describe('layer preferences', () => {
  it('defaults everything visible and drops unknown keys', () => {
    expect(sanitizeLayers(undefined)).toEqual(DEFAULT_LAYERS);
    expect(sanitizeLayers({ labels: false, bogus: true, vehicles: 'yes' })).toEqual({ ...DEFAULT_LAYERS, labels: false });
  });
});

describe('minimap math', () => {
  it('projects and unprojects symmetrically', () => {
    const f = frameFor([{ x: -500, z: -400 }, { x: 500, z: 400 }], 200, 100, 0);
    expect(project(f, -500, -400)).toEqual([0, 0]);
    expect(project(f, 500, 400)).toEqual([200, 100]);
    const [x, z] = project(f, 100, 50);
    expect(unproject(f, x, z)).toEqual({ x: 100, z: 50 });
  });

  it('draws the wedge apex at the camera', () => {
    const f = frameFor([{ x: -500, z: -400 }, { x: 500, z: 400 }], 200, 100, 0);
    const wedge = cameraWedge(f, { x: 0, z: 0 }, { x: 100, z: 0 }, 300);
    expect(wedge).toHaveLength(3);
    expect(wedge[0]).toEqual(project(f, 0, 0));
    // Wedge opens toward the target: base midpoint is past the apex.
    const mid: [number, number] = [(wedge[1][0] + wedge[2][0]) / 2, (wedge[1][1] + wedge[2][1]) / 2];
    expect(mid[0]).toBeGreaterThan(wedge[0][0]);
  });
});
