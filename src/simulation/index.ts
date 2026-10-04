// Simulation core: pure TS, no React / Three.js. Owns city, network, demand,
// passengers, vehicles, clock, and counters.
import type {
  CityData,
  Connection,
  Passenger,
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
}

const START_MIN = 7 * 60;

function emptyCounters(routeIds: string[]): TripCounters {
  const routeBoardings: Record<string, number> = {};
  for (const id of routeIds) routeBoardings[id] = 0;
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
  const stations = net.stations.map((s) => ({ ...s }));
  return {
    seed,
    tick: 0,
    timeMinutes: START_MIN,
    city,
    stations,
    routes: net.routes,
    connections: net.connections,
    routeLengths: net.routeLengths,
    routeCumDist: net.routeCumDist,
    vehicles: initVehicles(net.routes, net.routeLengths, seed),
    passengers: [],
    demand: buildDemandMatrix(city.zones),
    rng: (seed ^ 0x51ab) | 0,
    nextPassengerId: 1,
    counters: emptyCounters(net.routes.map((r) => r.id)),
  };
}

/** Advance the clock by dtMinutes. Deterministic; no wall-clock or Math.random. */
export function stepSimulation(state: SimulationState, dtMinutes = 1): SimulationState {
  // SimulationState structurally satisfies PassengerWorld; passengers,
  // vehicles, stations, and counters mutate in place (high churn), while the
  // returned shell is new so UI snapshots still trigger renders.
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
