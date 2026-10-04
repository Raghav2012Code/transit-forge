// Shared domain contracts. Simulation owns the data; rendering + UI consume it.
// Keep plain-data only (no classes) so the sim stays Worker-ready.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type DistrictKind =
  | 'cbd'
  | 'residential'
  | 'industrial'
  | 'university'
  | 'airport'
  | 'harbor'
  | 'suburban';

export type TransportMode = 'metro' | 'rail' | 'bus' | 'road';

export interface Zone {
  id: string;
  name: string;
  kind: DistrictKind;
  center: Vec3;
  radius: number;
  population: number;
  jobs: number;
}

export interface RoadNode {
  id: string;
  pos: Vec3;
}

export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  lengthM: number;
  lanes: number;
  isBridge: boolean;
  isArterial: boolean;
}

export interface Station {
  id: string;
  name: string;
  pos: Vec3;
  modes: TransportMode[];
  routeIds: string[];
  capacityPerHr: number;
  waiting: number;
  boardedDay: number;
}

export interface TransportRoute {
  id: string;
  name: string;
  mode: TransportMode;
  color: string;
  stationIds: string[];
  headwayMin: number;
  speedKph: number;
  vehicleCapacity: number;
}

export interface Connection {
  from: string;
  to: string;
  mode: TransportMode;
  routeId: string | null;
  distM: number;
  timeMin: number;
  capacityPerHr: number;
}

export interface VehicleState {
  id: string;
  routeId: string;
  /** Distance along route in meters (loops for bus/ring, ping-pong otherwise). */
  s: number;
  direction: 1 | -1;
  load: number;
  capacity: number;
}

export interface PassengerCounts {
  waitingTotal: number;
  boardedDay: number;
  avgWaitMin: number;
}

export interface CityData {
  zones: Zone[];
  roadNodes: RoadNode[];
  roadEdges: RoadEdge[];
  buildings: Building[];
  river: Vec3[];
  bridges: { id: string; a: Vec3; b: Vec3 }[];
}

export interface Building {
  pos: Vec3;
  w: number;
  d: number;
  h: number;
  district: DistrictKind;
}

export interface SimStats {
  population: number;
  jobs: number;
  stationCount: number;
  routeCount: number;
  vehicleCount: number;
  waitingTotal: number;
  boardedDay: number;
  avgWaitMin: number;
}
