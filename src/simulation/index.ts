// Simulation core: pure TS, no React / Three.js. Owns city, network, vehicles,
// clock, and lightweight passenger counts (full OD demand arrives next milestone).
import type {
  CityData,
  Connection,
  Station,
  TransportRoute,
  VehicleState,
} from '../types/index.ts';
import { generateCity } from './city/generateCity.ts';
import { buildNetwork } from './transport/network.ts';
import { mulberry32 } from './city/seededRng.ts';

export interface SimulationState {
  seed: number;
  tick: number;
  timeMinutes: number;
  city: CityData;
  stations: Station[];
  routes: TransportRoute[];
  connections: Connection[];
  routeLengths: Map<string, number>;
  vehicles: VehicleState[];
}

const START_MIN = 7 * 60;
const LOOP_ROUTES = new Set(['rt-b1']);

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
    vehicles: initVehicles(net.routes, net.routeLengths, seed),
  };
}

/** Advance the clock by dtMinutes. Deterministic; no wall-clock or Math.random. */
export function stepSimulation(state: SimulationState, dtMinutes = 1): SimulationState {
  const stations = state.stations.map((s) => ({ ...s }));
  const byId = new Map(stations.map((s) => [s.id, s]));
  const routeById = new Map(state.routes.map((r) => [r.id, r]));

  // Background demand trickle: peak around 8:30, scaled per station capacity.
  const t = state.timeMinutes;
  const peak = Math.exp(-Math.pow(t - 510, 2) / (2 * 75 * 75));
  const demandRate = 0.6 + peak * 2.2; // pax per min per 1000 capacity
  for (const st of stations) {
    const arrivals = (st.capacityPerHr / 1000) * demandRate * dtMinutes * 0.12;
    st.waiting += arrivals;
  }

  const vehicles = state.vehicles.map((vv) => {
    const route = routeById.get(vv.routeId);
    if (!route) return { ...vv };
    const length = Math.max(1, state.routeLengths.get(route.id) ?? 1);
    const speedMpm = (route.speedKph * 1000) / 60;
    let s = vv.s + speedMpm * dtMinutes * vv.direction;
    let direction = vv.direction;
    if (LOOP_ROUTES.has(route.id)) {
      s = ((s % length) + length) % length;
    } else {
      if (s >= length) { s = length - (s - length); direction = -1; }
      if (s <= 0) { s = -s; direction = 1; }
    }
    // Boarding: each vehicle picks up a share of waiting at its nearest station.
    const nearest = nearestStationOnRoute(stations, route, s, length);
    let load = vv.load;
    if (nearest) {
      const st = byId.get(nearest);
      if (st) {
        const space = Math.max(0, vv.capacity - load);
        const take = Math.min(space, st.waiting * 0.25, 60 * dtMinutes);
        st.waiting -= take;
        st.boardedDay += take;
        load += take * 0.5; // rest alight downstream; keeps loads lively but bounded
        load = Math.min(vv.capacity, load);
        if (vv.direction !== direction) load *= 0.4; // terminus alighting
      }
    }
    return { ...vv, s, direction, load: Math.round(load) };
  });

  return {
    ...state,
    tick: state.tick + 1,
    timeMinutes: state.timeMinutes + dtMinutes,
    stations,
    vehicles,
  };
}

function nearestStationOnRoute(
  stations: Station[],
  route: TransportRoute,
  s: number,
  totalLength: number,
): string | null {
  if (route.stationIds.length === 0 || totalLength <= 0) return null;
  // Approximate: stations evenly spaced along route length.
  const n = route.stationIds.length;
  const idx = Math.max(0, Math.min(n - 1, Math.round((s / totalLength) * (n - 1))));
  const stationId = route.stationIds[idx];
  return stations.some((st) => st.id === stationId) ? stationId : null;
}

export function stationLoad01(st: Station): number {
  return Math.min(1, st.waiting / Math.max(1, st.capacityPerHr * 0.25));
}

export function formatClock(timeMinutes: number): string {
  const h = Math.floor(timeMinutes / 60) % 24;
  const m = Math.floor(timeMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
