// Passenger lifecycle: spawn from O/D demand, walk, wait, board, ride,
// transfer, arrive. Operates on a structural world so index.ts stays thin.
import type {
  CarTrip,
  CityData,
  Connection,
  Leg,
  Passenger,
  RoadCounters,
  RoadEdgeState,
  Station,
  TransportRoute,
  TripCounters,
  VehicleState,
  Zone,
} from '../../types/index.ts';
import { findShortestPath } from '../transport/graph.ts';
import {
  ZONE_ACCESS,
  expectedSpawns,
  periodFactor,
  periodOf,
  rngNext,
  type DemandMatrix,
} from './demand.ts';
import { cachedRoadPath, driveAccessMin, spawnCarTrip } from '../traffic/cars.ts';
import { chooseMode, transitEstimate } from '../traffic/modeChoice.ts';
import type { RoadGraph } from '../traffic/roadGraph.ts';

export interface PassengerWorld {
  timeMinutes: number;
  city: CityData;
  stations: Station[];
  routes: TransportRoute[];
  connections: Connection[];
  vehicles: VehicleState[];
  passengers: Passenger[];
  demand: DemandMatrix;
  routeCumDist: Map<string, number[]>;
  rng: number;
  nextPassengerId: number;
  counters: TripCounters;
  roadGraph: RoadGraph;
  edgeState: Record<string, RoadEdgeState>;
  cars: CarTrip[];
  nextCarId: number;
  roadCounters: RoadCounters;
  zoneRoadAccess: Record<string, string>;
  roadCache: Map<string, { edgeIds: string[]; nodes: string[]; totalMin: number; computedAt: number }>;
  busRouteCongestion: Record<string, number>;
  busRoadMap: Record<string, string[]>;
}

const LOOP_ROUTES = new Set(['rt-b1']);
const MAX_ACTIVE = 12000;
const WALK_KPH = 5;
const TRANSFER_MIN = 2;

function walkMin(ax: number, az: number, bx: number, bz: number): number {
  return (Math.hypot(ax - bx, az - bz) / 1000 / WALK_KPH) * 60;
}

/** Compress a station-level path into single-route legs. Null when unroutable. */
export function buildRoutePlan(connections: Connection[], from: string, to: string): Leg[] | null {
  return planTrip(connections, from, to)?.legs ?? null;
}

/** Full transit plan: legs plus estimated ride time (excludes waiting). */
export function planTrip(
  connections: Connection[],
  from: string,
  to: string,
): { legs: Leg[]; totalMin: number } | null {
  const path = findShortestPath(connections, from, to);
  if (!path || path.stationIds.length < 2) return null;
  const legs: Leg[] = [];
  let start = 0;
  for (let i = 1; i <= path.routeIds.length; i++) {
    if (i === path.routeIds.length || path.routeIds[i] !== path.routeIds[start]) {
      legs.push({
        board: path.stationIds[start],
        alight: path.stationIds[i],
        routeId: path.routeIds[start] ?? '',
      });
      start = i;
    }
  }
  if (legs.some((l) => !l.routeId)) return null;
  return { legs, totalMin: path.totalMin };
}

export function advancePassengers(w: PassengerWorld, dtMin: number): void {
  const zones = w.city.zones;
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const stationById = new Map(w.stations.map((s) => [s.id, s]));
  const routeById = new Map(w.routes.map((r) => [r.id, r]));
  const maxJobs = Math.max(...zones.map((z) => z.jobs));
  const maxPop = Math.max(...zones.map((z) => z.population));
  const period = periodOf(w.timeMinutes);

  // 1. Spawn from demand.
  let rng = w.rng;
  for (const pair of w.demand.pairs) {
    const oz = zoneById.get(pair.from);
    const dz = zoneById.get(pair.to);
    if (!oz || !dz) continue;
    const fromSt = ZONE_ACCESS[pair.from];
    const toSt = ZONE_ACCESS[pair.to];
    if (!fromSt || !toSt || fromSt === toSt) continue;
    const exp = expectedSpawns(pair, w.timeMinutes, dtMin) * periodFactor(oz, dz, period, maxJobs, maxPop);
    let n = Math.floor(exp);
    let r: number;
    [r, rng] = rngNext(rng);
    if (r < exp - n) n++;
    for (let i = 0; i < n; i++) {
      if (w.passengers.length >= MAX_ACTIVE) {
        w.counters.skippedCap++;
        break;
      }
      // Both options use live network state: transit via the station graph,
      // car via the congested road graph. Either may be unroutable.
      const trip = planTrip(w.connections, fromSt, toSt);
      const road = cachedRoadPath(w, w.zoneRoadAccess[pair.from] ?? '', w.zoneRoadAccess[pair.to] ?? '', true);
      if (!trip && !road) {
        w.counters.unrouted++;
        continue;
      }
      if (trip && road) {
        const headways = trip.legs.map((l) => routeById.get(l.routeId)?.headwayMin ?? 10);
        const drive = driveAccessMin(w.city, oz, dz, w.zoneRoadAccess);
        const [draw, rng2] = rngNext(rng);
        rng = rng2;
        if (chooseMode(draw, transitEstimate(trip.totalMin, headways), trip.legs.length - 1, road.totalMin + drive, dz.kind) === 'car') {
          if (spawnCarTrip(w, oz, dz, drive)) continue;
          // Car spawn failed (cap): fall through to transit.
        }
      } else if (road) {
        const drive = driveAccessMin(w.city, oz, dz, w.zoneRoadAccess);
        if (spawnCarTrip(w, oz, dz, drive)) continue;
      }
      const legs = trip?.legs;
      if (!legs) {
        w.counters.unrouted++;
        continue;
      }
      const st = stationById.get(fromSt);
      const access = st ? walkMin(oz.center.x, oz.center.z, st.pos.x, st.pos.z) : 2;
      w.passengers.push({
        id: w.nextPassengerId++,
        originZone: pair.from,
        destZone: pair.to,
        departMin: w.timeMinutes,
        state: 'WALKING',
        legs,
        legIndex: 0,
        atStation: null,
        vehicleId: null,
        waitMin: 0,
        travelMin: 0,
        walkLeft: access,
        transferLeft: 0,
        transfers: legs.length - 1,
        arriveMin: null,
      });
      w.counters.generated++;
    }
  }
  w.rng = rng;

  // 2. Walking / transfer timers.
  for (const p of w.passengers) {
    if (p.state === 'WALKING') {
      p.walkLeft -= dtMin;
      if (p.walkLeft <= 0) {
        p.state = 'WAITING';
        p.atStation = p.legs[0].board;
      }
    } else if (p.state === 'TRANSFERRING') {
      p.transferLeft -= dtMin;
      p.waitMin += dtMin;
      if (p.transferLeft <= 0) {
        p.state = 'WAITING';
      }
    } else if (p.state === 'WAITING') {
      p.waitMin += dtMin;
    }
  }

  // 3. Vehicles move; each station crossing triggers alight + board.
  const byId = new Map<number, Passenger>();
  for (const p of w.passengers) byId.set(p.id, p);
  const waitingByStation = new Map<string, Passenger[]>();
  for (const p of w.passengers) {
    if (p.state === 'WAITING' && p.atStation) {
      if (!waitingByStation.has(p.atStation)) waitingByStation.set(p.atStation, []);
      waitingByStation.get(p.atStation)?.push(p);
    }
  }

  for (const vv of w.vehicles) {
    const route = routeById.get(vv.routeId);
    if (!route) continue;
    const cum = w.routeCumDist.get(route.id) ?? [0];
    const total = Math.max(1, cum[cum.length - 1]);
    // Buses share the road network: congestion slows them (multimodal link).
    const slow = route.mode === 'bus' ? (w.busRouteCongestion[route.id] ?? 1) : 1;
    const speedMpm = (route.speedKph * 1000) / 60 / Math.max(1, slow);
    const oldP = vv.s;
    const rawP = vv.s + speedMpm * dtMin * vv.direction;
    let p = rawP;
    let direction = vv.direction;
    if (LOOP_ROUTES.has(route.id)) {
      p = ((p % total) + total) % total;
    } else {
      if (p >= total) { p = total - (p - total); direction = -1; }
      if (p <= 0) { p = -p; direction = 1; }
    }
    vv.s = p;
    vv.direction = direction;

    const lastIdx = cum.length - 1;
    const visits = crossedStations(cum, oldP, p, vv.direction, LOOP_ROUTES.has(route.id));
    if (!LOOP_ROUTES.has(route.id)) {
      // Reflection clamps the endpoint exactly, so strict range checks would
      // skip terminus stations. Serve them explicitly on turnaround ticks.
      if (rawP >= total && !visits.includes(lastIdx)) visits.push(lastIdx);
      if (rawP <= 0 && !visits.includes(0)) visits.unshift(0);
    }
    for (const idx of visits) {
      const stationId = route.stationIds[idx];
      if (!stationId) continue;
      alightAt(w, vv, stationId, byId, zoneById, stationById);
      boardAt(w, vv, stationId, waitingByStation, routeById);
    }
    vv.load = vv.riders.length;
    const occ = vv.load / Math.max(1, vv.capacity);
    if (occ > w.counters.maxOccupancy01) w.counters.maxOccupancy01 = occ;
  }

  // 4. Station live counters from actual passenger states.
  for (const st of w.stations) {
    // Transfers complete during vehicle visits may have changed lists; recount.
    let n = 0;
    for (const q of w.passengers) {
      if ((q.state === 'WAITING' || q.state === 'TRANSFERRING') && q.atStation === st.id) n++;
    }
    st.waiting = n;
    if (n > st.peakWaiting) st.peakWaiting = n;
  }

  // 5. Sweep arrived passengers (aggregates already recorded).
  if (w.passengers.some((x) => x.state === 'ARRIVED')) {
    w.passengers = w.passengers.filter((x) => x.state !== 'ARRIVED');
  }
}

/** Station indices whose cum-distance was crossed between oldP and newP. */
export function crossedStations(
  cum: number[],
  oldP: number,
  newP: number,
  direction: 1 | -1,
  loop: boolean,
): number[] {
  const out: number[] = [];
  const inRange = (c: number, a: number, b: number) => (a <= b ? c > a && c <= b : c > b && c <= a);
  if (loop && ((direction === 1 && newP < oldP) || (direction === -1 && newP > oldP))) {
    // Wrapped around the loop end.
    for (let i = 0; i < cum.length; i++) {
      const c = cum[i];
      if (direction === 1 ? c > oldP || c <= newP : c < oldP || c >= newP) out.push(i);
    }
  } else if (direction === 1) {
    for (let i = 0; i < cum.length; i++) if (inRange(cum[i], oldP, newP)) out.push(i);
  } else {
    for (let i = cum.length - 1; i >= 0; i--) if (inRange(cum[i], newP, oldP)) out.push(i);
  }
  return out;
}

function alightAt(
  w: PassengerWorld,
  vv: VehicleState,
  stationId: string,
  byId: Map<number, Passenger>,
  zoneById: Map<string, Zone>,
  stationById: Map<string, Station>,
): void {
  if (vv.riders.length === 0) return;
  const staying: number[] = [];
  for (const pid of vv.riders) {
    const p = byId.get(pid);
    if (!p) continue;
    const leg = p.legs[p.legIndex];
    if (!leg || leg.alight !== stationId) {
      staying.push(pid);
      continue;
    }
    const st = stationById.get(stationId);
    if (st) st.alightedDay++;
    if (p.legIndex >= p.legs.length - 1) {
      // Final destination: add egress walk, record journey.
      const dz = zoneById.get(p.destZone);
      const egress = st && dz ? walkMin(st.pos.x, st.pos.z, dz.center.x, dz.center.z) : 2;
      p.state = 'ARRIVED';
      p.arriveMin = w.timeMinutes;
      p.travelMin = w.timeMinutes - p.departMin + egress;
      p.vehicleId = null;
      p.atStation = null;
      w.counters.completed++;
      w.counters.totalTravelMin += p.travelMin;
      w.counters.totalWaitMin += p.waitMin;
      w.counters.totalTransfers += p.transfers;
    } else {
      p.legIndex++;
      p.state = 'TRANSFERRING';
      p.transferLeft = TRANSFER_MIN;
      p.atStation = stationId;
      p.vehicleId = null;
    }
  }
  vv.riders = staying;
}

function boardAt(
  w: PassengerWorld,
  vv: VehicleState,
  stationId: string,
  waitingByStation: Map<string, Passenger[]>,
  routeById: Map<string, TransportRoute>,
): void {
  const queue = waitingByStation.get(stationId);
  if (!queue || queue.length === 0) return;
  for (const p of queue) {
    if (vv.riders.length >= vv.capacity) break; // full: rest stay waiting
    if (p.state !== 'WAITING' || p.atStation !== stationId) continue;
    const leg = p.legs[p.legIndex];
    if (!leg || leg.board !== stationId || leg.routeId !== vv.routeId) continue;
    p.state = 'ON_VEHICLE';
    p.vehicleId = vv.id;
    p.atStation = null;
    vv.riders.push(p.id);
    const st = w.stations.find((s) => s.id === stationId);
    if (st) {
      st.boardedDay++;
      st.waiting = Math.max(0, st.waiting - 1);
    }
    w.counters.boardingsTotal++;
    const bRoute = routeById.get(leg.routeId);
    if (bRoute?.mode === 'metro') w.counters.metroBoardings++;
    else if (bRoute?.mode === 'rail') w.counters.railBoardings++;
    else w.counters.busBoardings++;
    w.counters.routeBoardings[vv.routeId] = (w.counters.routeBoardings[vv.routeId] ?? 0) + 1;
  }
  // Remove boarded passengers from the station queue.
  const remaining = queue.filter((p) => p.state === 'WAITING');
  waitingByStation.set(stationId, remaining);
}
