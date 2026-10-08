// Simulation core: pure TS, no React / Three.js. Owns city, network, demand,
// passengers, vehicles, clock, and counters.
import type {
  CarTrip,
  CityData,
  Connection,
  Passenger,
  RoadCounters,
  RoadEdgeState,
  Station,
  TransportRoute,
  TripCounters,
  TripRecord,
  VehicleState,
} from '../types/index.ts';
import { generateCity } from './city/generateCity.ts';
import { buildNetwork } from './transport/network.ts';
import { buildDemandMatrix, type DemandMatrix } from './passengers/demand.ts';
import { advancePassengers } from './passengers/passengers.ts';
import {
  advanceTraffic,
  buildBusRoadMap,
  buildEdgeStates,
  buildZoneRoadAccess,
  emptyRoadCounters,
} from './traffic/cars.ts';
import { buildRoadGraph, type RoadGraph } from './traffic/roadGraph.ts';
import { defaultPlanFor, type ServicePlan } from './service/servicePlan.ts';
import { cycleMin, phaseOffset, resolvedFleet } from './service/timetable.ts';
import { LOOP_ROUTES } from './passengers/passengers.ts';
import {
  closureSignature,
  deriveClosures,
  detectThresholdEvents,
  emptyClosures,
  updateIncidentLifecycle,
  type DerivedClosures,
  type IncidentConfig,
} from './incidents/incidents.ts';
import type { Incident, IncidentEvent } from '../types/index.ts';
import { DEFAULT_FARES, type FarePolicy } from './economics/fares.ts';
import { applyFares, applyServicePatch } from './service/live.ts';
import type { TimedOp } from './scenario/scenario.ts';

export interface SimulationState {
  seed: number;
  tick: number;
  timeMinutes: number;
  city: CityData;
  stations: Station[];
  routes: TransportRoute[];
  connections: Connection[];
  routeLengths: Map<string, number>;
  routeCumDist: Map<string, number[]>;
  vehicles: VehicleState[];
  passengers: Passenger[];
  demand: DemandMatrix;
  rng: number;
  nextPassengerId: number;
  counters: TripCounters;
  roadGraph: RoadGraph;
  edgeState: Record<string, RoadEdgeState>;
  cars: CarTrip[];
  nextCarId: number;
  /** Counts vehicles added by live service edits, so their ids are the same on every replay. */
  fleetNonce: number;
  /** The last finished trips, newest last, for the trip inspector (bounded). */
  recentTrips: TripRecord[];
  roadCounters: RoadCounters;
  zoneRoadAccess: Record<string, string>;
  busRoadMap: Record<string, string[]>;
  roadCache: Map<string, { edgeIds: string[]; nodes: string[]; totalMin: number; computedAt: number }>;
  busRouteCongestion: Record<string, number>;
  /** Operating configuration per route (infrastructure lives on TransportRoute). */
  service: Record<string, ServicePlan>;
  /** Flat fare per transit mode (OCU per trip, entry-mode pricing). */
  fares: FarePolicy;
  /** Deterministic departure phase per route (0 for synced routes). */
  serviceOffsets: Record<string, number>;
  /** Service and fare edits waiting for their minute, in order. */
  pendingTimed: TimedOp[];
  /** Disruption incidents (live + scheduled + resolved history). */
  incidents: Incident[];
  /** Timeline of simulation events (bounded). */
  events: IncidentEvent[];
  /** Effective closures derived from active incidents (recomputed per tick). */
  closures: DerivedClosures;
  /** Active-incident signature; road cache clears when it changes. */
  closureSig: string;
  nextIncidentId: number;
  emergencyBusesFree: number;
  /** One-shot threshold flags, cleared when no incident is active. */
  eventFlags: Record<string, boolean>;
}

/** The simulated day starts at 07:00. */
export const START_MIN = 7 * 60;

function emptyCounters(routeIds: string[]): TripCounters {
  const routeBoardings: Record<string, number> = {};
  for (const id of routeIds) routeBoardings[id] = 0;
  const routePeakOcc: Record<string, number> = {};
  for (const id of routeIds) routePeakOcc[id] = 0;
  const routeDenied: Record<string, number> = {};
  for (const id of routeIds) routeDenied[id] = 0;
  const routeVehKm: Record<string, number> = {};
  for (const id of routeIds) routeVehKm[id] = 0;
  const routeVehHr: Record<string, number> = {};
  for (const id of routeIds) routeVehHr[id] = 0;
  return {
    generated: 0,
    completed: 0,
    unrouted: 0,
    skippedCap: 0,
    totalTravelMin: 0,
    totalWaitMin: 0,
    totalTransfers: 0,
    boardingsTotal: 0,
    metroBoardings: 0,
    railBoardings: 0,
    busBoardings: 0,
    maxOccupancy01: 0,
    routeBoardings,
    routePeakOcc,
    routeDenied,
    routeVehKm,
    routeVehHr,
    deniedBoardings: 0,
    totalDelayMin: 0,
    rerouted: 0,
    strandedPeak: 0,
    strandedMin: 0,
    incidentDelayMin: 0,
    cancelledTrips: 0,
    revenueTotal: 0,
    revenueByMode: {},
    revenueByRoute: {},
  };
}

function initVehicles(
  routes: TransportRoute[],
  routeLengths: Map<string, number>,
  service: Record<string, ServicePlan>,
): VehicleState[] {
  const vehicles: VehicleState[] = [];
  let total = 0;
  for (const r of routes) {
    const plan = service[r.id];
    if (!plan) continue;
    const length = Math.max(1, routeLengths.get(r.id) ?? 1);
    // Fleet sized from the cycle at free speed; congestion degrades the
    // experienced headway live instead of spawning unlimited vehicles.
    const cycle = cycleMin(length, plan, r.stationIds.length, LOOP_ROUTES.has(r.id));
    const fleet = Math.min(12, resolvedFleet(plan, cycle, START_MIN));
    for (let i = 0; i < fleet && total < 64; i++) {
      vehicles.push({
        id: `veh-${r.id}-${i}`,
        routeId: r.id,
        s: ((i + 0.5) / Math.max(1, fleet)) * length,
        direction: i % 2 === 0 ? 1 : -1,
        load: 0,
        capacity: plan.vehicleCapacity,
        riders: [],
        dwellLeft: 0,
        trips: 0,
      });
      total++;
    }
  }
  return vehicles;
}

/** The next free `inc-N` number, so incidents created later never reuse an id a replayed one already holds. */
function nextIncidentNumber(configs: { id?: string }[]): number {
  let max = 0;
  for (const c of configs) {
    const n = /^inc-(\d+)$/.exec(c.id ?? '')?.[1];
    if (n) max = Math.max(max, Number(n));
  }
  return max + 1;
}

export function createSimulation(seed = 1337): SimulationState {
  const city = generateCity(seed);
  const net = buildNetwork();
  return createSimulationFromParts(seed, city, net);
}

/** Build a simulation from explicit city + network parts (base or scenario-modified). */
export function createSimulationFromParts(
  seed: number,
  city: CityData,
  net: {
    stations: Station[];
    routes: TransportRoute[];
    connections: Connection[];
    routeLengths: Map<string, number>;
    routeCumDist: Map<string, number[]>;
    service?: Record<string, ServicePlan>;
    incidents?: IncidentConfig[];
    fares?: FarePolicy;
    timed?: TimedOp[];
  },
  serviceOverrides?: Record<string, ServicePlan>,
): SimulationState {
  const stations = net.stations.map((s) => ({ ...s, routeIds: [...s.routeIds], modes: [...s.modes] }));
  const roadGraph = buildRoadGraph(city);
  const stationPos = new Map(stations.map((s) => [s.id, { x: s.pos.x, z: s.pos.z }]));
  const service: Record<string, ServicePlan> = {};
  for (const r of net.routes) {
    service[r.id] = serviceOverrides?.[r.id] ?? net.service?.[r.id] ?? defaultPlanFor(r);
  }
  const serviceOffsets: Record<string, number> = {};
  for (const r of net.routes) {
    const plan = service[r.id];
    if (plan) serviceOffsets[r.id] = phaseOffset(seed, r.id, plan);
  }
  return {
    seed,
    tick: 0,
    timeMinutes: START_MIN,
    city,
    stations,
    routes: net.routes.map((r) => ({ ...r, stationIds: [...r.stationIds] })),
    connections: net.connections.map((c) => ({ ...c })),
    routeLengths: new Map(net.routeLengths),
    routeCumDist: new Map(net.routeCumDist),
    vehicles: initVehicles(net.routes, net.routeLengths, service),
    passengers: [],
    demand: buildDemandMatrix(city.zones),
    rng: (seed ^ 0x51ab) | 0,
    nextPassengerId: 1,
    counters: emptyCounters(net.routes.map((r) => r.id)),
    roadGraph,
    edgeState: buildEdgeStates(roadGraph),
    cars: [],
    nextCarId: 1,
    fleetNonce: 0,
    recentTrips: [],
    roadCounters: emptyRoadCounters(),
    zoneRoadAccess: buildZoneRoadAccess(city),
    busRoadMap: buildBusRoadMap(net.routes, stationPos, roadGraph, city),
    roadCache: new Map(),
    busRouteCongestion: {},
    service,
    fares: net.fares ? { ...net.fares } : { ...DEFAULT_FARES },
    serviceOffsets,
    pendingTimed: (net.timed ?? []).map((op) => ({ ...op })),
    incidents: (net.incidents ?? []).map((cfg, i) => ({
      ...cfg,
      id: cfg.id || `inc-sched-${i}`,
      status: 'scheduled' as const,
      activeTicks: 0,
      baselineWaiting: 0,
      recovered90: false,
      strandedPeakDuringIncident: 0,
    })),
    events: [],
    closures: emptyClosures(),
    closureSig: '',
    nextIncidentId: nextIncidentNumber(net.incidents ?? []),
    emergencyBusesFree: 12,
    eventFlags: {},
  };
}

/** Advance the clock by dtMinutes. Deterministic; no wall-clock or Math.random. */
export function stepSimulation(state: SimulationState, dtMinutes = 1): SimulationState {
  // Timed edits fire at the first step where the clock has reached them. A live edit made between
  // steps at the same minute lands in exactly the same place, so live, headless and replay agree.
  while (state.pendingTimed.length > 0 && state.pendingTimed[0].atMin <= state.timeMinutes) {
    const op = state.pendingTimed.shift()!;
    if (op.type === 'setService') applyServicePatch(state, op.routeId, op.patch);
    else applyFares(state, op.fares);
  }
  // Disruptions first: lifecycle transitions, then effective closures.
  // A changed incident set invalidates cached road paths immediately.
  const lifecycleEvents = updateIncidentLifecycle(state, dtMinutes);
  state.closures = deriveClosures(state.incidents, state.routes);
  const sig = closureSignature(state.incidents);
  if (sig !== state.closureSig) {
    state.closureSig = sig;
    state.roadCache.clear();
  }
  // SimulationState structurally satisfies both worlds. Traffic moves first so
  // passenger mode choice reads fresh congestion; passengers then spawn,
  // board, and ride (buses already slowed by road conditions).
  advanceTraffic(state, dtMinutes);
  advancePassengers(state, dtMinutes);
  const thresholdEvents = detectThresholdEvents(state);
  pushEvents(state, lifecycleEvents);
  pushEvents(state, thresholdEvents);
  return {
    ...state,
    tick: state.tick + 1,
    timeMinutes: state.timeMinutes + dtMinutes,
  };
}

/** Bounded timeline log (deterministic order). */
function pushEvents(state: SimulationState, events: IncidentEvent[]): void {
  for (const e of events) {
    state.events.push(e);
    while (state.events.length > 200) state.events.shift();
  }
}

export function stationLoad01(st: Station): number {
  return Math.min(1, st.waiting / Math.max(1, st.capacityPerHr * 0.25));
}

export function formatClock(timeMinutes: number): string {
  const h = Math.floor(timeMinutes / 60) % 24;
  const m = Math.floor(timeMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
