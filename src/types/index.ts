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
  alightedDay: number;
  peakWaiting: number;
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
  /** Active passenger ids currently onboard. */
  riders: number[];
}

export type PassengerState = 'WALKING' | 'WAITING' | 'ON_VEHICLE' | 'TRANSFERRING' | 'ARRIVED';

/** One ride between two stations on a single route (no transfers inside). */
export interface Leg {
  board: string;
  alight: string;
  routeId: string;
}

export interface Passenger {
  id: number;
  originZone: string;
  destZone: string;
  departMin: number;
  state: PassengerState;
  legs: Leg[];
  legIndex: number;
  atStation: string | null;
  vehicleId: string | null;
  /** Minutes spent waiting (platform + transfer) so far. */
  waitMin: number;
  /** Total journey minutes, set on arrival (includes walk + wait + ride). */
  travelMin: number;
  /** Access walk minutes still remaining (WALKING state). */
  walkLeft: number;
  /** Transfer penalty minutes still remaining (TRANSFERRING state). */
  transferLeft: number;
  transfers: number;
  arriveMin: number | null;
}

/** Day-long aggregate counters, updated incrementally by the step function. */
export interface TripCounters {
  generated: number;
  completed: number;
  unrouted: number;
  skippedCap: number;
  totalTravelMin: number;
  totalWaitMin: number;
  totalTransfers: number;
  boardingsTotal: number;
  metroBoardings: number;
  railBoardings: number;
  busBoardings: number;
  maxOccupancy01: number;
  routeBoardings: Record<string, number>;
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
  generated: number;
  completed: number;
  activeNow: number;
  waitingNow: number;
  onboardNow: number;
  avgTravelMin: number;
  avgWaitMin: number;
  avgTransfers: number;
  boardingsTotal: number;
  metroShare: number;
  railShare: number;
  busShare: number;
  topStation: string;
  topStationCount: number;
  crowdedStation: string;
  crowdedCount: number;
  topRoute: string;
  topRouteCount: number;
  maxOccupancy: number;
}
