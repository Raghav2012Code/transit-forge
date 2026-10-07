// Street grids, blocks and lots. Pure and seeded: the same seed gives the same
// streets and the same buildings. Nothing here feeds the simulation (demand
// comes from zone populations); it is what the map is drawn from.
import type { Building, CityData, DistrictKind, Landmark, Park, RoadEdge, Street, Vec3, Zone } from '../../types/index.ts';
import { coastXAt, RIVER_HALF_M as WATER_HALF } from './geography.ts';
import type { Rng } from './seededRng.ts';

export { coastXAt };

const BEACH = 12; // keep lots this far from the shoreline

export function riverXAt(river: Vec3[], z: number): number {
  if (river.length === 0) return 120;
  if (z <= river[0].z) return river[0].x;
  for (let i = 1; i < river.length; i++) {
    if (z <= river[i].z) {
      const a = river[i - 1];
      const b = river[i];
      const f = (z - a.z) / Math.max(1e-6, b.z - a.z);
      return a.x + (b.x - a.x) * f;
    }
  }
  return river[river.length - 1].x;
}

interface Grid {
  cx: number;
  cz: number;
  street: number;
  angle: number;
}

const GRIDS: Partial<Record<DistrictKind, Grid>> = {
  cbd: { cx: 38, cz: 38, street: 9, angle: 0 },
  residential: { cx: 48, cz: 40, street: 9, angle: 0 },
  suburban: { cx: 60, cz: 46, street: 8, angle: 0 },
  industrial: { cx: 100, cz: 80, street: 12, angle: 0 },
  university: { cx: 70, cz: 70, street: 8, angle: 0 },
  harbor: { cx: 80, cz: 60, street: 10, angle: 0 },
};

/** Districts turn their grid a little, so the city does not read as one lattice. */
const GRID_ANGLE: Record<string, number> = {
  'z-res-w': 0.14,
  'z-res-e': -0.1,
  'z-sub-s': 0.24,
  'z-sub-ne': -0.2,
  'z-univ': 0.3,
  'z-harbor': -0.22,
};

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const CELL = 32;

class Occupancy {
  private cells = new Map<number, Rect[]>();
  private key(i: number, j: number): number {
    return (i + 4096) * 8192 + (j + 4096);
  }
  add(r: Rect): void {
    for (let i = Math.floor(r.x0 / CELL); i <= Math.floor(r.x1 / CELL); i++) {
      for (let j = Math.floor(r.z0 / CELL); j <= Math.floor(r.z1 / CELL); j++) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(r);
        else this.cells.set(k, [r]);
      }
    }
  }
  hits(r: Rect, pad: number): boolean {
    for (let i = Math.floor((r.x0 - pad) / CELL); i <= Math.floor((r.x1 + pad) / CELL); i++) {
      for (let j = Math.floor((r.z0 - pad) / CELL); j <= Math.floor((r.z1 + pad) / CELL); j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const o of list) {
          if (r.x0 - pad < o.x1 && r.x1 + pad > o.x0 && r.z0 - pad < o.z1 && r.z1 + pad > o.z0) return true;
        }
      }
    }
    return false;
  }
}

function rectOf(x: number, z: number, w: number, d: number, rot: number): Rect {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = (w * c + d * s) / 2;
  const ez = (w * s + d * c) / 2;
  return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez };
}

/** Does segment a-b pass through the box (centre, half sizes, yaw) grown by `margin`? */
function segmentHitsBox(
  a: { x: number; z: number },
  b: { x: number; z: number },
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  rot: number,
  margin: number,
): boolean {
  // Into the box's frame: three's rotation.y = rot sends local x to (cos, -sin).
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const loc = (p: { x: number; z: number }) => ({
    x: (p.x - cx) * c - (p.z - cz) * s,
    z: (p.x - cx) * s + (p.z - cz) * c,
  });
  const p = loc(a);
  const q = loc(b);
  const ex = hw + margin;
  const ez = hd + margin;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  for (const [pk, dk, lim] of [
    [p.x, dx, ex],
    [p.z, dz, ez],
  ] as const) {
    if (Math.abs(dk) < 1e-9) {
      if (Math.abs(pk) > lim) return false;
    } else {
      let ta = (-lim - pk) / dk;
      let tb = (lim - pk) / dk;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function pointSegDist(px: number, pz: number, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0;
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

export interface LayoutInput {
  zones: Zone[];
  river: Vec3[];
  roadSegs: { a: Vec3; b: Vec3; w: number }[];
}

export interface Layout {
  buildings: Building[];
  streets: Street[];
  parks: Park[];
  landmarks: Landmark[];
}

export function roadSegments(
  nodes: CityData['roadNodes'],
  edges: RoadEdge[],
): { a: Vec3; b: Vec3; w: number }[] {
  const byId = new Map(nodes.map((n) => [n.id, n.pos]));
  const out: { a: Vec3; b: Vec3; w: number }[] = [];
  for (const e of edges) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (a && b) out.push({ a, b, w: e.isArterial ? 9 : 5 });
  }
  return out;
}

export function layoutCity(input: LayoutInput, rand: Rng): Layout {
  const { zones, river, roadSegs } = input;
  const occ = new Occupancy();
  const buildings: Building[] = [];
  const parks: Park[] = [];
  const streets: Street[] = [];
  const landmarks: Landmark[] = [];

  // Which district a point belongs to: the one it is deepest inside.
  const REACH = 1.3; // districts thin out past their radius rather than stopping
  let lastDepth = 0;
  const ownerOf = (x: number, z: number): number => {
    let best = -1;
    let bestR = REACH;
    for (let i = 0; i < zones.length; i++) {
      const r = Math.hypot(x - zones[i].center.x, z - zones[i].center.z) / zones[i].radius;
      if (r < bestR) {
        bestR = r;
        best = i;
      }
    }
    lastDepth = bestR;
    return best;
  };
  /** Buildings shrink toward a district's edge, so it fades into the open land. */
  const edgeScale = (x: number, z: number): number => {
    ownerOf(x, z);
    const t = Math.min(1, Math.max(0, (lastDepth - 0.75) / (REACH - 0.75)));
    return 1 - 0.55 * t * t * (3 - 2 * t);
  };

  const onLand = (x: number, z: number, margin = BEACH): boolean => x > coastXAt(z) + margin;
  const clearOfRiver = (x: number, z: number, margin: number): boolean => Math.abs(x - riverXAt(river, z)) > WATER_HALF + margin;

  const clearOfRoads = (x: number, z: number, w: number, d: number, rot: number, extra: number): boolean => {
    for (const r of roadSegs) {
      if (segmentHitsBox(r.a, r.b, x, z, w / 2, d / 2, rot, r.w / 2 + extra)) return false;
    }
    return true;
  };

  const clearOfRiverBox = (x: number, z: number, w: number, d: number, rot: number): boolean => {
    for (let i = 1; i < river.length; i++) {
      if (segmentHitsBox(river[i - 1], river[i], x, z, w / 2, d / 2, rot, WATER_HALF + 6)) return false;
    }
    return true;
  };

  const place = (
    zi: number,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    rot: number,
    district: DistrictKind,
    opts: { pad?: number; stack?: boolean; free?: boolean } = {},
  ): boolean => {
    if (!opts.free && ownerOf(x, z) !== zi) return false;
    const rc = Math.hypot(w, d) / 2;
    if (!onLand(x - rc * 0.8, z) || !onLand(x - rc * 0.8, z - rc) || !onLand(x - rc * 0.8, z + rc)) return false;
    if (!clearOfRiver(x, z, 0) || !clearOfRiverBox(x, z, w, d, rot)) return false;
    if (!clearOfRoads(x, z, w, d, rot, 4)) return false;
    const rect = rectOf(x, z, w, d, rot);
    if (!opts.stack && occ.hits(rect, opts.pad ?? 1.5)) return false;
    if (!opts.stack) occ.add(rect);
    buildings.push({ pos: { x, y: 0, z }, w, d, h: opts.free ? h : h * edgeScale(x, z), district, rot });
    return true;
  };

  const placePark = (zi: number, x: number, z: number, w: number, d: number, rot: number): void => {
    if (ownerOf(x, z) !== zi) return;
    if (!onLand(x - w / 2, z) || !clearOfRiverBox(x, z, w, d, rot) || !clearOfRoads(x, z, w, d, rot, 1)) return;
    const rect = rectOf(x, z, w, d, rot);
    if (occ.hits(rect, 0)) return;
    occ.add(rect);
    parks.push({ pos: { x, y: 0, z }, w, d, rot });
  };

  // --- Landmarks first, so lots keep clear of them. -------------------------
  const strip = (kind: Landmark['kind'], ax: number, az: number, bx: number, bz: number, w: number): void => {
    landmarks.push({ kind, a: { x: ax, y: 0, z: az }, b: { x: bx, y: 0, z: bz }, w });
    const ex = Math.abs(bx - ax) / 2 + w / 2;
    const ez = Math.abs(bz - az) / 2 + w / 2;
    if (kind !== 'pier') {
      occ.add({ x0: (ax + bx) / 2 - ex, x1: (ax + bx) / 2 + ex, z0: (az + bz) / 2 - ez, z1: (az + bz) / 2 + ez });
    }
  };
  const air = zones.findIndex((z) => z.kind === 'airport');
  const har = zones.findIndex((z) => z.kind === 'harbor');
  if (air >= 0) {
    const c = zones[air].center;
    strip('runway', c.x - 100, c.z - 86, c.x + 118, c.z - 86, 26);
    strip('taxiway', c.x - 70, c.z - 54, c.x + 98, c.z - 54, 10);
    strip('taxiway', c.x - 40, c.z - 86, c.x - 40, c.z - 54, 9);
    strip('taxiway', c.x + 64, c.z - 86, c.x + 64, c.z - 54, 9);
  }
  if (har >= 0) {
    const c = zones[har].center;
    for (const dz of [-50, -2, 46]) {
      const z = c.z + dz;
      const x0 = coastXAt(z) + 6;
      strip('pier', x0, z, x0 - 78, z, 16);
    }
  }

  // --- Airport buildings by hand: one terminal, hangars, a tower. -----------
  if (air >= 0) {
    const c = zones[air].center;
    // The terminal sits east of the station, clear of the line that comes in from the west.
    place(air, c.x + 65, c.z + 14, 80, 24, 17, 0, 'airport', { free: true });
    place(air, c.x - 84, c.z - 22, 38, 30, 13, 0, 'airport', { free: true });
    place(air, c.x + 100, c.z - 22, 38, 30, 13, 0, 'airport', { free: true });
    place(air, c.x + 50, c.z - 42, 8, 8, 34, 0, 'airport', { free: true });
    for (let i = 0; i < 2; i++) place(air, c.x + 35 + i * 25, c.z - 11, 8, 20, 6, 0, 'airport', { free: true });
  }

  // --- Block lots per district. ---------------------------------------------
  // Streets are laid after every district has placed its lots, so none of
  // them runs through a building that belongs to a neighbour.
  const laterStreets: (() => void)[] = [];
  zones.forEach((zone, zi) => {
    const base = GRIDS[zone.kind];
    if (!base) return;
    const angle = GRID_ANGLE[zone.id] ?? base.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = -angle;
    const toWorld = (u: number, v: number) => ({
      x: zone.center.x + u * cos - v * sin,
      z: zone.center.z + u * sin + v * cos,
    });
    const nx = Math.ceil(zone.radius / base.cx) + 1;
    const nz = Math.ceil(zone.radius / base.cz) + 1;
    const bw = base.cx - base.street;
    const bd = base.cz - base.street;

    for (let i = -nx; i <= nx; i++) {
      for (let j = -nz; j <= nz; j++) {
        const u0 = i * base.cx;
        const v0 = j * base.cz;
        const centre = toWorld(u0, v0);
        if (ownerOf(centre.x, centre.z) !== zi) continue;
        const distC = Math.hypot(centre.x - zone.center.x, centre.z - zone.center.z);
        const at = (u: number, v: number) => toWorld(u0 + u, v0 + v);
        const lot = (u: number, v: number, w: number, d: number, h: number, o: { stack?: boolean } = {}) => {
          const p = at(u, v);
          return place(zi, p.x, p.z, w, d, h, rot, zone.kind, o);
        };

        switch (zone.kind) {
          case 'cbd': {
            if (rand() < 0.1) {
              placePark(zi, centre.x, centre.z, bw - 6, bd - 6, rot);
              break;
            }
            const core = Math.exp(-((distC / 80) ** 2));
            const tallest = () => 26 + (112 - 26) * core * (0.4 + 0.6 * rand()) + rand() * 12;
            const mode = rand();
            if (mode < 0.45) {
              // Podium with a tower set back on it.
              const w = bw - 2 - rand() * 3;
              const d = bd - 2 - rand() * 3;
              if (lot(0, 0, w, d, 8 + rand() * 6)) {
                const tw = w * (0.5 + rand() * 0.2);
                const td = d * (0.5 + rand() * 0.2);
                lot((rand() - 0.5) * (w - tw) * 0.6, (rand() - 0.5) * (d - td) * 0.6, tw, td, tallest(), { stack: true });
              }
            } else if (mode < 0.8) {
              const alongU = rand() < 0.5;
              const w = alongU ? (bw - 5) / 2 : bw - 3;
              const d = alongU ? bd - 3 : (bd - 5) / 2;
              for (const s of [-1, 1]) {
                lot(alongU ? s * (w / 2 + 1.25) : 0, alongU ? 0 : s * (d / 2 + 1.25), w, d, tallest() * (0.6 + 0.4 * rand()));
              }
            } else {
              const w = (bw - 5) / 2;
              const d = (bd - 5) / 2;
              for (const su of [-1, 1]) for (const sv of [-1, 1]) {
                lot(su * (w / 2 + 1.25), sv * (d / 2 + 1.25), w, d, 14 + rand() * 30 * (0.4 + core));
              }
            }
            break;
          }
          case 'residential': {
            if (rand() < 0.1) {
              placePark(zi, centre.x, centre.z, bw - 6, bd - 6, rot);
              break;
            }
            // Slabs around the block edge, courtyard left open.
            const depth = 10 + rand() * 2;
            const floors = 16 + rand() * 16;
            for (const sv of [-1, 1]) {
              let u = -bw / 2 + 4;
              while (u < bw / 2 - 8) {
                const w = 9 + rand() * 7;
                if (u + w > bw / 2 - 2) break;
                lot(u + w / 2, sv * (bd / 2 - depth / 2 - 1), w, depth, floors + (rand() - 0.5) * 10);
                u += w + 2.5;
              }
            }
            if (rand() < 0.4) lot(0, 0, bw * 0.3, bd * 0.2, 6 + rand() * 4);
            if (rand() < 0.18) lot((rand() - 0.5) * bw * 0.3, 0, 12, 12, 42 + rand() * 18);
            break;
          }
          case 'suburban': {
            if (rand() < 0.1) {
              placePark(zi, centre.x, centre.z, bw - 6, bd - 6, rot);
              break;
            }
            for (const sv of [-1, 1]) {
              let u = -bw / 2 + 5;
              while (u < bw / 2 - 6) {
                const w = 8.5 + rand() * 3;
                const d = 8 + rand() * 2.5;
                lot(u + w / 2, sv * (bd / 2 - d / 2 - 3), w, d, 5 + rand() * 2.5);
                u += w + 4.5 + rand() * 3;
              }
            }
            break;
          }
          case 'industrial': {
            // Rows of sheds of different lengths, with yards between.
            const rows = rand() < 0.35 ? 2 : 3;
            const d = (bd - 4) / rows - 3;
            for (let r = 0; r < rows; r++) {
              let u = -bw / 2 + 3;
              while (u < bw / 2 - 16) {
                const w = Math.min(bw / 2 - u - 2, 20 + rand() * 24);
                if (w < 14) break;
                lot(u + w / 2, (r - (rows - 1) / 2) * (d + 3), w, d, 7 + rand() * 7);
                u += w + 3 + rand() * 6;
              }
            }
            if (rand() < 0.4) lot(bw / 2 - 5, -bd / 2 + 5, 6, 6, 20 + rand() * 8);
            break;
          }
          case 'university': {
            if ((i + j) % 2 === 0 && rand() < 0.7) {
              placePark(zi, centre.x, centre.z, bw - 6, bd - 6, rot);
              break;
            }
            const n = 2 + Math.floor(rand() * 2);
            for (let k = 0; k < n; k++) {
              const w = 20 + rand() * 10;
              const d = 11 + rand() * 4;
              lot((rand() - 0.5) * (bw - w), (k - (n - 1) / 2) * (bd / n), w, d, 11 + rand() * 12);
            }
            break;
          }
          case 'harbor': {
            if (rand() < 0.45) {
              // Container yard: rows of stacked boxes.
              for (let a = 0; a < 4; a++) {
                for (let b = 0; b < 6; b++) {
                  lot(-bw / 2 + 8 + b * 11, -bd / 2 + 7 + a * 9, 10, 6, 2.6 * (1 + Math.floor(rand() * 3)));
                }
              }
            } else {
              for (const sv of [-1, 1]) {
                lot((rand() - 0.5) * 8, sv * (bd / 4 + 2), bw * 0.78, bd * 0.34, 8 + rand() * 3);
              }
            }
            break;
          }
          default:
            break;
        }
      }
    }

    // --- Local streets for this district's grid. ----------------------------
    const reach = zone.radius + 20;
    const step = 7;
    const emit = (alongU: boolean): void => {
      const cell = alongU ? base.cz : base.cx;
      const lines = Math.ceil(reach / cell) + 1;
      for (let k = -lines; k <= lines; k++) {
        const off = (k + 0.5) * cell;
        let run: Vec3[] = [];
        const flush = () => {
          if (run.length >= 2) streets.push({ a: run[0], b: run[run.length - 1], w: base.street });
          run = [];
        };
        for (let t = -reach; t <= reach; t += step) {
          const p = alongU ? toWorld(t, off) : toWorld(off, t);
          const ok =
            ownerOf(p.x, p.z) === zi &&
            onLand(p.x, p.z, 4) &&
            clearOfRiver(p.x, p.z, 4) &&
            !roadSegs.some((r) => pointSegDist(p.x, p.z, r.a, r.b) < r.w / 2 + base.street / 2) &&
            !occ.hits({ x0: p.x - 0.5, x1: p.x + 0.5, z0: p.z - 0.5, z1: p.z + 0.5 }, 0);
          if (ok) run.push({ x: p.x, y: 0, z: p.z });
          else flush();
        }
        flush();
      }
    };
    laterStreets.push(() => {
      emit(true);
      emit(false);
    });
  });
  for (const lay of laterStreets) lay();

  return { buildings, streets, parks, landmarks };
}
