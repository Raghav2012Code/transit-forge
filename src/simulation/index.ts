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
  VehicleState,
} from '../types/index.ts';
import { generateCity } from './city/generateCity.ts';
import { buildNetwork } from './transport/network.ts';
import { mulberry32 } from './city/seededRng.ts';
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
  roadCounters: RoadCounters;
  zoneRoadAccess: Record<string, string>;
  busRoadMap: Record<string, string[]>;
  roadCache: Map<string, { edgeIds: string[]; nodes: string[]; totalMin: number; computedAt: number }>;
  busRouteCongestion: Record<string, number>;
}

const START_MIN = 7 * 60;

function emptyCounters(routeIds: string[]): TripCounters {
  const routeBoardings: Record<string, number> = {};
  for (const id of routeIds) routeBoardings[id] = 0;
  const routePeakOcc: Record<string, number> = {};
  for (const id of routeIds) routePeakOcc[id] = 0;
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
  };
}

function initVehicles(routes: TransportRoute[], routeLengths: Map<string, number>, seed: number): VehicleState[] {
  const rand = mulberry32(seed ^ 0x9e37);
  const vehicles: VehicleState[] = [];
  for (const r of routes) {
    const count = r.mode === 'bus' ? 1 : 2;
    const length = Math.max(1, routeLengths.get(r.id) ?? 1);
    for (let i = 0; i < count; i++) {
      vehicles.push({
        id: `veh-${r.id}-${i}`,
        routeId: r.id,
        s: rand() * length,
        direction: rand() > 0.5 ? 1 : -1,
        load: 0,
        capacity: r.vehicleCapacity,
        riders: [],
      });
    }
  }
  return vehicles;
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
  },
): SimulationState {
  const stations = net.stations.map((s) => ({ ...s, routeIds: [...s.routeIds], modes: [...s.modes] }));
  const roadGraph = buildRoadGraph(city);
  const stationPos = new Map(stations.map((s) => [s.id, { x: s.pos.x, z: s.pos.z }]));
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
    vehicles: initVehicles(net.routes, net.routeLengths, seed),
    passengers: [],
    demand: buildDemandMatrix(city.zones),
    rng: (seed ^ 0x51ab) | 0,
    nextPassengerId: 1,
    counters: emptyCounters(net.routes.map((r) => r.id)),
    roadGraph,
    edgeState: buildEdgeStates(roadGraph),
    cars: [],
    nextCarId: 1,
    roadCounters: emptyRoadCounters(),
    zoneRoadAccess: buildZoneRoadAccess(city),
    busRoadMap: buildBusRoadMap(net.routes, stationPos, roadGraph, city),
    roadCache: new Map(),
    busRouteCongestion: {},
  };
}

/** Advance the clock by dtMinutes. Deterministic; no wall-clock or Math.random. */
export function stepSimulation(state: SimulationState, dtMinutes = 1): SimulationState {
  // SimulationState structurally satisfies both worlds. Traffic moves first so
  // passenger mode choice reads fresh congestion; passengers then spawn,
  // board, and ride (buses already slowed by road conditions).
  advanceTraffic(state, dtMinutes);
  advancePassengers(state, dtMinutes);
  return {
    ...state,
    tick: state.tick + 1,
    timeMinutes: state.timeMinutes + dtMinutes,
  };
}

export function stationLoad01(st: Station): number {
  return Math.min(1, st.waiting / Math.max(1, st.capacityPerHr * 0.25));
}

export function formatClock(timeMinutes: number): string {
  const h = Math.floor(timeMinutes / 60) % 24;
  const m = Math.floor(timeMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
