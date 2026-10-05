// Disruptions: lifecycle, closure derivation, rerouting helpers, replacement
// services, presets. Everything is pure data + deterministic functions;
// SimulationState is mutated in place by the step pipeline like elsewhere.
import type {
  Connection,
  Incident,
  IncidentEvent,
  Station,
  TransportRoute,
} from '../../types/index.ts';
import { ZONE_ACCESS } from '../passengers/demand.ts';
import { findShortestPath } from '../transport/graph.ts';
import { findRoadPath, type RoadGraph } from '../traffic/roadGraph.ts';
import { defaultPlanFor } from '../service/servicePlan.ts';
import { capacityLostFor } from '../analytics/resilience.ts';
import type { SimulationState } from '../index.ts';

export type IncidentConfig = Omit<
  Incident,
  | 'status'
  | 'activeTicks'
  | 'baselineWaiting'
  | 'recovered90'
  | 'replacementRouteId'
  | 'snap'
  | 'result'
  | 'strandedPeakDuringIncident'
>;

export interface DerivedClosures {
  /** True while at least one incident is active. */
  active: boolean;
  closedStations: Set<string>;
  /** Directed hops `${routeId}|${fromStationId}>${toStationId}`. */
  closedHops: Set<string>;
  suspendedRoutes: Set<string>;
  /** Route headway multiplier while reduced-service is active. */
  headwayMult: Map<string, number>;
  /** Extra dwell minutes per stop while a major-delay is active. */
  stopDelayMin: Map<string, number>;
  closedEdges: Set<string>;
  /** Effective road capacity multiplier (0 = closed). */
  edgeCapMult: Map<string, number>;
}

export function emptyClosures(): DerivedClosures {
  return {
    active: false,
    closedStations: new Set(),
    closedHops: new Set(),
    suspendedRoutes: new Set(),
    headwayMult: new Map(),
    stopDelayMin: new Map(),
    closedEdges: new Set(),
    edgeCapMult: new Map(),
  };
}

export function hopKey(routeId: string, from: string, to: string): string {
  return `${routeId}|${from}>${to}`;
}

/** Directed hop keys covering a station span in both directions. Null when invalid. */
export function segmentHopKeys(stationIds: string[], routeId: string, fromId: string, toId: string): string[] | null {
  const a = stationIds.indexOf(fromId);
  const b = stationIds.indexOf(toId);
  if (a < 0 || b < 0 || a === b) return null;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const keys: string[] = [];
  for (let i = lo; i < hi; i++) {
    keys.push(hopKey(routeId, stationIds[i], stationIds[i + 1]));
    keys.push(hopKey(routeId, stationIds[i + 1], stationIds[i]));
  }
  return keys;
}

function routeById(routes: TransportRoute[]): Map<string, TransportRoute> {
  return new Map(routes.map((r) => [r.id, r]));
}

/** Effective closures from currently ACTIVE incidents (recovering = lifted). */
export function deriveClosures(incidents: Incident[], routes: TransportRoute[]): DerivedClosures {
  const c = emptyClosures();
  const byId = routeById(routes);
  for (const inc of incidents) {
    if (inc.status !== 'active') continue;
    c.active = true;
    switch (inc.kind) {
      case 'station-closure':
        if (inc.targetStationId) c.closedStations.add(inc.targetStationId);
        break;
      case 'segment-closure': {
        const r = inc.targetRouteId ? byId.get(inc.targetRouteId) : undefined;
        const keys = r && inc.segFrom && inc.segTo ? segmentHopKeys(r.stationIds, r.id, inc.segFrom, inc.segTo) : null;
        if (keys) for (const k of keys) c.closedHops.add(k);
        else if (inc.targetRouteId) c.suspendedRoutes.add(inc.targetRouteId);
        break;
      }
      case 'route-suspension':
        if (inc.targetRouteId) c.suspendedRoutes.add(inc.targetRouteId);
        break;
      case 'reduced-service':
        if (inc.targetRouteId) {
          const prev = c.headwayMult.get(inc.targetRouteId) ?? 1;
          c.headwayMult.set(inc.targetRouteId, Math.max(prev, inc.headwayMult ?? 2));
        }
        break;
      case 'major-delay':
        if (inc.targetRouteId) {
          const prev = c.stopDelayMin.get(inc.targetRouteId) ?? 0;
          c.stopDelayMin.set(inc.targetRouteId, Math.max(prev, inc.delayMin ?? 3));
        }
        break;
      case 'road-closure':
      case 'bridge-closure':
        for (const e of inc.edgeIds ?? []) {
          c.closedEdges.add(e);
          c.edgeCapMult.set(e, 0);
        }
        break;
      case 'road-capacity': {
        const mult = inc.capacityMult ?? 0.5;
        for (const e of inc.edgeIds ?? []) {
          c.closedEdges.delete(e);
          c.edgeCapMult.set(e, Math.min(c.edgeCapMult.get(e) ?? 1, mult));
        }
        break;
      }
    }
  }
  return c;
}

/** Signature of the active incident set; cache invalidation key. */
export function closureSignature(incidents: Incident[]): string {
  return incidents.map((i) => `${i.id}:${i.status}:${i.replacementRouteId ?? ''}`).join('|');
}

function totalWaiting(sim: SimulationState): number {
  let n = 0;
  for (const s of sim.stations) n += s.waiting;
  for (const p of sim.passengers) if (p.state === 'STRANDED') n += 1;
  return Math.round(n);
}

function strandedCount(sim: SimulationState): number {
  let n = 0;
  for (const p of sim.passengers) if (p.state === 'STRANDED') n++;
  return n;
}

function snapCounters(sim: SimulationState) {
  const c = sim.counters;
  return {
    rerouted: c.rerouted,
    completed: c.completed,
    totalWaitMin: c.totalWaitMin,
    cancelledTrips: c.cancelledTrips,
    strandedPeak: c.strandedPeak,
  };
}

/** Advance incident lifecycles by sim time. Returns timeline events. */
export function updateIncidentLifecycle(sim: SimulationState, _dtMin: number): IncidentEvent[] {
  const events: IncidentEvent[] = [];
  const t = sim.timeMinutes;
  for (const inc of sim.incidents) {
    if (inc.status === 'scheduled' && t >= inc.startMin) {
      inc.status = 'active';
      inc.activeTicks = 0;
      inc.baselineWaiting = totalWaiting(sim);
      inc.recovered90 = false;
      inc.snap = snapCounters(sim);
      inc.strandedPeakDuringIncident = strandedCount(sim);
      events.push({ t, text: `${inc.label} — disruption started`, level: 'warn' });
      if (inc.replacement) events.push(...deployReplacement(sim, inc));
    } else if (inc.status === 'active') {
      inc.activeTicks++;
      inc.strandedPeakDuringIncident = Math.max(inc.strandedPeakDuringIncident, strandedCount(sim));
      if (t >= inc.startMin + inc.durationMin) {
        inc.status = 'recovering';
        inc.activeTicks = 0;
        events.push({ t, text: `${inc.label} — service recovering`, level: 'info' });
      }
    } else if (inc.status === 'recovering') {
      inc.activeTicks++;
      inc.strandedPeakDuringIncident = Math.max(inc.strandedPeakDuringIncident, strandedCount(sim));
      const waiting = totalWaiting(sim);
      if (!inc.recovered90 && waiting <= inc.baselineWaiting * 1.1 + 5) {
        inc.recovered90 = true;
        events.push({ t, text: `${inc.label} — network back to 90% baseline`, level: 'good' });
      }
      if (t >= inc.startMin + inc.durationMin + inc.recoveryMin) {
        finalizeIncident(sim, inc, t);
        events.push({ t, text: `${inc.label} — resolved`, level: 'good' });
      }
    }
  }
  // Drop old resolved incidents (bounded history).
  const resolved = sim.incidents.filter((i) => i.status === 'resolved');
  if (resolved.length > 8) {
    const drop = new Set(resolved.slice(0, resolved.length - 8).map((i) => i.id));
    sim.incidents = sim.incidents.filter((i) => !drop.has(i.id));
  }
  return events;
}

function finalizeIncident(sim: SimulationState, inc: Incident, t: number): void {
  inc.status = 'resolved';
  const c = sim.counters;
  const s = inc.snap ?? { rerouted: 0, completed: 0, totalWaitMin: 0, cancelledTrips: 0, strandedPeak: 0 };
  const completedDelta = Math.max(1, c.completed - s.completed);
  const cap = capacityLostFor(inc, sim.routes, sim.routeLengths, sim.roadGraph, sim.routeCumDist);
  inc.result = {
    affectedPax: Math.max(0, c.rerouted - s.rerouted) + inc.strandedPeakDuringIncident,
    rerouted: Math.max(0, c.rerouted - s.rerouted),
    strandedPeak: inc.strandedPeakDuringIncident,
    extraWaitMin: Math.max(0, c.totalWaitMin - s.totalWaitMin),
    cancelledTrips: Math.max(0, c.cancelledTrips - s.cancelledTrips),
    completedDelta,
    recoveryTicks: inc.activeTicks,
    ...cap,
  };
  removeReplacement(sim, inc);
  void t;
}

/** True when a leg cannot be used under current closures. */
export function legBlocked(
  leg: { board: string; alight: string; routeId: string } | undefined,
  routeStationIds: string[] | undefined,
  closures: DerivedClosures,
): boolean {
  if (!leg || !leg.routeId) return true;
  if (!routeStationIds) return true; // route removed (e.g. replacement withdrawn)
  if (closures.suspendedRoutes.has(leg.routeId)) return true;
  if (closures.closedStations.has(leg.board) || closures.closedStations.has(leg.alight)) return true;
  const a = routeStationIds.indexOf(leg.board);
  const b = routeStationIds.indexOf(leg.alight);
  if (a < 0 || b < 0) return true;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let i = lo; i < hi; i++) {
    if (
      closures.closedHops.has(hopKey(leg.routeId, routeStationIds[i], routeStationIds[i + 1])) ||
      closures.closedHops.has(hopKey(leg.routeId, routeStationIds[i + 1], routeStationIds[i]))
    ) {
      return true;
    }
  }
  return false;
}

/** True when a leg can be boarded here: destination reachable in travel
 * direction without crossing a closure. Open network always boards (legacy). */
export function legBoardableFrom(
  leg: { board: string; alight: string; routeId: string },
  routeStationIds: string[],
  stationIdx: number,
  direction: 1 | -1,
  closures: DerivedClosures,
  loop = false,
): boolean {
  if (!closures.active) return true;
  if (closures.suspendedRoutes.has(leg.routeId)) return false;
  if (closures.closedStations.has(leg.board) || closures.closedStations.has(leg.alight)) return false;
  const n = routeStationIds.length;
  let i = stationIdx;
  for (let steps = 0; steps < n; steps++) {
    let j = i + direction;
    if (loop) j = ((j % n) + n) % n;
    if (j < 0 || j >= n) return false; // terminus reached without destination
    if (
      closures.closedHops.has(hopKey(leg.routeId, routeStationIds[i], routeStationIds[j])) ||
      closures.closedHops.has(hopKey(leg.routeId, routeStationIds[j], routeStationIds[i]))
    ) {
      return false;
    }
    if (routeStationIds[j] === leg.alight) return true;
    i = j;
  }
  return false;
}

/** True when the hop ahead of position s in travel direction is blocked. */
export function hopAheadBlocked(
  routeId: string,
  stationIds: string[],
  cum: number[],
  s: number,
  direction: 1 | -1,
  closures: DerivedClosures,
): boolean {
  if (closures.suspendedRoutes.has(routeId)) return true;
  const n = stationIds.length;
  if (n < 2) return true;
  if (direction > 0) {
    let i = 0;
    while (i < n - 1 && (cum[i + 1] ?? Infinity) <= s + 1e-6) i++;
    if (i >= n - 1) return false; // at/past terminus; turnaround handled elsewhere
    return closures.closedHops.has(hopKey(routeId, stationIds[i], stationIds[i + 1]));
  }
  let i = n - 1;
  while (i > 0 && (cum[i - 1] ?? -Infinity) >= s - 1e-6) i--;
  if (i <= 0) return false;
  return closures.closedHops.has(hopKey(routeId, stationIds[i], stationIds[i - 1]));
}

/** Nearest station index to a position along a route. */
export function nearestStationIdx(cum: number[], s: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cum.length; i++) {
    const d = Math.abs((cum[i] ?? 0) - s);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Nearest OPEN station index (-1 when every station is closed). */
export function nearestOpenStationIdx(
  cum: number[],
  s: number,
  stationIds: string[],
  closures: DerivedClosures,
): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < cum.length; i++) {
    if (closures.closedStations.has(stationIds[i])) continue;
    const d = Math.abs((cum[i] ?? 0) - s);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ---- Replacement services ----

export const EMERGENCY_FLEET = 12;

/** Deploy a shuttle between two stations as a real temp route. Returns events. */
export function deployReplacement(sim: SimulationState, inc: Incident): IncidentEvent[] {
  const rep = inc.replacement;
  if (!rep || inc.replacementRouteId) return [];
  if (sim.emergencyBusesFree < rep.buses) {
    return [{ t: sim.timeMinutes, text: `No emergency buses free for ${inc.label} (need ${rep.buses})`, level: 'warn' }];
  }
  const routeId = `rt-rep-${inc.id}`;
  if (sim.routes.some((r) => r.id === routeId)) return [];
  const byId = new Map(sim.stations.map((s) => [s.id, s.pos]));
  const a = byId.get(rep.fromStationId);
  const b = byId.get(rep.toStationId);
  if (!a || !b) return [{ t: sim.timeMinutes, text: `Replacement endpoints missing for ${inc.label}`, level: 'warn' }];
  const distM = Math.hypot(a.x - b.x, a.z - b.z);
  const route = {
    id: routeId,
    name: `Shuttle ${rep.fromStationId}↔${rep.toStationId}`,
    mode: 'bus' as const,
    color: '#f472b6',
    stationIds: [rep.fromStationId, rep.toStationId],
    headwayMin: rep.headwayMin,
    speedKph: 22,
    vehicleCapacity: rep.capacity,
  };
  const timeMin = (distM / 1000 / 22) * 60 + 0.5;
  const capHr = Math.round((60 / Math.max(1, rep.headwayMin)) * rep.capacity);
  const connections: Connection[] = [
    { from: rep.fromStationId, to: rep.toStationId, mode: 'bus', routeId, distM, timeMin, capacityPerHr: capHr },
    { from: rep.toStationId, to: rep.fromStationId, mode: 'bus', routeId, distM, timeMin, capacityPerHr: capHr },
  ];
  sim.routes.push(route);
  sim.connections.push(...connections);
  sim.routeLengths.set(routeId, distM);
  sim.routeCumDist.set(routeId, [0, distM]);
  sim.service[routeId] = {
    ...defaultPlanFor({ ...route, headwayMin: rep.headwayMin, speedKph: 22, vehicleCapacity: rep.capacity }),
    peakHeadwayMin: rep.headwayMin,
    offPeakHeadwayMin: rep.headwayMin,
    fleetSize: rep.buses,
  };
  sim.serviceOffsets[routeId] = 0;
  for (const st of sim.stations) {
    if (st.id === rep.fromStationId || st.id === rep.toStationId) {
      if (!st.routeIds.includes(routeId)) st.routeIds.push(routeId);
      if (!st.modes.includes('bus')) st.modes.push('bus');
    }
  }
  for (let i = 0; i < rep.buses; i++) {
    sim.vehicles.push({
      id: `veh-${routeId}-${i}`,
      routeId,
      s: (i / Math.max(1, rep.buses)) * distM,
      direction: i % 2 === 0 ? 1 : -1,
      load: 0,
      capacity: rep.capacity,
      riders: [],
      dwellLeft: 0,
      trips: 0,
    });
  }
  sim.counters.routeBoardings[routeId] = 0;
  sim.counters.routePeakOcc[routeId] = 0;
  sim.counters.routeDenied[routeId] = 0;
  sim.counters.routeVehKm[routeId] = 0;
  sim.counters.routeVehHr[routeId] = 0;
  sim.emergencyBusesFree -= rep.buses;
  inc.replacementRouteId = routeId;
  return [{ t: sim.timeMinutes, text: `Replacement buses deployed (${rep.buses}×) for ${inc.label}`, level: 'info' }];
}

/** Withdraw a replacement route; onboard riders alight at the nearest end. */
export function removeReplacement(sim: SimulationState, inc: Incident): void {
  const routeId = inc.replacementRouteId;
  if (!routeId) return;
  const rep = inc.replacement;
  const route = sim.routes.find((r) => r.id === routeId);
  const endA = rep?.fromStationId ?? route?.stationIds[0];
  const endB = rep?.toStationId ?? route?.stationIds[(route?.stationIds.length ?? 1) - 1];
  const byId = new Map(sim.passengers.map((p) => [p.id, p]));
  const cum = sim.routeCumDist.get(routeId) ?? [0, 1];
  const total = Math.max(1, cum[cum.length - 1]);
  for (const vv of sim.vehicles) {
    if (vv.routeId !== routeId) continue;
    const atEnd = vv.s / total < 0.5 ? endA : endB;
    for (const pid of vv.riders) {
      const p = byId.get(pid);
      if (!p) continue;
      p.state = 'WAITING';
      p.atStation = atEnd ?? p.legs[p.legIndex]?.board ?? null;
      p.vehicleId = null;
    }
    vv.riders = [];
  }
  sim.vehicles = sim.vehicles.filter((vv) => vv.routeId !== routeId);
  sim.routes = sim.routes.filter((r) => r.id !== routeId);
  sim.connections = sim.connections.filter((c) => c.routeId !== routeId);
  sim.routeLengths.delete(routeId);
  sim.routeCumDist.delete(routeId);
  delete sim.service[routeId];
  delete sim.serviceOffsets[routeId];
  for (const st of sim.stations) {
    st.routeIds = st.routeIds.filter((id) => id !== routeId);
  }
  if (rep) sim.emergencyBusesFree = Math.min(EMERGENCY_FLEET, sim.emergencyBusesFree + rep.buses);
  inc.replacementRouteId = undefined;
}

// ---- Presets (generated from live infrastructure, never hard-coded ids) ----

export interface IncidentPreset {
  key: string;
  label: string;
  hint: string;
  build: (startMin: number) => IncidentConfig;
}

export function incidentPresets(base: {
  routes: TransportRoute[];
  stations: Station[];
  routeLengths: Map<string, number>;
}): IncidentPreset[] {
  const metros = base.routes.filter((r) => r.mode === 'metro');
  const longestMetro = metros.toSorted((a, b) => (base.routeLengths.get(b.id) ?? 0) - (base.routeLengths.get(a.id) ?? 0))[0];
  const interchange = base.stations.toSorted((a, b) => b.routeIds.length - a.routeIds.length)[0];
  const buses = base.routes.filter((r) => r.mode === 'bus');
  const longestBus = buses.toSorted((a, b) => (base.routeLengths.get(b.id) ?? 0) - (base.routeLengths.get(a.id) ?? 0))[0];
  const out: IncidentPreset[] = [];
  if (longestMetro && longestMetro.stationIds.length >= 3) {
    const mid = Math.floor(longestMetro.stationIds.length / 2);
    out.push({
      key: 'metro-shutdown',
      label: 'Metro Shutdown',
      hint: `${longestMetro.name} middle segment, peak, 45 min`,
      build: (startMin) => ({
        id: '', kind: 'segment-closure', label: `${longestMetro.name} segment closure`,
        targetRouteId: longestMetro.id,
        segFrom: longestMetro.stationIds[mid - 1], segTo: longestMetro.stationIds[mid + 1],
        startMin, durationMin: 45, recoveryMin: 10, severity01: 0.9,
        replacement: {
          fromStationId: longestMetro.stationIds[mid - 1],
          toStationId: longestMetro.stationIds[mid + 1],
          buses: 6, headwayMin: 6, capacity: 70,
        },
      }),
    });
  }
  if (interchange) {
    out.push({
      key: 'station-closure',
      label: 'Station Closure',
      hint: `${interchange.name}, 30 min`,
      build: (startMin) => ({
        id: '', kind: 'station-closure', label: `${interchange.name} closure`,
        targetStationId: interchange.id,
        startMin, durationMin: 30, recoveryMin: 5, severity01: 0.7,
      }),
    });
  }
  if (longestBus) {
    out.push({
      key: 'reduced-service',
      label: 'Reduced Service',
      hint: `${longestBus.name} at 50% frequency, 60 min`,
      build: (startMin) => ({
        id: '', kind: 'reduced-service', label: `${longestBus.name} reduced service`,
        targetRouteId: longestBus.id,
        startMin, durationMin: 60, recoveryMin: 5, severity01: 0.5, headwayMult: 2,
      }),
    });
  }
  out.push({
    key: 'multi-incident',
    label: 'Multi-incident',
    hint: 'Two independent failures at once',
    build: (startMin) => ({
      id: '', kind: 'major-delay', label: 'Signal delays',
      targetRouteId: longestMetro?.id ?? '',
      startMin, durationMin: 30, recoveryMin: 5, severity01: 0.4, delayMin: 4,
    }),
  });
  return out;
}

/** One-shot threshold crossings while incidents are active (crowding, congestion). */
export function detectThresholdEvents(sim: SimulationState): IncidentEvent[] {
  const events: IncidentEvent[] = [];
  const anyActive = sim.incidents.some((i) => i.status === 'active');
  if (!anyActive) {
    if (Object.keys(sim.eventFlags).length > 0) sim.eventFlags = {};
    return events;
  }
  const flag = (key: string, text: string, level: IncidentEvent['level']): void => {
    if (!sim.eventFlags[key]) {
      sim.eventFlags[key] = true;
      events.push({ t: sim.timeMinutes, text, level });
    }
  };
  for (const r of sim.routes) {
    const peak = sim.counters.routePeakOcc[r.id] ?? 0;
    if (peak >= 0.9) flag(`crowd:${r.id}`, `${r.name} occupancy exceeds 90%`, 'warn');
  }
  for (const id in sim.edgeState) {
    const st = sim.edgeState[id];
    if (st.vc >= 0.85) {
      flag(`cong:${id}`, `Road ${id} heavily congested (V/C ${st.vc.toFixed(2)})`, 'warn');
    }
  }
  return events;
}

// ---- Structural dependency analysis (no simulation needed) ----

/** Share of zone-pair fastest paths relying on each station/route/bridge. */
export function structuralDependency(base: {
  zones: { id: string }[];
  stations: Station[];
  connections: Connection[];
  roadGraph: RoadGraph;
  zoneRoadAccess: Record<string, string>;
}): {
  stationShare: Map<string, number>;
  routeShare: Map<string, number>;
  bridgeShare: Map<string, number>;
  pairs: number;
} {
  const stationShare = new Map<string, number>();
  const routeShare = new Map<string, number>();
  const bridgeShare = new Map<string, number>();
  let pairs = 0;
  const access = (zoneId: string): string => {
    const st = ZONE_ACCESS[zoneId];
    return st ?? '';
  };
  for (const zo of base.zones) {
    for (const zd of base.zones) {
      if (zo.id === zd.id) continue;
      const from = access(zo.id);
      const to = access(zd.id);
      if (!from || !to || from === to) continue;
      const path = findShortestPath(base.connections, from, to);
      if (path) {
        pairs++;
        const seenStations = new Set(path.stationIds);
        const seenRoutes = new Set(path.routeIds.filter((r): r is string => r !== null));
        for (const s of seenStations) stationShare.set(s, (stationShare.get(s) ?? 0) + 1);
        for (const r of seenRoutes) routeShare.set(r, (routeShare.get(r) ?? 0) + 1);
      }
      const rn = base.zoneRoadAccess[zo.id];
      const rm = base.zoneRoadAccess[zd.id];
      if (rn && rm && rn !== rm) {
        const rp = findRoadPath(base.roadGraph, rn, rm, (id) => base.roadGraph.freeMin.get(id) ?? 1);
        if (rp) {
          for (const e of rp.edgeIds) {
            const edge = base.roadGraph.edgeById.get(e);
            if (edge?.isBridge) bridgeShare.set(e, (bridgeShare.get(e) ?? 0) + 1);
          }
        }
      }
    }
  }
  const norm = (m: Map<string, number>) => {
    const out = new Map<string, number>();
    for (const [k, v] of m) out.set(k, pairs > 0 ? v / pairs : 0);
    return out;
  };
  return { stationShare: norm(stationShare), routeShare: norm(routeShare), bridgeShare: norm(bridgeShare), pairs };
}
