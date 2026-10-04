// Deterministic scenario thumbnails: a simplified top-down SVG built from
// network data only. No canvas, no screenshots, no external assets — the same
// network always yields the same string, so cards and tests stay stable.
import type { Station, TransportRoute, Zone } from '../../types/index.ts';

export interface ThumbnailInput {
  stations: Station[];
  routes: TransportRoute[];
  zones: Zone[];
}

const W = 232;
const H = 120;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Render a top-down network thumbnail as an SVG string. */
export function networkThumbnail(input: ThumbnailInput): string {
  const pts: { x: number; z: number }[] = [];
  for (const z of input.zones) pts.push({ x: z.center.x, z: z.center.z });
  for (const s of input.stations) pts.push({ x: s.pos.x, z: s.pos.z });
  let minX = 0;
  let maxX = 1;
  let minZ = 0;
  let maxZ = 1;
  if (pts.length > 0) {
    minX = Math.min(...pts.map((p) => p.x));
    maxX = Math.max(...pts.map((p) => p.x));
    minZ = Math.min(...pts.map((p) => p.z));
    maxZ = Math.max(...pts.map((p) => p.z));
  }
  const padX = Math.max(20, (maxX - minX) * 0.08);
  const padZ = Math.max(20, (maxZ - minZ) * 0.08);
  minX -= padX;
  maxX += padX;
  minZ -= padZ;
  maxZ += padZ;
  const sx = (x: number) => round1(((x - minX) / Math.max(1, maxX - minX)) * W);
  const sz = (z: number) => round1(((z - minZ) / Math.max(1, maxZ - minZ)) * H);
  const byId = new Map(input.stations.map((s) => [s.id, s]));

  const zoneCircles = input.zones
    .map((z) => {
      const r = Math.max(2, round1(((z.radius / Math.max(1, maxX - minX)) * W + (z.radius / Math.max(1, maxZ - minZ)) * H) / 2));
      return `<circle cx="${sx(z.center.x)}" cy="${sz(z.center.z)}" r="${r}" fill="none" stroke="#33436e" stroke-width="1"/>`;
    })
    .join('');
  const routeLines = input.routes
    .map((r) => {
      const d = r.stationIds
        .map((id) => byId.get(id))
        .filter((s): s is Station => Boolean(s))
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${sx(s.pos.x)},${sz(s.pos.z)}`)
        .join(' ');
      if (!d) return '';
      const w = r.mode === 'bus' ? 1.5 : 2.5;
      return `<path d="${d}" fill="none" stroke="${r.color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const dots = input.stations
    .map((s) => `<circle cx="${sx(s.pos.x)}" cy="${sz(s.pos.z)}" r="1.8" fill="#dbe4ff"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">` +
    `<rect width="${W}" height="${H}" fill="#0b1020"/>${zoneCircles}${routeLines}${dots}</svg>`;
}
