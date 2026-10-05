// Initial transport network. Hand-authored coordinates anchored to city zones
// so geography stays recognizable. All lines exist here as data first;
// rendering derives meshes from this model.
import type { Connection, Station, TransportMode, TransportRoute, Vec3 } from '../../types/index.ts';
import type { FarePolicy } from '../economics/fares.ts';

function v(x: number, z: number): Vec3 {
  return { x, y: 0, z };
}

function distM(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

interface StationSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  capacityPerHr: number;
}

const STATION_SPECS: StationSpec[] = [
  { id: 'st-north-res', name: 'North Residences', x: -40, z: -260, capacityPerHr: 4000 },
  { id: 'st-mid-north', name: 'Mid North', x: -20, z: -140, capacityPerHr: 3000 },
  { id: 'st-central', name: 'Central Interchange', x: 0, z: 0, capacityPerHr: 20000 },
  { id: 'st-park-east', name: 'East Park', x: 90, z: -90, capacityPerHr: 3000 },
  { id: 'st-university', name: 'University', x: 170, z: -190, capacityPerHr: 6000 },
  { id: 'st-west-res', name: 'West Residences', x: -220, z: -60, capacityPerHr: 4000 },
  { id: 'st-west-mid', name: 'West Mid', x: -120, z: -30, capacityPerHr: 3000 },
  { id: 'st-old-town', name: 'Old Town', x: -130, z: 100, capacityPerHr: 3500 },
  { id: 'st-harbor', name: 'Harbor', x: -260, z: 210, capacityPerHr: 5000 },
  { id: 'st-ne-suburb', name: 'NE Suburb', x: 330, z: -300, capacityPerHr: 3500 },
  { id: 'st-east-res', name: 'East Residences', x: 250, z: -140, capacityPerHr: 4000 },
  { id: 'st-airport', name: 'Aurora Airport', x: 470, z: -40, capacityPerHr: 8000 },
  { id: 'st-industrial', name: 'East Industrial', x: 300, z: 170, capacityPerHr: 6000 },
  { id: 'st-south-sub', name: 'South Suburbs', x: 40, z: 300, capacityPerHr: 4000 },
];

interface RouteSpec {
  id: string;
  name: string;
  mode: TransportMode;
  color: string;
  stationIds: string[];
  headwayMin: number;
  speedKph: number;
  vehicleCapacity: number;
}

const ROUTE_SPECS: RouteSpec[] = [
  {
    id: 'rt-m1', name: 'M1 Metro Blue', mode: 'metro', color: '#1b6fc4',
    stationIds: ['st-north-res', 'st-mid-north', 'st-central', 'st-park-east', 'st-university'],
    headwayMin: 5, speedKph: 32, vehicleCapacity: 800,
  },
  {
    id: 'rt-m2', name: 'M2 Metro Green', mode: 'metro', color: '#0e7a52',
    stationIds: ['st-west-res', 'st-west-mid', 'st-central', 'st-old-town', 'st-harbor'],
    headwayMin: 5, speedKph: 32, vehicleCapacity: 800,
  },
  {
    id: 'rt-r1', name: 'R1 Suburban Rail', mode: 'rail', color: '#c0392f',
    stationIds: ['st-ne-suburb', 'st-east-res', 'st-airport', 'st-industrial', 'st-south-sub', 'st-central'],
    headwayMin: 10, speedKph: 55, vehicleCapacity: 900,
  },
  {
    id: 'rt-b1', name: 'B1 Harbor Bus', mode: 'bus', color: '#e0a21a',
    stationIds: ['st-central', 'st-old-town', 'st-harbor', 'st-south-sub'],
    headwayMin: 12, speedKph: 18, vehicleCapacity: 70,
  },
  {
    id: 'rt-b2', name: 'B2 Campus Bus', mode: 'bus', color: '#6d4bb8',
    stationIds: ['st-central', 'st-park-east', 'st-university', 'st-east-res'],
    headwayMin: 12, speedKph: 18, vehicleCapacity: 70,
  },
  {
    id: 'rt-b3', name: 'B3 Crosstown Bus', mode: 'bus', color: '#c14b78',
    stationIds: ['st-west-res', 'st-west-mid', 'st-central', 'st-east-res', 'st-industrial'],
    headwayMin: 15, speedKph: 18, vehicleCapacity: 70,
  },
];

export interface NetworkData {
  stations: Station[];
  routes: TransportRoute[];
  connections: Connection[];
  routeLengths: Map<string, number>;
  /** Cumulative station distances (meters) per route, aligned with stationIds. */
  routeCumDist: Map<string, number[]>;
  /** Fare policy override (absent = free-transit default at sim build). */
  fares?: FarePolicy;
}

export function buildNetwork(): NetworkData {
  const pos = new Map(STATION_SPECS.map((s) => [s.id, v(s.x, s.z)]));
  const routeByStation = new Map<string, string[]>();
  const modeByStation = new Map<string, Set<TransportMode>>();

  for (const r of ROUTE_SPECS) {
    for (const sid of r.stationIds) {
      if (!routeByStation.has(sid)) routeByStation.set(sid, []);
      routeByStation.get(sid)?.push(r.id);
      if (!modeByStation.has(sid)) modeByStation.set(sid, new Set());
      modeByStation.get(sid)?.add(r.mode);
    }
  }

  const stations: Station[] = STATION_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    pos: pos.get(s.id) ?? v(0, 0),
    modes: [...(modeByStation.get(s.id) ?? new Set<TransportMode>())],
    routeIds: routeByStation.get(s.id) ?? [],
    capacityPerHr: s.capacityPerHr,
    waiting: 0,
    boardedDay: 0,
    alightedDay: 0,
    peakWaiting: 0,
    transfersDay: 0,
  }));

  const connections: Connection[] = [];
  const routeLengths = new Map<string, number>();
  const routeCumDist = new Map<string, number[]>();
  for (const r of ROUTE_SPECS) {
    const built = connectionsForRoute(
      { id: r.id, mode: r.mode, stationIds: r.stationIds, speedKph: r.speedKph, headwayMin: r.headwayMin, vehicleCapacity: r.vehicleCapacity },
      pos,
    );
    connections.push(...built.connections);
    // Loop length for bus routes that visually loop (B1); others ping-pong.
    routeLengths.set(r.id, built.length);
    routeCumDist.set(r.id, built.cum);
  }

  const routes: TransportRoute[] = ROUTE_SPECS.map((r) => ({ ...r }));

  return { stations, routes, connections, routeLengths, routeCumDist };
}

/** Connections + length + cumulative distances for one ordered station list. */
export function connectionsForRoute(
  route: { id: string; mode: TransportMode; stationIds: string[]; speedKph: number; headwayMin: number; vehicleCapacity: number },
  pos: Map<string, Vec3>,
): { connections: Connection[]; length: number; cum: number[] } {
  const connections: Connection[] = [];
  let length = 0;
  const cum: number[] = [0];
  for (let i = 0; i < route.stationIds.length - 1; i++) {
    const a = pos.get(route.stationIds[i]);
    const b = pos.get(route.stationIds[i + 1]);
    if (!a || !b) continue;
    const d = distM(a, b);
    length += d;
    cum.push(length);
    // Travel time + 0.5 min dwell per hop; capacity from frequency * vehicle size.
    const timeMin = (d / 1000 / route.speedKph) * 60 + 0.5;
    const capacityPerHr = Math.round((60 / route.headwayMin) * route.vehicleCapacity);
    connections.push({ from: route.stationIds[i], to: route.stationIds[i + 1], mode: route.mode, routeId: route.id, distM: d, timeMin, capacityPerHr });
    connections.push({ from: route.stationIds[i + 1], to: route.stationIds[i], mode: route.mode, routeId: route.id, distM: d, timeMin, capacityPerHr });
  }
  return { connections, length, cum };
}

/** Structural validation used by tests and future editors. */
export function validateNetwork(net: NetworkData): string[] {
  const errors: string[] = [];
  const stationIds = new Set(net.stations.map((s) => s.id));
  for (const r of net.routes) {
    for (const sid of r.stationIds) {
      if (!stationIds.has(sid)) errors.push(`route ${r.id} references missing station ${sid}`);
    }
    for (let i = 0; i < r.stationIds.length - 1; i++) {
      const ok = net.connections.some(
        (c) => c.routeId === r.id && c.from === r.stationIds[i] && c.to === r.stationIds[i + 1],
      );
      if (!ok) errors.push(`route ${r.id} missing connection ${r.stationIds[i]} -> ${r.stationIds[i + 1]}`);
    }
  }
  return errors;
}
