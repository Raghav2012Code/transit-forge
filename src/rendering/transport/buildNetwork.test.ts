import { describe, expect, it } from 'vitest';
import { buildNetworkMeshes, draftY, MODE_Y, pierArcs, routeCurve } from './buildNetwork.ts';
import { getPalette } from '../palette.ts';
import { DiscIndex, discsHitBox } from '../city/spatial.ts';
import type { Building, Station, TransportRoute } from '../../types/index.ts';

function station(id: string, x: number, z: number): Station {
  return {
    id, name: id, pos: { x, y: 0, z }, modes: ['metro'], routeIds: ['rt-world'],
    capacityPerHr: 3000, waiting: 0, boardedDay: 0, alightedDay: 0,
    peakWaiting: 0, transfersDay: 0,
  };
}

function metro(ids: string[]): TransportRoute {
  return {
    id: 'rt-world', name: 'World', mode: 'metro', color: '#38bdf8',
    stationIds: ids, headwayMin: 5, speedKph: 32, vehicleCapacity: 400,
  };
}

function bus(ids: string[]): TransportRoute {
  return { ...metro(ids), id: 'rt-world-bus', name: 'World Bus', mode: 'bus', color: '#facc15' };
}

// Station spacing at the scaled world: hundreds of metres to well over a kilometre.
const stations = [station('a', 0, 0), station('b', 900, 0), station('c', 900, 1500)];
const route = metro(['a', 'b', 'c']);
const byId = new Map(stations.map((s) => [s.id, s]));

describe('viaducts over the scaled spans', () => {
  const curve = routeCurve(route, byId);
  if (!curve) throw new Error('curve missing');
  const arcs = pierArcs(curve);

  it('carries a longer span on proportionally more piers, on the same 26 m grid', () => {
    // A fixed spacing in metres: one pier per 26 m, minus the station gaps.
    const expected = Math.floor((curve.length - 44) / 26);
    expect(arcs.length).toBeGreaterThan(expected - curve.knots.length);
    expect(arcs.length).toBeLessThanOrEqual(expected + 1);
    // Every pier on the grid, strictly increasing: no double, no half-step.
    for (let i = 0; i < arcs.length; i++) {
      expect((arcs[i] - 24) % 26).toBe(0);
      if (i > 0) expect(arcs[i] - arcs[i - 1]).toBeGreaterThanOrEqual(26);
    }
  });

  it('leaves every station free for its own columns', () => {
    for (const s of arcs) {
      for (const k of curve.knots) expect(Math.abs(k - s)).toBeGreaterThanOrEqual(24);
    }
  });

  it('rides metro on piers and buses at street level', () => {
    const net = buildNetworkMeshes(stations, [route, bus(['a', 'b'])], getPalette('light'));
    const kinds = (g: (typeof net.byMode)['metro']) => g.children.map((c) => c.userData.kind);
    expect(kinds(net.byMode.metro)).toContain('pier');
    expect(kinds(net.byMode.metro)).toContain('deck');
    expect(kinds(net.byMode.bus)).not.toContain('pier');
    // The busway rides the street, not a viaduct.
    expect(net.curves.get('rt-world-bus')?.pts[0].y).toBe(MODE_Y.bus);
  });

  it('drafts a bus at street height and an aerial line on its viaduct', () => {
    expect(draftY('bus')).toBe(MODE_Y.bus + 1.2);
    expect(draftY('metro')).toBe(MODE_Y.metro + 1.2);
    expect(draftY('bus')).toBeLessThan(draftY('metro'));
  });
});

describe('clearance along the alignment', () => {
  const curve = routeCurve(route, byId);
  if (!curve) throw new Error('curve missing');
  const net = buildNetworkMeshes(stations, [route], getPalette('light'));
  const clear = new DiscIndex(net.avoid);
  const mid = curve.pointAtArc(curve.length / 2);
  const box = (x: number, z: number): Building => ({
    pos: { x, y: 0, z }, w: 30, d: 20, h: 40, district: 'cbd', rot: 0,
  });

  it('clears a building that stands on the alignment, at any point along it', () => {
    expect(discsHitBox(clear, box(mid.x, mid.z), 1)).toBe(true);
    // The whole corridor is covered, so there is no uncovered gap to slip through.
    for (let s = 0; s <= curve.length; s += 1) {
      const p = curve.pointAtArc(s);
      expect(net.avoid.some((d) => Math.hypot(p.x - d.x, p.z - d.z) < d.r)).toBe(true);
    }
  });

  it('leaves a building well off the line standing', () => {
    expect(discsHitBox(clear, box(mid.x + 60, mid.z), 1)).toBe(false);
  });
});
