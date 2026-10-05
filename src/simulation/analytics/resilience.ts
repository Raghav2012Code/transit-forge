// Network resilience analytics: transparent scores, structural criticality,
// and redundancy — all deterministic, all from real network + sim state.
import type {
  CityData,
  Incident,
  ResilienceMetrics,
  Station,
  TransportRoute,
} from '../../types/index.ts';
import type { Connection } from '../../types/index.ts';
import type { RoadGraph } from '../traffic/roadGraph.ts';
import { findShortestPath } from '../transport/graph.ts';
import { findRoadPath } from '../traffic/roadGraph.ts';
import { ZONE_ACCESS } from '../passengers/demand.ts';

export interface CapacityLost {
  stationsClosed: number;
  routeKmLost: number;
  roadKmLost: number;
  transitCapLost: number;
  roadCapLost: number;
}

/** Capacity taken offline by one incident (for results + live display). */
export function capacityLostFor(
  inc: {
    kind: Incident['kind'];
    targetRouteId?: string;
    durationMin: number;
    edgeIds?: string[];
    segFrom?: string;
    segTo?: string;
  },
  routes: TransportRoute[],
  routeLengths: Map<string, number>,
  roadGraph: RoadGraph,
  routeCumDist?: Map<string, number[]>,
): CapacityLost {
  const out: CapacityLost = { stationsClosed: 0, routeKmLost: 0, roadKmLost: 0, transitCapLost: 0, roadCapLost: 0 };
  const byId = new Map(routes.map((r) => [r.id, r]));
  const hours = Math.max(0, inc.durationMin) / 60;
  if (inc.kind === 'station-closure') {
    out.stationsClosed = 1;
  } else if ((inc.kind === 'segment-closure' || inc.kind === 'route-suspension') && inc.targetRouteId) {
    const r = byId.get(inc.targetRouteId);
    if (r) {
      const fullKm = (routeLengths.get(r.id) ?? 0) / 1000;
      // A segment-closure only takes a sub-span of the route offline; the
      // rest keeps serving riders. Scale the lost km/capacity to that span
      // instead of reporting the whole route as lost (route-suspension
      // genuinely loses the whole route, so this stays at fullKm for it).
      let affectedKm = fullKm;
      if (inc.kind === 'segment-closure' && inc.segFrom && inc.segTo) {
        const cum = routeCumDist?.get(r.id);
        const lo = r.stationIds.indexOf(inc.segFrom);
        const hi = r.stationIds.indexOf(inc.segTo);
        if (cum && lo >= 0 && hi >= 0 && lo !== hi) {
          const [a, b] = lo < hi ? [lo, hi] : [hi, lo];
          const segKm = (cum[b] - cum[a]) / 1000;
          affectedKm = Math.min(fullKm, Math.max(0, segKm));
        }
      }
      out.routeKmLost = Math.round(affectedKm * 10) / 10;
      const shareOfRoute = fullKm > 0 ? affectedKm / fullKm : 1;
      out.transitCapLost = Math.round(hourlyCapacity(r) * hours * shareOfRoute);
    }
  } else if (inc.kind === 'reduced-service' || inc.kind === 'major-delay') {
    const r = inc.targetRouteId ? byId.get(inc.targetRouteId) : undefined;
    if (r) out.transitCapLost = Math.round(hourlyCapacity(r) * hours * 0.5);
  }
  for (const e of inc.edgeIds ?? []) {
    const edge = roadGraph.edgeById.get(e);
    if (!edge) continue;
    out.roadKmLost = Math.round((out.roadKmLost + edge.lengthM / 1000) * 10) / 10;
    out.roadCapLost += Math.round((roadGraph.capacityPerHr.get(e) ?? 0) * hours);
  }
  return out;
}

function hourlyCapacity(r: TransportRoute): number {
  // Capacity per hour implied by the route's own headway (documented approx).
  return Math.round((60 / Math.max(1, r.headwayMin)) * r.vehicleCapacity);
}

/**
 * Transparent resilience score. Formula (planning-game metric, not science):
 *   100 − delay penalty (≤35) − stranding penalty (≤20)
 *       − capacity penalty (≤25) − recovery penalty (≤20)
 */
export function resilienceScore(input: {
  extraWaitMin: number;
  completedDelta: number;
  strandedPeak: number;
  affectedPax: number;
  routeKmLost: number;
  totalRouteKm: number;
  roadKmLost: number;
  totalRoadKm: number;
  recoveryTicks: number;
}): ResilienceMetrics {
  const avgExtraWait = input.extraWaitMin / Math.max(1, input.completedDelta);
  const delayPenalty = Math.min(35, avgExtraWait * 10);
  const strandShare = input.strandedPeak / Math.max(1, input.affectedPax);
  const strandPenalty = Math.min(20, strandShare * 20 + Math.min(10, input.strandedPeak * 0.2));
  const routeShare = input.totalRouteKm > 0 ? input.routeKmLost / input.totalRouteKm : 0;
  const roadShare = input.totalRoadKm > 0 ? input.roadKmLost / input.totalRoadKm : 0;
  const capPenalty = Math.min(25, (routeShare + roadShare) * 50);
  const recPenalty = Math.min(20, input.recoveryTicks * 0.5);
  const parts = [
    { label: `passenger delay (avg +${avgExtraWait.toFixed(1)} min)`, penalty: Math.round(delayPenalty * 10) / 10 },
    { label: `stranding (${input.strandedPeak} peak)`, penalty: Math.round(strandPenalty * 10) / 10 },
    { label: 'capacity offline', penalty: Math.round(capPenalty * 10) / 10 },
    { label: `recovery (${input.recoveryTicks} min)`, penalty: Math.round(recPenalty * 10) / 10 },
  ];
  const score = Math.max(0, Math.round((100 - delayPenalty - strandPenalty - capPenalty - recPenalty) * 10) / 10);
  return {
    affectedPax: input.affectedPax,
    rerouted: 0,
    strandedPeak: input.strandedPeak,
    extraWaitMin: Math.round(input.extraWaitMin),
    cancelledTrips: 0,
    stationsClosed: 0,
    routeKmLost: input.routeKmLost,
    roadKmLost: input.roadKmLost,
    transitCapLost: 0,
    roadCapLost: 0,
    recoveryTicks: input.recoveryTicks,
    score,
    scoreParts: parts,
  };
}

export interface CriticalItem {
  kind: 'station' | 'route' | 'bridge';
  id: string;
  label: string;
  /** 0..100 structural dependency score. */
  score: number;
  reason: string;
}

/** Ranked critical links from OD-path dependency (no simulation needed). */
export function criticalityAnalysis(base: {
  zones: { id: string; name: string }[];
  stations: Station[];
  connections: Connection[];
  routes: TransportRoute[];
  roadGraph: RoadGraph;
  zoneRoadAccess: Record<string, string>;
  city: CityData;
}): CriticalItem[] {
  const stationUse = new Map<string, number>();
  const routeUse = new Map<string, number>();
  const bridgeUse = new Map<string, number>();
  let pairs = 0;
  const stationName = new Map(base.stations.map((s) => [s.id, s.name]));
  for (const zo of base.zones) {
    for (const zd of base.zones) {
      if (zo.id === zd.id) continue;
      const from = ZONE_ACCESS[zo.id] ?? '';
      const to = ZONE_ACCESS[zd.id] ?? '';
      if (!from || !to || from === to) continue;
      const path = findShortestPath(base.connections, from, to);
      if (path) {
        pairs++;
        for (const s of new Set(path.stationIds)) stationUse.set(s, (stationUse.get(s) ?? 0) + 1);
        for (const r of new Set(path.routeIds.filter((x): x is string => x !== null))) {
          routeUse.set(r, (routeUse.get(r) ?? 0) + 1);
        }
      }
      const rn = base.zoneRoadAccess[zo.id];
      const rm = base.zoneRoadAccess[zd.id];
      if (rn && rm && rn !== rm) {
        const rp = findRoadPath(base.roadGraph, rn, rm, (id) => base.roadGraph.freeMin.get(id) ?? 1);
        if (rp) {
          for (const e of rp.edgeIds) {
            if (base.roadGraph.edgeById.get(e)?.isBridge) bridgeUse.set(e, (bridgeUse.get(e) ?? 0) + 1);
          }
        }
      }
    }
  }
  const items: CriticalItem[] = [];
  const stationEntries = [...stationUse.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
  for (const [id, n] of stationEntries) {
    const st = base.stations.find((s) => s.id === id);
    const share = pairs > 0 ? (n / pairs) * 100 : 0;
    const alts = st?.routeIds.length ?? 0;
    items.push({
      kind: 'station',
      id,
      label: stationName.get(id) ?? id,
      score: Math.round(Math.min(100, share) * 10) / 10,
      reason: `${share.toFixed(0)}% of network trips depend on this interchange. ${alts <= 1 ? 'No alternative routes exist.' : `${alts} routes serve it.`}`,
    });
  }
  const routeEntries = [...routeUse.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  for (const [id, n] of routeEntries) {
    const r = base.routes.find((x) => x.id === id);
    const share = pairs > 0 ? (n / pairs) * 100 : 0;
    items.push({
      kind: 'route',
      id,
      label: r?.name ?? id,
      score: Math.round(Math.min(100, share) * 10) / 10,
      reason: `${share.toFixed(0)}% of network trips use this route.`,
    });
  }
  const bridgeEntries = [...bridgeUse.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  for (const [id, n] of bridgeEntries) {
    const e = base.roadGraph.edgeById.get(id);
    const share = pairs > 0 ? (n / pairs) * 100 : 0;
    items.push({
      kind: 'bridge',
      id,
      label: e ? `Bridge ${e.a.replace(/^rn-/, '').toUpperCase()}–${e.b.replace(/^rn-/, '').toUpperCase()}` : id,
      score: Math.round(Math.min(100, share) * 10) / 10,
      reason: 'Major road traffic diversion occurs when closed.',
    });
  }
  return items.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

export interface Redundancy {
  level: 'High' | 'Medium' | 'Low';
  lines: string[];
}

/** Alternatives available for a station, route, or road edge. */
export function redundancyFor(
  kind: 'station' | 'route' | 'bridge',
  id: string,
  base: {
    stations: Station[];
    routes: TransportRoute[];
    connections: Connection[];
    roadGraph: RoadGraph;
    city: CityData;
  },
): Redundancy {
  if (kind === 'station') {
    const st = base.stations.find((s) => s.id === id);
    if (!st) return { level: 'Low', lines: ['Unknown station.'] };
    const metro = st.routeIds.filter((r) => base.routes.find((x) => x.id === r)?.mode === 'metro').length;
    const bus = st.routeIds.filter((r) => base.routes.find((x) => x.id === r)?.mode === 'bus').length;
    const nearby = base.stations.filter((s) => s.id !== id && Math.hypot(s.pos.x - st.pos.x, s.pos.z - st.pos.z) < 600).length;
    const nodeById = new Map(base.city.roadNodes.map((n) => [n.id, n.pos]));
    let roadAlts = 0;
    for (const e of base.roadGraph.edges) {
      const a = nodeById.get(e.a);
      const b = nodeById.get(e.b);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (Math.hypot(mx - st.pos.x, mz - st.pos.z) < 400) roadAlts++;
    }
    const score = metro * 2 + bus + Math.min(2, nearby) + Math.min(2, roadAlts);
    return {
      level: score >= 5 ? 'High' : score >= 3 ? 'Medium' : 'Low',
      lines: [
        `Alternative metro routes: ${metro}`,
        `Bus alternatives: ${bus}`,
        `Nearby stations: ${nearby}`,
        `Road alternatives: ${roadAlts}`,
      ],
    };
  }
  if (kind === 'route') {
    const r = base.routes.find((x) => x.id === id);
    if (!r) return { level: 'Low', lines: ['Unknown route.'] };
    const parallel = base.routes.filter(
      (x) => x.id !== id && x.stationIds.filter((s) => r.stationIds.includes(s)).length >= 2,
    ).length;
    const rapid = base.routes.filter(
      (x) => x.id !== id && (x.mode === 'metro' || x.mode === 'rail') &&
        x.stationIds.some((s) => r.stationIds.includes(s)),
    ).length;
    const score = parallel * 2 + rapid;
    return {
      level: score >= 3 ? 'High' : score >= 1 ? 'Medium' : 'Low',
      lines: [
        `Parallel routes (≥2 shared stations): ${parallel}`,
        `Alternative rapid transit: ${rapid}`,
      ],
    };
  }
  const e = base.roadGraph.edgeById.get(id);
  if (!e) return { level: 'Low', lines: ['Unknown road.'] };
  const alt = findRoadPath(base.roadGraph, e.a, e.b, (x) => (x === id ? Infinity : (base.roadGraph.freeMin.get(x) ?? 1)));
  const bridges = base.roadGraph.edges.filter((x) => x.isBridge && x.id !== id).length;
  return {
    level: alt ? (bridges > 0 ? 'High' : 'Medium') : 'Low',
    lines: [
      alt ? `Alternative road route exists (+${alt.totalMin.toFixed(1)} min free-flow).` : 'No alternative road route.',
      `Other river crossings: ${bridges}`,
    ],
  };
}
