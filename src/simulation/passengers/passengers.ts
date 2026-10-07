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
  purposeOf,
  rngNext,
  type DemandMatrix,
} from './demand.ts';
import { cachedRoadPath, driveAccessMin, spawnCarTrip } from '../traffic/cars.ts';
import { chooseMode, transitEstimate } from '../traffic/modeChoice.ts';
import type { RoadGraph } from '../traffic/roadGraph.ts';
import type { PathExclusions } from '../transport/graph.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import {
  dwellMin,
  nextArrivalMin,
  routeEffectiveHeadway,
} from '../service/timetable.ts';
import { tripCancelled, tripDelayMin } from '../service/reliability.ts';
import {
  creditCompletedFare,
  fareModeFor,
  tripFare,
  type FarePolicy,
} from '../economics/fares.ts';
import {
  hopAheadBlocked,
  legBlocked,
  legBoardableFrom,
  nearestOpenStationIdx,
  type DerivedClosures,
} from '../incidents/incidents.ts';

export interface PassengerWorld {
  timeMinutes: number;
  tick: number;
  seed: number;
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
  service: Record<string, ServicePlan>;
  serviceOffsets: Record<string, number>;
  fares: FarePolicy;
  closures: DerivedClosures;
}

/** Bus routes that loop instead of ping-ponging. Exported for fleet math. */
/**
 * Routes that run as a loop. None today: the movement model runs every line out
 * and back, as the lines are drawn (B1 was a loop without a closing leg, so its
 * vehicles jumped from the last stop to the first).
 */
export const LOOP_ROUTES = new Set<string>();
const MAX_ACTIVE = 12000;
const WALK_KPH = 5;
const TRANSFER_MIN = 2;

export function walkMin(ax: number, az: number, bx: number, bz: number): number {
  return (Math.hypot(ax - bx, az - bz) / 1000 / WALK_KPH) * 60;
}

/** Headway a passenger experiences on a route right now. */
export function effHeadway(w: PassengerWorld, route: TransportRoute): number {
  if (w.closures.suspendedRoutes.has(route.id)) return Infinity;
  const plan = w.service[route.id];
  if (!plan) return route.headwayMin;
  const cum = w.routeCumDist.get(route.id) ?? [0];
  const total = Math.max(1, cum[cum.length - 1]);
  const slow = route.mode === 'bus' ? (w.busRouteCongestion[route.id] ?? 1) : 1;
  const h = routeEffectiveHeadway(plan, total, route.stationIds.length, slow, w.timeMinutes, LOOP_ROUTES.has(route.id));
  if (!Number.isFinite(h)) return Infinity;
  return h * (w.closures.headwayMult.get(route.id) ?? 1);
}

/** Compress a station-level path into single-route legs. Null when unroutable. */
export function buildRoutePlan(connections: Connection[], from: string, to: string, excl?: PathExclusions): Leg[] | null {
  return planTrip(connections, from, to, excl)?.legs ?? null;
}

/** Convert live closures to routing exclusions (empty = normal network). */
export function exclusionsFrom(closures: DerivedClosures): PathExclusions {
  return {
    stations: closures.closedStations,
    segments: closures.closedHops,
    routes: closures.suspendedRoutes,
  };
}

/**
 * Replan a disrupted journey from a station toward the original final
 * destination. Returns true when the passenger can continue by transit
 * (legs replaced, caller sets WAITING); false when stranded.
 */
export function replanFromStation(
  w: PassengerWorld,
  p: Passenger,
  stationId: string,
  zoneById: Map<string, Zone>,
): boolean {
  const destLeg = p.legs[p.legs.length - 1];
  if (!destLeg) return false;
  const dest = destLeg.alight;
  // Transfers already made before this replan (one per leg boundary ridden
  // so far); the stale spawn-time count must not carry past a reroute.
  const transfersSoFar = p.legIndex;
  if (stationId === dest) {
    p.transfers = transfersSoFar;
    finishJourney(w, p, zoneById, stationId);
    return true;
  }
  const trip = planTrip(w.connections, stationId, dest, exclusionsFrom(w.closures));
  if (!trip || trip.legs.length === 0) return false;
  p.legs = trip.legs;
  p.legIndex = 0;
  p.atStation = stationId;
  p.vehicleId = null;
  p.transfers = transfersSoFar + Math.max(0, trip.legs.length - 1);
  return true;
}

/** Complete a journey on the spot (already at the destination station). */
function finishJourney(
  w: PassengerWorld,
  p: Passenger,
  zoneById: Map<string, Zone>,
  stationId: string,
): void {
  const st = w.stations.find((s) => s.id === stationId);
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
  creditCompletedFare(w.counters, p.fareRouteId, p.fareMode, p.farePaid);
  if (st) st.alightedDay++;
}

/** Full transit plan: legs plus estimated ride time (excludes waiting). */
export function planTrip(
  connections: Connection[],
  from: string,
  to: string,
  excl?: PathExclusions,
): { legs: Leg[]; totalMin: number } | null {
  const path = findShortestPath(connections, from, to, excl);
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
        // Wait estimates use the headway passengers actually experience
        // (fleet-limited and congestion-degraded), not the schedule alone.
        const headways = trip.legs.map((l) => {
          const r = routeById.get(l.routeId);
          if (!r) return 10;
          return effHeadway(w, r);
        });
        const drive = driveAccessMin(w.city, oz, dz, w.zoneRoadAccess);
        const [draw, rng2] = rngNext(rng);
        rng = rng2;
        // Entry-mode pricing: the trip costs its first leg's mode fare, locked
        // in now for both mode choice and the revenue counted at arrival.
        const firstRoute = routeById.get(trip.legs[0].routeId);
        const fareMode = fareModeFor(firstRoute?.mode ?? 'bus');
        const fare = tripFare(fareMode, w.fares);
        if (chooseMode(draw, transitEstimate(trip.totalMin, headways), trip.legs.length - 1, road.totalMin + drive, dz.kind, fare) === 'car') {
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
      const entryRoute = routeById.get(legs[0].routeId);
      const entryMode = fareModeFor(entryRoute?.mode ?? 'bus');
      w.passengers.push({
        id: w.nextPassengerId++,
        originZone: pair.from,
        destZone: pair.to,
        purpose: purposeOf(oz.kind, dz.kind),
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
        strandedMin: 0,
        farePaid: tripFare(entryMode, w.fares),
        fareRouteId: legs[0].routeId,
        fareMode: entryMode,
      });
      w.counters.generated++;
    }
  }
  w.rng = rng;

  // 1b. Disruption validation: passengers whose current leg became unusable
  // replan from where they stand; otherwise they strand in place. Covers both
  // WAITING (current leg) and TRANSFERRING (next leg, e.g. suspended since).
  if (w.closures.active) {
    for (const p of w.passengers) {
      if ((p.state === 'WAITING' || p.state === 'TRANSFERRING') && p.atStation) {
        const leg = p.legs[p.legIndex];
        const route = leg ? routeById.get(leg.routeId) : undefined;
        if (legBlocked(leg, route?.stationIds, w.closures)) {
          if (replanFromStation(w, p, p.atStation, zoneById)) {
            p.state = 'WAITING';
            p.transferLeft = 0;
            w.counters.rerouted++;
          } else {
            p.state = 'STRANDED';
            p.transferLeft = 0;
            p.strandedMin = 0;
          }
        }
      } else if (p.state === 'STRANDED' && p.atStation) {
        if ((w.tick + p.id) % 5 === 0) {
          if (replanFromStation(w, p, p.atStation, zoneById)) {
            p.state = 'WAITING';
            p.strandedMin = 0;
            w.counters.rerouted++;
          }
        }
      }
    }
  }

  // 2. Walking / transfer timers.
  const disrupted = w.closures.active;
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
      if (disrupted) w.counters.incidentDelayMin += dtMin;
      if (p.transferLeft <= 0) {
        p.state = 'WAITING';
      }
    } else if (p.state === 'WAITING') {
      p.waitMin += dtMin;
      if (disrupted) w.counters.incidentDelayMin += dtMin;
    } else if (p.state === 'STRANDED') {
      p.waitMin += dtMin;
      p.strandedMin += dtMin;
      if (disrupted) w.counters.incidentDelayMin += dtMin;
      if (p.strandedMin >= 45) {
        // Gave up (taxi home off-sim): remove without completing.
        p.state = 'ARRIVED';
        p.arriveMin = w.timeMinutes;
        p.travelMin = w.timeMinutes - p.departMin;
        p.atStation = null;
        w.counters.cancelledTrips++;
      }
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
    const plan = w.service[route.id];
    const cum = w.routeCumDist.get(route.id) ?? [0];
    // Disruption hold: suspended routes park; vehicles stop before closed hops.
    const parked = w.closures.suspendedRoutes.has(vv.routeId);
    const held = parked || hopAheadBlocked(vv.routeId, route.stationIds, cum, vv.s, vv.direction, w.closures);
    // Buses share the road network: congestion slows them (multimodal link).
    const slow = route.mode === 'bus' ? (w.busRouteCongestion[route.id] ?? 1) : 1;
    const speedKph = (plan?.speedKph ?? route.speedKph) / Math.max(1, slow);
    const speedMpm = (speedKph * 1000) / 60;
    // Service supplied accumulates whether moving or dwelling.
    w.counters.routeVehHr[vv.routeId] = (w.counters.routeVehHr[vv.routeId] ?? 0) + dtMin / 60;
    if (held) {
      // Holding for a disruption (no movement, no boarding this tick).
      vv.dwellLeft = dtMin;
      vv.load = vv.riders.length;
      if (vv.riders.length > 0) {
        // Offload riders who cannot continue: parked (terminated) = all,
        // held = only those whose remaining leg is blocked. They replan.
        const idx = nearestOpenStationIdx(cum, vv.s, route.stationIds, w.closures);
        const sid = idx >= 0 ? route.stationIds[idx] : undefined;
        if (sid) {
          const staying: number[] = [];
          for (const pid of vv.riders) {
            const p = byId.get(pid);
            if (!p) continue;
            const leg = p.legs[p.legIndex];
            if (parked || legBlocked(leg, route.stationIds, w.closures)) {
              p.state = 'WAITING';
              p.atStation = sid;
              p.vehicleId = null;
              const st = stationById.get(sid);
              if (st) st.alightedDay++;
            } else {
              staying.push(pid);
            }
          }
          vv.riders = staying;
        }
      }
    } else {
      driveVehicle(w, vv, route, plan, cum, speedMpm, dtMin, slow, byId, zoneById, stationById, routeById, waitingByStation);
      vv.load = vv.riders.length;
    }
    const occ = vv.load / Math.max(1, vv.capacity);
    if (occ > w.counters.maxOccupancy01) w.counters.maxOccupancy01 = occ;
    const peak = w.counters.routePeakOcc;
    if (occ > (peak[vv.routeId] ?? 0)) peak[vv.routeId] = occ;
  }

  // 4. Station live counters from actual passenger states.
  for (const st of w.stations) {
    // Transfers complete during vehicle visits may have changed lists; recount.
    let n = 0;
    for (const q of w.passengers) {
      if ((q.state === 'WAITING' || q.state === 'TRANSFERRING' || q.state === 'STRANDED') && q.atStation === st.id) n++;
    }
    st.waiting = n;
    if (n > st.peakWaiting) st.peakWaiting = n;
  }
  let strandedNow = 0;
  for (const q of w.passengers) if (q.state === 'STRANDED') strandedNow++;
  if (strandedNow > w.counters.strandedPeak) w.counters.strandedPeak = strandedNow;

  // 5. Sweep arrived passengers (aggregates already recorded).
  if (w.passengers.some((x) => x.state === 'ARRIVED')) {
    w.passengers = w.passengers.filter((x) => x.state !== 'ARRIVED');
  }
}

/**
 * Spend one tick of `dtMin` minutes on a vehicle: finish any dwell, then run to
 * the next station, serve it, dwell there, and carry on with what is left. A
 * vehicle never skips a station, and each stop pays its own dwell. Termini
 * serve once, take the turnaround, and send the vehicle back the other way.
 * Loop routes are not supported by this movement (none is defined).
 */
function driveVehicle(
  w: PassengerWorld,
  vv: VehicleState,
  route: TransportRoute,
  plan: ServicePlan | undefined,
  cum: number[],
  speedMpm: number,
  dtMin: number,
  slow: number,
  byId: Map<number, Passenger>,
  zoneById: Map<string, Zone>,
  stationById: Map<string, Station>,
  routeById: Map<string, TransportRoute>,
  waitingByStation: Map<string, Passenger[]>,
): void {
  const EPS = 1e-6;
  const lastIdx = cum.length - 1;
  let budget = dtMin;
  if (vv.dwellLeft > 0) {
    // Standing at a platform: people who arrive while it waits still board, and each costs a little time.
    const here = cum.findIndex((c) => Math.abs(c - vv.s) < EPS);
    const stationId = here >= 0 ? route.stationIds[here] : undefined;
    if (stationId && plan && !w.closures.closedStations.has(stationId)) {
      const late = boardAt(w, vv, stationId, waitingByStation, routeById).boarded;
      vv.dwellLeft += (late * plan.dwellPerBoardSec) / 60;
    }
    const spent = Math.min(budget, vv.dwellLeft);
    vv.dwellLeft -= spent;
    budget -= spent;
  }
  // Each pass either ends the tick or serves one station, so this is bounded.
  for (let guard = 0; guard <= cum.length * 2 && budget > EPS && vv.dwellLeft <= EPS && speedMpm > 0; guard++) {
    let next = -1;
    if (vv.direction === 1) {
      for (let i = 0; i <= lastIdx; i++) if (cum[i] > vv.s + EPS) { next = i; break; }
    } else {
      for (let i = lastIdx; i >= 0; i--) if (cum[i] < vv.s - EPS) { next = i; break; }
    }
    if (next < 0) {
      // At a terminus with nothing ahead (a vehicle placed on it): turn round.
      vv.direction = vv.direction === 1 ? -1 : 1;
      continue;
    }
    if (hopAheadBlocked(vv.routeId, route.stationIds, cum, vv.s, vv.direction, w.closures)) break;
    const dist = Math.abs(cum[next] - vv.s);
    const need = dist / speedMpm;
    if (need > budget + EPS) {
      const run = speedMpm * budget;
      vv.s += run * vv.direction;
      w.counters.routeVehKm[vv.routeId] = (w.counters.routeVehKm[vv.routeId] ?? 0) + run / 1000;
      budget = 0;
      break;
    }
    vv.s = cum[next];
    budget -= need;
    w.counters.routeVehKm[vv.routeId] = (w.counters.routeVehKm[vv.routeId] ?? 0) + dist / 1000;

    const stationId = route.stationIds[next];
    let boardN = 0;
    let alightN = 0;
    if (stationId) {
      alightN = alightAt(w, vv, stationId, byId, zoneById, stationById, routeById);
      boardN = boardAt(w, vv, stationId, waitingByStation, routeById).boarded;
    }
    const terminus = next === 0 || next === lastIdx;
    if (plan) {
      vv.dwellLeft = dwellMin(plan, boardN, alightN, vv.riders.length / Math.max(1, vv.capacity));
      // Major-delay incidents add dwell at every served stop.
      vv.dwellLeft += w.closures.stopDelayMin.get(vv.routeId) ?? 0;
      if (terminus) {
        // Turnaround, then the reliability draws (deterministic, per terminus visit).
        vv.dwellLeft += plan.turnaroundMin;
        vv.trips++;
        const delay = tripDelayMin(w.seed, vv.id, vv.trips, plan.reliability);
        if (delay > 0) {
          vv.dwellLeft += delay;
          w.counters.totalDelayMin += delay;
        }
        if (tripCancelled(w.seed, vv.id, vv.trips, plan.reliability)) {
          const h = routeEffectiveHeadway(plan, cum[lastIdx], route.stationIds.length, slow, w.timeMinutes);
          if (Number.isFinite(h)) {
            vv.dwellLeft += h;
            w.counters.totalDelayMin += h;
          }
        }
      }
    }
    if (terminus) vv.direction = next === lastIdx ? -1 : 1;
    const spent = Math.min(budget, vv.dwellLeft);
    vv.dwellLeft -= spent;
    budget -= spent;
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
  routeById: Map<string, TransportRoute>,
): number {
  if (vv.riders.length === 0) return 0;
  const staying: number[] = [];
  let alighted = 0;
  for (const pid of vv.riders) {
    const p = byId.get(pid);
    if (!p) continue;
    const leg = p.legs[p.legIndex];
    if (!leg || leg.alight !== stationId) {
      staying.push(pid);
      continue;
    }
    alighted++;
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
      creditCompletedFare(w.counters, p.fareRouteId, p.fareMode, p.farePaid);
    } else {
      p.legIndex++;
      p.state = 'TRANSFERRING';
      p.atStation = stationId;
      p.vehicleId = null;
      if (st) st.transfersDay++;
      // Transfer wait emerges from the connecting service's timetable:
      // interchange walk plus the actual wait for its next departure.
      p.transferLeft = TRANSFER_MIN + transferServiceWait(w, p.legs[p.legIndex], stationId, routeById);
    }
  }
  vv.riders = staying;
  return alighted;
}

/** Extra wait for the next leg beyond the fixed interchange walk. */
function transferServiceWait(
  w: PassengerWorld,
  nextLeg: Leg,
  stationId: string,
  routeById: Map<string, TransportRoute>,
): number {
  const nr = routeById.get(nextLeg.routeId);
  const plan = w.service[nextLeg.routeId];
  if (!nr || !plan) return 0;
  if (w.closures.suspendedRoutes.has(nr.id)) return Infinity;
  const cum = w.routeCumDist.get(nr.id) ?? [0];
  const idx = nr.stationIds.indexOf(stationId);
  if (idx < 0) return 0;
  const total = Math.max(1, cum[cum.length - 1]);
  const slow = nr.mode === 'bus' ? (w.busRouteCongestion[nr.id] ?? 1) : 1;
  const h = routeEffectiveHeadway(plan, total, nr.stationIds.length, slow, w.timeMinutes, LOOP_ROUTES.has(nr.id));
  if (!Number.isFinite(h)) return 0;
  const mult = w.closures.headwayMult.get(nr.id) ?? 1;
  const arr = nextArrivalMin(plan, h * mult, w.serviceOffsets[nr.id] ?? 0, cum, idx, w.timeMinutes + TRANSFER_MIN);
  if (!Number.isFinite(arr)) return 0;
  return Math.max(0, arr - (w.timeMinutes + TRANSFER_MIN));
}

function boardAt(
  w: PassengerWorld,
  vv: VehicleState,
  stationId: string,
  waitingByStation: Map<string, Passenger[]>,
  routeById: Map<string, TransportRoute>,
): { boarded: number; denied: number } {
  const queue = waitingByStation.get(stationId);
  if (!queue || queue.length === 0) return { boarded: 0, denied: 0 };
  // FIFO: eligible passengers board up to capacity; the rest are denied
  // this visit and keep waiting for the next service. During disruptions,
  // passengers only board vehicles that can actually reach their destination.
  const route = routeById.get(vv.routeId);
  const idx = route ? route.stationIds.indexOf(stationId) : -1;
  const loop = LOOP_ROUTES.has(vv.routeId);
  const eligible = queue.filter(
    (p) => p.state === 'WAITING' && p.atStation === stationId &&
      p.legs[p.legIndex] && p.legs[p.legIndex].board === stationId && p.legs[p.legIndex].routeId === vv.routeId &&
      (idx < 0 || legBoardableFrom(p.legs[p.legIndex], route?.stationIds ?? [], idx, vv.direction, w.closures, loop)),
  );
  const space = Math.max(0, vv.capacity - vv.riders.length);
  const boarding = eligible.slice(0, space);
  const denied = eligible.length - boarding.length;
  if (denied > 0) {
    w.counters.deniedBoardings += denied;
    w.counters.routeDenied[vv.routeId] = (w.counters.routeDenied[vv.routeId] ?? 0) + denied;
  }
  for (const p of boarding) {
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
    const bRoute = routeById.get(p.legs[p.legIndex].routeId);
    if (bRoute?.mode === 'metro') w.counters.metroBoardings++;
    else if (bRoute?.mode === 'rail') w.counters.railBoardings++;
    else w.counters.busBoardings++;
    w.counters.routeBoardings[vv.routeId] = (w.counters.routeBoardings[vv.routeId] ?? 0) + 1;
  }
  // Remove boarded passengers from the station queue.
  const remaining = queue.filter((p) => p.state === 'WAITING');
  waitingByStation.set(stationId, remaining);
  return { boarded: boarding.length, denied };
}
