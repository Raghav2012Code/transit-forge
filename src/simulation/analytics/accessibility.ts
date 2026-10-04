// City-wide public transport accessibility from actual routing.
// Per zone: door-to-door times to major destinations, reachability counts,
// and a documented 0-100 score. Pure + deterministic.
import type { Connection, Station, TransportRoute, Zone } from '../../types/index.ts';
import { planTrip, walkMin } from '../passengers/passengers.ts';

export type AccessGrade = 'excellent' | 'good' | 'moderate' | 'poor' | 'very poor';

export interface ZoneAccess {
  zoneId: string;
  zoneName: string;
  accessStation: string | null;
  walkMin: number;
  toCBD: number | null;
  toUniv: number | null;
  toAirport: number | null;
  toIndustrial: number | null;
  toHarbor: number | null;
  avgToMajors: number | null;
  reach15: number;
  reach30: number;
  reach45: number;
  score: number;
  grade: AccessGrade;
}

export interface AccessibilitySet {
  zones: ZoneAccess[];
  /** Population-weighted mean score. */
  cityScore: number;
}

export const MAJOR_KINDS = ['cbd', 'university', 'airport', 'industrial', 'harbor'] as const;

function nearestStation(zones: Zone, stations: Station[]): { id: string | null; walk: number } {
  let best: string | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.pos.x - zones.center.x, s.pos.z - zones.center.z);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  if (!best) return { id: null, walk: Infinity };
  const st = stations.find((s) => s.id === best);
  const walk = st ? walkMin(zones.center.x, zones.center.z, st.pos.x, st.pos.z) : Infinity;
  return { id: best, walk };
}

export function gradeFor(score: number): AccessGrade {
  if (score >= 75) return 'excellent';
  if (score >= 55) return 'good';
  if (score >= 38) return 'moderate';
  if (score >= 20) return 'poor';
  return 'very poor';
}

export interface AccessInput {
  zones: Zone[];
  stations: Station[];
  connections: Connection[];
  routes: TransportRoute[];
  /** Experienced headways (e.g. from service plans); defaults to scheduled. */
  headways?: Record<string, number>;
}

export function computeAccessibility(input: AccessInput): AccessibilitySet {
  const { zones, stations, connections, routes } = input;
  const headway = new Map(routes.map((r) => [r.id, input.headways?.[r.id] ?? r.headwayMin]));
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const majorZones = MAJOR_KINDS.map((k) => zones.find((z) => z.kind === k)).filter((z) => z !== undefined);

  const out: ZoneAccess[] = zones.map((oz) => {
    const access = nearestStation(oz, stations);
    const times: (number | null)[] = majorZones.map((dz) => {
      if (!access.id || oz.id === dz.id) return oz.id === dz.id ? 0 : null;
      const az = stationById.get(access.id);
      const destAccess = nearestStation(dz, stations);
      if (!az || !destAccess.id) return null;
      const trip = planTrip(connections, access.id, destAccess.id);
      if (!trip) return null;
      const seen = new Set<string>();
      let wait = 0;
      for (const leg of trip.legs) {
        if (!seen.has(leg.routeId)) {
          seen.add(leg.routeId);
          wait += (headway.get(leg.routeId) ?? 10) / 2;
        }
      }
      const ds = stationById.get(destAccess.id);
      const egress = ds ? walkMin(ds.pos.x, ds.pos.z, dz.center.x, dz.center.z) : 0;
      return access.walk + trip.totalMin + wait + egress;
    });
    const [toCBD, toUniv, toAirport, toIndustrial, toHarbor] = [
      'cbd', 'university', 'airport', 'industrial', 'harbor',
    ].map((k) => {
      const i = majorZones.findIndex((z) => z.kind === k);
      return i >= 0 ? times[i] : null;
    });
    const reached = times.filter((t): t is number => t !== null);
    const avg = reached.length > 0 ? reached.reduce((s, t) => s + t, 0) / reached.length : null;
    const reach15 = reached.filter((t) => t <= 15).length;
    const reach30 = reached.filter((t) => t <= 30).length;
    const reach45 = reached.filter((t) => t <= 45).length;
    // Documented composite: 55% travel time, 35% reachability, 10% walk access.
    const timeScore = avg === null ? 0 : 100 * Math.max(0, 1 - avg / 60);
    const reachScore = majorZones.length > 0
      ? Math.min(100, ((reach15 + reach30 * 0.6 + reach45 * 0.3) / majorZones.length) * 100)
      : 0;
    const walkScore = Number.isFinite(access.walk) ? 100 * Math.max(0, 1 - access.walk / 20) : 0;
    const score = Math.round((0.55 * timeScore + 0.35 * reachScore + 0.1 * walkScore) * 10) / 10;
    return {
      zoneId: oz.id,
      zoneName: oz.name,
      accessStation: access.id,
      walkMin: Number.isFinite(access.walk) ? Math.round(access.walk * 10) / 10 : Infinity,
      toCBD, toUniv, toAirport, toIndustrial, toHarbor,
      avgToMajors: avg === null ? null : Math.round(avg * 10) / 10,
      reach15, reach30, reach45,
      score,
      grade: gradeFor(score),
    };
  });

  let popSum = 0;
  let weighted = 0;
  for (const oz of zones) {
    const za = out.find((z) => z.zoneId === oz.id);
    if (za) {
      popSum += oz.population;
      weighted += oz.population * za.score;
    }
  }
  return { zones: out, cityScore: popSum > 0 ? Math.round((weighted / popSum) * 10) / 10 : 0 };
}
