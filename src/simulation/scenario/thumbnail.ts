// Scenario thumbnails: a small transit plan of the city, drawn in the same
// language as the minimap — pale plate, water as context, arterial roads as a
// hint, and then the lines and stations as the subject — using the same --mm-*
// custom properties, so a card agrees with the map it previews and follows the
// theme without being recomputed.
//
// Water stays quiet on purpose: colour in this product means a line or a
// condition, so the sea and the river are a wash under the linework, never the
// loudest thing in the figure.
//
// Pure and deterministic: the same network always yields the same string.
import { RIVER_HALF_M } from '../city/geography.ts';
import type { CityData, Station, TransportRoute, Vec3 } from '../../types/index.ts';

export interface ThumbnailInput {
  /** The city as drawn: its shoreline, its river and its arterial road grid. */
  city: Pick<CityData, 'coast' | 'river' | 'roadEdges' | 'roadNodes'>;
  stations: Station[];
  routes: TransportRoute[];
}

const W = 232;
/** Close to the built city's own proportions (about 4.1 km by 3 km), so the
 *  plan fills the figure instead of sitting in a letterbox. */
const H = 166;
/** Breathing room around the content, as a fraction of the longer axis. */
const PAD = 0.05;
/** Water is context, not a subject: a wash under the lines. */
const WATER_OPACITY = 0.35;

interface Frame {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fit the city to the plate without distortion: take the extent of everything
 * drawn, then grow the shorter axis until it matches the plate's aspect.
 */
function frameOf(input: ThumbnailInput): Frame {
  const xs: number[] = [];
  const zs: number[] = [];
  // The shoreline sets the western edge; the built city sets the rest. The
  // coast runs far past the city to the north and south, so only its x counts.
  for (const p of input.city.coast) xs.push(p.x);
  for (const p of input.city.roadNodes) {
    xs.push(p.pos.x);
    zs.push(p.pos.z);
  }
  for (const s of input.stations) {
    xs.push(s.pos.x);
    zs.push(s.pos.z);
  }
  if (xs.length === 0 || zs.length === 0) {
    return { minX: -W / 2, maxX: W / 2, minZ: -H / 2, maxZ: H / 2 };
  }
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const halfX = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2);
  const halfZ = Math.max(1, (Math.max(...zs) - Math.min(...zs)) / 2);
  const half = Math.max(halfX, halfZ * (W / H)) * (1 + PAD * 2);
  const halfV = half * (H / W);
  return { minX: cx - half, maxX: cx + half, minZ: cz - halfV, maxZ: cz + halfV };
}

/** The sea: follow the shoreline, then close around the western edge. */
function seaPolygon(coast: Vec3[], f: Frame): string {
  if (coast.length < 2) return '';
  const px = (x: number) => round1(((x - f.minX) / (f.maxX - f.minX)) * W);
  const pz = (z: number) => round1(((z - f.minZ) / (f.maxZ - f.minZ)) * H);
  const along = coast.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ');
  const first = coast[0];
  const last = coast[coast.length - 1];
  return `${along} ${round1(0)},${pz(last.z)} ${round1(0)},${pz(first.z)}`;
}

/** Render a top-down plan of the city, for a scenario card or a page figure. */
export function networkThumbnail(input: ThumbnailInput): string {
  const f = frameOf(input);
  const px = (x: number) => round1(((x - f.minX) / (f.maxX - f.minX)) * W);
  const pz = (z: number) => round1(((z - f.minZ) / (f.maxZ - f.minZ)) * H);
  const metresPerUnit = (f.maxX - f.minX) / W;
  const nodeById = new Map(input.city.roadNodes.map((n) => [n.id, n.pos]));
  const stationById = new Map(input.stations.map((s) => [s.id, s]));

  const sea = seaPolygon(input.city.coast, f);
  const river = input.city.river
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${pz(p.z)}`)
    .join(' ');
  const roads = input.city.roadEdges
    .map((e) => {
      const a = nodeById.get(e.a);
      const b = nodeById.get(e.b);
      if (!a || !b) return '';
      return `<line x1="${px(a.x)}" y1="${pz(a.z)}" x2="${px(b.x)}" y2="${pz(b.z)}" vector-effect="non-scaling-stroke" stroke="var(--mm-${e.isArterial ? 'arterial' : 'road'})" stroke-width="${e.isArterial ? 1.2 : 0.9}"/>`;
    })
    .join('');
  const lines = input.routes
    .map((r) => {
      const d = r.stationIds
        .map((id) => stationById.get(id))
        .filter((s): s is Station => Boolean(s))
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${px(s.pos.x)},${pz(s.pos.z)}`)
        .join(' ');
      if (!d) return '';
      const w = r.mode === 'bus' ? 1.7 : 2.2;
      return `<path d="${d}" fill="none" vector-effect="non-scaling-stroke" stroke="${r.color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const dots = input.stations
    .map((s) => `<circle cx="${px(s.pos.x)}" cy="${pz(s.pos.z)}" r="1.9" fill="var(--mm-station)"/>`)
    .join('');

  // The river is drawn at its real width (130 m), so it reads as a channel at
  // any size; the linework keeps a constant width instead, so the plan stays
  // legible whether it is a 120px card or a 560px page figure.
  const riverWidth = round1((RIVER_HALF_M * 2) / metresPerUnit);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">` +
    `<rect width="${W}" height="${H}" fill="var(--plate)"/>` +
    (sea ? `<polygon points="${sea}" fill="var(--mm-river)" fill-opacity="${WATER_OPACITY}"/>` : '') +
    (river ? `<path d="${river}" fill="none" stroke="var(--mm-river)" stroke-opacity="${WATER_OPACITY}" stroke-width="${riverWidth}" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
    `<g stroke-opacity="0.55">${roads}</g>` +
    lines +
    dots +
    `</svg>`;
}
