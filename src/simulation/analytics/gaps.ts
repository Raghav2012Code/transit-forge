// "Where should I build?" — grid-based transit-gap candidates.
// Scores combine local population, station distance, and CBD travel time.
// Deterministic: fixed grid order, Dijkstra ties break deterministically.
import type { Connection, Station, TransportRoute, Zone } from '../../types/index.ts';
import { planTrip, walkMin } from '../passengers/passengers.ts';

export interface GapCandidate {
  x: number;
  z: number;
  zoneName: string;
  population: number;
  nearestStationM: number;
  nearestRapidM: number;
  cbdMin: number | null;
  score: number;
  reasons: string[];
}

export interface GapInput {
  zones: Zone[];
  stations: Station[];
  connections: Connection[];
  routes: TransportRoute[];
}

const WATER_X = -300;
const RIVER_X = 120;
const RIVER_HALF = 30;

export function findTransitGaps(input: GapInput, cellM = 60, top = 8): GapCandidate[] {
  const { zones, stations, connections, routes } = input;
  const headway = new Map(routes.map((r) => [r.id, r.headwayMin]));
  const rapid = new Set(stations.filter((s) => s.modes.includes('metro') || s.modes.includes('rail')).map((s) => s.id));
  const cbd = zones.find((z) => z.kind === 'cbd');
  const cbdAccess = cbd ? nearestStationTo(cbd.center.x, cbd.center.z, stations) : null;

  const xs: number[] = [];
  for (let x = -450; x <= 600; x += cellM) xs.push(x);
  const zs: number[] = [];
  for (let z = -450; z <= 450; z += cellM) zs.push(z);

  const cells: GapCandidate[] = [];
  for (const z of zs) {
    for (const x of xs) {
      if (x < WATER_X || Math.abs(x - RIVER_X) < RIVER_HALF) continue;
      const zone = zones.find((zn) => Math.hypot(zn.center.x - x, zn.center.z - z) <= zn.radius);
      if (!zone) continue;
      const area = Math.PI * zone.radius * zone.radius;
      const population = Math.round((zone.population / Math.max(1, area)) * cellM * cellM);
      const near = nearestStationTo(x, z, stations);
      if (!near) continue;
      let nearRapid = Infinity;
      for (const s of stations) {
        if (!rapid.has(s.id)) continue;
        nearRapid = Math.min(nearRapid, Math.hypot(s.pos.x - x, s.pos.z - z));
      }
      let cbdMin: number | null = null;
      if (cbdAccess && cbd) {
        const trip = planTrip(connections, near.id, cbdAccess.id);
        if (trip) {
          let wait = 0;
          const seen = new Set<string>();
          for (const leg of trip.legs) {
            if (!seen.has(leg.routeId)) {
              seen.add(leg.routeId);
              wait += (headway.get(leg.routeId) ?? 10) / 2;
            }
          }
          cbdMin = walkMin(x, z, near.pos.x, near.pos.z) + trip.totalMin + wait;
        }
      }
      cells.push({ x, z, zoneName: zone.name, population, nearestStationM: 0, nearestRapidM: 0, cbdMin, score: 0, reasons: [] });
      const cell = cells[cells.length - 1];
      cell.nearestStationM = Math.round(Math.hypot(near.pos.x - x, near.pos.z - z));
      cell.nearestRapidM = Number.isFinite(nearRapid) ? Math.round(nearRapid) : -1;
    }
  }

  const maxPop = Math.max(1, ...cells.map((c) => c.population));
  for (const c of cells) {
    const popN = c.population / maxPop;
    const distN = Math.min(1, c.nearestStationM / 1500);
    const timeN = c.cbdMin === null ? 1 : Math.min(1, c.cbdMin / 45);
    c.score = Math.round((0.5 * popN + 0.3 * distN + 0.2 * timeN) * 1000) / 10;
    if (popN > 0.5) c.reasons.push('High population');
    if (c.cbdMin === null) c.reasons.push('No transit path to CBD');
    else if (c.cbdMin > 30) c.reasons.push('Poor CBD accessibility');
    if (c.nearestRapidM < 0 || c.nearestRapidM > 1200) c.reasons.push('No rapid transit');
    if (c.nearestStationM > 800) c.reasons.push('Low station coverage');
    if (c.reasons.length === 0) c.reasons.push('Moderate gap');
  }
  return cells.sort((a, b) => b.score - a.score).slice(0, top);
}

function nearestStationTo(x: number, z: number, stations: Station[]): Station | null {
  let best: Station | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.pos.x - x, s.pos.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
