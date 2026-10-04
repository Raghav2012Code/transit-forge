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
  // --- City-growth state (v0.8). Mutated by growth steps, reset with the sim.
  students: number;
  households: number;
  /** Maximum supportable population / jobs (capacity clamp). */
  capacityPop: number;
  capacityJobs: number;
  /** Developed share of capacity, 0..1 (drives diminishing returns). */
  developed01: number;
  /** Development attractiveness, 0..100. */
  attractiveness: number;
  /** Current accessibility score, 0..100 (from analytics). */
  accessScore: number;
  /** Lagged accessibility memory (infrastructure lag). */
  accessMem: number;
  /** Last computed yearly growth rates (display). */
  popGrowthRate: number;
  jobGrowthRate: number;
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
  transfersDay: number;
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
  /** Remaining dwell at a station (min). Vehicle holds while > 0. */
  dwellLeft: number;
  /** Completed one-way trips (drives deterministic reliability draws). */
  trips: number;
}

export type PassengerState = 'WALKING' | 'WAITING' | 'ON_VEHICLE' | 'TRANSFERRING' | 'ARRIVED';

/** One ride between two stations on a single route (no transfers inside). */
export interface Leg {
  board: string;
  alight: string;
  routeId: string;
}

export type TripPurpose = 'work' | 'education' | 'shopping' | 'leisure' | 'airport' | 'industrial' | 'other';

export interface Passenger {
  id: number;
  originZone: string;
  destZone: string;
  purpose: TripPurpose;
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
  routePeakOcc: Record<string, number>;
  routeDenied: Record<string, number>;
  routeVehKm: Record<string, number>;
  routeVehHr: Record<string, number>;
  deniedBoardings: number;
  totalDelayMin: number;
}

export type CongestionLevel = 'free' | 'light' | 'moderate' | 'heavy' | 'severe';

/** Live simulation state of one road edge (static geometry stays in CityData). */
export interface RoadEdgeState {
  id: string;
  /** Simulated cars currently on the segment. */
  load: number;
  /** Current travel time in minutes (BPR-adjusted). */
  currentMin: number;
  /** Volume/capacity ratio including background flow. */
  vc: number;
  level: CongestionLevel;
}

export type CarState = 'DRIVING' | 'DONE';

export interface CarTrip {
  id: number;
  originZone: string;
  destZone: string;
  purpose: TripPurpose;
  departMin: number;
  state: CarState;
  /** Ordered road edge ids from origin access node to destination access node. */
  edgeIds: string[];
  /** Ordered node ids aligned with edgeIds (nodes[i] -> nodes[i+1] via edgeIds[i]). */
  nodes: string[];
  edgeIndex: number;
  /** Progress along the current edge in meters. */
  s: number;
  arriveMin: number | null;
  travelMin: number;
}

export interface RoadCounters {
  generated: number;
  completed: number;
  totalTravelMin: number;
  /** Cumulative bus vehicle-minutes lost to congestion (for stats/debug). */
  busDelayMin: number;
  maxVC: number;
  maxVCEdge: string;
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
  roadTrips: number;
  roadCompleted: number;
  activeCars: number;
  avgRoadMin: number;
  avgCongestion: number;
  worstRoad: string;
  worstVC: number;
  transitShare: number;
  carShare: number;
  avgTransitMin: number;
  deniedBoardings: number;
  avgOcc: number;
  vehKm: number;
  vehHr: number;
  opCost: number;
  opCostPerPax: number;
  avgHeadway: number;
  totalDelayMin: number;
}
