// Private-vehicle traffic: car trips over the road graph, BPR congestion,
// and the bus interaction (route-level slowdown factors, plain data).
import type {
  CarTrip,
  CityData,
  RoadCounters,
  RoadEdgeState,
  TransportRoute,
  TripPurpose,
  VehicleState,
  Zone,
} from '../../types/index.ts';
import { purposeOf } from '../passengers/demand.ts';
import { bprRatio, congestionLevel } from './bpr.ts';
import { findRoadPath, nearestRoadNode, edgeName, type RoadGraph } from './roadGraph.ts';
import type { DerivedClosures } from '../incidents/incidents.ts';

export interface TrafficWorld {
  timeMinutes: number;
  city: CityData;
  roadGraph: RoadGraph;
  edgeState: Record<string, RoadEdgeState>;
  cars: CarTrip[];
  nextCarId: number;
  roadCounters: RoadCounters;
  zoneRoadAccess: Record<string, string>;
  busRoadMap: Record<string, string[]>;
  roadCache: Map<string, { edgeIds: string[]; nodes: string[]; totalMin: number; computedAt: number }>;
  busRouteCongestion: Record<string, number>;
  routes: TransportRoute[];
  vehicles: VehicleState[];
  closures: DerivedClosures;
}

export const ROUTE_CACHE_MIN = 30;
const MAX_CARS = 6000;

export function emptyRoadCounters(): RoadCounters {
  return { generated: 0, completed: 0, totalTravelMin: 0, busDelayMin: 0, maxVC: 0, maxVCEdge: '', abandonedCars: 0 };
}

export function buildEdgeStates(graph: RoadGraph): Record<string, RoadEdgeState> {
  const out: Record<string, RoadEdgeState> = {};
  for (const e of graph.edges) {
    out[e.id] = { id: e.id, load: 0, currentMin: graph.freeMin.get(e.id) ?? 1, vc: 0, level: 'free', closed: false, capMult: 1 };
  }
  return out;
}

export function buildZoneRoadAccess(city: CityData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const z of city.zones) out[z.id] = nearestRoadNode(city, z.center.x, z.center.z);
  return out;
}

/** Map each bus route to the road edges its hops run along (nearest by midpoint). */
export function buildBusRoadMap(
  routes: TransportRoute[],
  stationPos: Map<string, { x: number; z: number }>,
  graph: RoadGraph,
  city: CityData,
): Record<string, string[]> {
  const nodeById = new Map(city.roadNodes.map((n) => [n.id, n.pos]));
  const mid = new Map<string, { x: number; z: number }>();
  for (const e of graph.edges) {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (a && b) mid.set(e.id, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }
  const out: Record<string, string[]> = {};
  for (const r of routes) {
    if (r.mode !== 'bus') continue;
    const ids: string[] = [];
    for (let i = 0; i < r.stationIds.length - 1; i++) {
      const a = stationPos.get(r.stationIds[i]);
      const b = stationPos.get(r.stationIds[i + 1]);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      let best = '';
      let bestD = Infinity;
      for (const [id, m] of mid) {
        const d = Math.hypot(m.x - mx, m.z - mz);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      if (best) ids.push(best);
    }
    out[r.id] = ids;
  }
  return out;
}

/** Background (non-simulated) demand: through-traffic with AM/PM peaks. */
export function baseVC(edgeId: string, timeMin: number, graph: RoadGraph): number {
  const h = timeMin / 60;
  const am = Math.exp(-Math.pow(h - 8.2, 2) / (2 * 1.1 * 1.1));
  const pm = Math.exp(-Math.pow(h - 17.6, 2) / (2 * 1.2 * 1.2));
  const e = graph.edgeById.get(edgeId);
  const arterial = e?.isArterial === true ? 0.08 : 0;
  return Math.min(0.9, 0.22 + 0.62 * Math.max(am, pm) + arterial);
}

/** Recompute every edge's travel time from background + simulated load. */
export function refreshEdges(w: TrafficWorld): void {
  let maxVC = 0;
  let maxEdge = '';
  for (const e of w.roadGraph.edges) {
    const st = w.edgeState[e.id];
    const closed = w.closures.closedEdges.has(e.id);
    const mult = closed ? 0 : (w.closures.edgeCapMult.get(e.id) ?? 1);
    st.closed = closed;
    st.capMult = mult;
    const cap = (w.roadGraph.capacityPerHr.get(e.id) ?? 1) * mult;
    const free = w.roadGraph.freeMin.get(e.id) ?? 1;
    if (closed || cap <= 0) {
      st.vc = 99;
      st.currentMin = free * 10;
      st.level = 'severe';
    } else {
      const storage = Math.max(1, (cap * free) / 60);
      const vc = baseVC(e.id, w.timeMinutes, w.roadGraph) + st.load / storage;
      st.vc = vc;
      st.currentMin = free * bprRatio(vc);
      st.level = congestionLevel(vc);
    }
    if (st.vc > maxVC && st.vc < 90) {
      maxVC = st.vc;
      maxEdge = e.id;
    }
  }
  if (maxVC > w.roadCounters.maxVC) {
    w.roadCounters.maxVC = maxVC;
    w.roadCounters.maxVCEdge = maxEdge;
  }
}

function cacheKey(a: string, b: string): string {
  return `${a}>${b}`;
}

/** Congested road path with TTL cache (free-flow cached permanently). */
export function cachedRoadPath(
  w: TrafficWorld,
  fromNode: string,
  toNode: string,
  congested: boolean,
): { edgeIds: string[]; nodes: string[]; totalMin: number } | null {
  const key = `${congested ? 'c' : 'f'}:${cacheKey(fromNode, toNode)}`;
  const hit = w.roadCache.get(key);
  if (hit && (hit.computedAt < 0 || w.timeMinutes - hit.computedAt < ROUTE_CACHE_MIN)) {
    return hit;
  }
  const blocked = (id: string) => w.edgeState[id]?.closed === true;
  const cost = congested
    ? (id: string) => (blocked(id) ? Infinity : (w.edgeState[id]?.currentMin ?? 1))
    : (id: string) => (blocked(id) ? Infinity : (w.roadGraph.freeMin.get(id) ?? 1));
  const path = findRoadPath(w.roadGraph, fromNode, toNode, cost);
  if (!path) return null;
  const entry = {
    edgeIds: path.edgeIds,
    nodes: path.nodes,
    totalMin: path.totalMin,
    computedAt: congested ? w.timeMinutes : -1,
  };
  w.roadCache.set(key, entry);
  return entry;
}

/** Drive access/egress minutes: zone center to access node at 30 kph. */
export function driveAccessMin(
  city: CityData,
  oZone: Zone,
  dZone: Zone,
  access: Record<string, string>,
): number {
  const nodeById = new Map(city.roadNodes.map((n) => [n.id, n.pos]));
  const a = nodeById.get(access[oZone.id] ?? '');
  const b = nodeById.get(access[dZone.id] ?? '');
  const d1 = a ? Math.hypot(a.x - oZone.center.x, a.z - oZone.center.z) : 500;
  const d2 = b ? Math.hypot(b.x - dZone.center.x, b.z - dZone.center.z) : 500;
  return ((d1 + d2) / 1000 / 30) * 60;
}

/** Create a car trip; returns false when the road cannot serve it. */
export function spawnCarTrip(
  w: TrafficWorld,
  oZone: Zone,
  dZone: Zone,
  accessDriveMin: number,
  purpose?: TripPurpose,
): boolean {
  const fromNode = w.zoneRoadAccess[oZone.id];
  const toNode = w.zoneRoadAccess[dZone.id];
  if (!fromNode || !toNode) return false;
  const path = cachedRoadPath(w, fromNode, toNode, true);
  if (!path || path.edgeIds.length === 0) return false;
  if (w.cars.length >= MAX_CARS) return false;
  const first = w.edgeState[path.edgeIds[0]];
  if (first) first.load++;
  w.cars.push({
    id: w.nextCarId++,
    originZone: oZone.id,
    destZone: dZone.id,
    purpose: purpose ?? purposeOf(oZone.kind, dZone.kind),
    departMin: w.timeMinutes,
    state: 'DRIVING',
    edgeIds: path.edgeIds,
    nodes: path.nodes,
    edgeIndex: 0,
    s: 0,
    arriveMin: null,
    travelMin: accessDriveMin,
    heldTicks: 0,
  });
  w.roadCounters.generated++;
  return true;
}

/** Move cars, refresh congestion, and publish bus slowdown factors. */
export function advanceTraffic(w: TrafficWorld, dtMin: number): void {
  refreshEdges(w);
  const graph = w.roadGraph;
  const blockedCost = (id: string) =>
    w.edgeState[id]?.closed ? Infinity : (w.edgeState[id]?.currentMin ?? 1);
  for (const car of w.cars) {
    if (car.state !== 'DRIVING') continue;
    // Reroute around closures (deterministic: same network, same result).
    const curEdge = car.edgeIds[car.edgeIndex];
    if (curEdge && w.edgeState[curEdge]?.closed) {
      const fromNode = car.nodes[car.edgeIndex] ?? '';
      const destNode = car.nodes[car.nodes.length - 1] ?? '';
      const alt = fromNode && destNode ? findRoadPath(graph, fromNode, destNode, blockedCost) : null;
      if (alt && alt.edgeIds.length > 0 && !alt.edgeIds.every((e) => w.edgeState[e]?.closed)) {
        const old = w.edgeState[curEdge];
        if (old) old.load = Math.max(0, old.load - 1);
        car.edgeIds = alt.edgeIds;
        car.nodes = alt.nodes;
        car.edgeIndex = 0;
        car.s = 0;
        car.heldTicks = 0;
        const first = w.edgeState[car.edgeIds[0]];
        if (first) first.load++;
      } else {
        // Nowhere to go: hold (load stays counted) and retry next tick.
        car.heldTicks = (car.heldTicks ?? 0) + 1;
        if (car.heldTicks > 120) {
          const old = w.edgeState[curEdge];
          if (old) old.load = Math.max(0, old.load - 1);
          car.state = 'DONE';
          car.arriveMin = w.timeMinutes;
          w.roadCounters.abandonedCars++;
        }
        continue;
      }
    }
    let remaining = dtMin;
    while (remaining > 0 && car.state === 'DRIVING') {
      const edgeId = car.edgeIds[car.edgeIndex];
      const edge = graph.edgeById.get(edgeId);
      const st = w.edgeState[edgeId];
      if (!edge || !st) break;
      const speedMpm = edge.lengthM / Math.max(0.05, st.currentMin);
      const left = edge.lengthM - car.s;
      const step = speedMpm * remaining;
      if (step < left) {
        car.s += step;
        remaining = 0;
      } else {
        remaining -= left / Math.max(1, speedMpm);
        st.load = Math.max(0, st.load - 1);
        car.edgeIndex++;
        car.s = 0;
        if (car.edgeIndex >= car.edgeIds.length) {
          car.state = 'DONE';
          car.arriveMin = w.timeMinutes;
          car.travelMin += w.timeMinutes - car.departMin;
          w.roadCounters.completed++;
          w.roadCounters.totalTravelMin += car.travelMin;
        } else {
          const next = w.edgeState[car.edgeIds[car.edgeIndex]];
          if (next) next.load++;
        }
      }
    }
  }
  if (w.cars.some((c) => c.state === 'DONE')) {
    w.cars = w.cars.filter((c) => c.state !== 'DONE');
  }

  // Bus interaction: per-route slowdown from mapped road edges (plain data).
  for (const routeId in w.busRoadMap) {
    const ids = w.busRoadMap[routeId];
    let ratio = 1;
    if (ids.length > 0) {
      let num = 0;
      let den = 0;
      for (const id of ids) {
        const free = graph.freeMin.get(id) ?? 1;
        const cur = w.edgeState[id]?.currentMin ?? free;
        num += cur;
        den += free;
      }
      ratio = Math.max(1, num / Math.max(0.01, den));
    }
    w.busRouteCongestion[routeId] = ratio;
  }
  const busVeh = w.vehicles.filter((vv) => vv.routeId in w.busRoadMap).length;
  const avgSlow = Object.values(w.busRouteCongestion).reduce((s, x) => s + x, 0) /
    Math.max(1, Object.keys(w.busRoadMap).length);
  w.roadCounters.busDelayMin += Math.max(0, avgSlow - 1) * busVeh * dtMin;
}

export function edgeDisplayName(w: TrafficWorld, edgeId: string): string {
  const e = w.roadGraph.edgeById.get(edgeId);
  return e ? edgeName(e) : edgeId;
}
