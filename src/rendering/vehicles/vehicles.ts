import * as THREE from 'three';
import type { Station, TransportMode, TransportRoute, VehicleState } from '../../types/index.ts';
import { routeCurve } from '../transport/buildNetwork.ts';
import type { TrackCurve } from '../transport/trackPath.ts';
import { merge } from '../transport/sweep.ts';
import { buildSchedule, type Schedule } from './schedule.ts';

export interface RoutePath {
  /** The alignment the line is drawn on; null for a route with fewer than two stops. */
  curve: TrackCurve | null;
  total: number;
}

export interface VehicleRig {
  group: THREE.Group;
  meshById: Map<string, THREE.Mesh>;
  segmentsByRoute: Map<string, RoutePath>;
  /** One consist per mode and line colour: the colour is painted into the vertices. */
  geometries: Map<string, THREE.BufferGeometry>;
  schedules: Map<string, { cycle: number; curve: TrackCurve; schedule: Schedule }>;
}

interface Consist {
  cars: number;
  length: number;
  width: number;
  height: number;
}

const CONSIST: Record<TransportMode, Consist> = {
  metro: { cars: 3, length: 7.6, width: 2.8, height: 3.2 },
  rail: { cars: 4, length: 8.4, width: 3.0, height: 3.5 },
  bus: { cars: 1, length: 7.6, width: 2.6, height: 3.1 },
  road: { cars: 1, length: 4, width: 2, height: 1.6 },
};
/** How far the wheels sit above the path: the thickness of the painted band. */
const RIDE: Record<TransportMode, number> = { metro: 0.5, rail: 0.5, bus: 0.1, road: 0 };
const COUPLING = 0.4;

function box(w: number, h: number, d: number, y: number, z: number, rgb: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y + h / 2, z);
  const out = g.toNonIndexed();
  const n = out.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = rgb.r;
    col[i * 3 + 1] = rgb.g;
    col[i * 3 + 2] = rgb.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const BODY = new THREE.Color(0xe9edf2);
const GLASS = new THREE.Color(0x2a3140);
const ROOF = new THREE.Color(0xc4cbd6);
const RUNNING = new THREE.Color(0x3b4250);

/**
 * One consist, long axis +z, wheels on y = 0, centred on its length. Pale
 * body, dark glazing, and the line's colour as a stripe and a cab band, the
 * way a real fleet wears its livery, so a train never vanishes into its line.
 */
function consistGeometry(mode: TransportMode, line: THREE.Color): THREE.BufferGeometry {
  const c = CONSIST[mode];
  const total = c.cars * c.length + (c.cars - 1) * COUPLING;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < c.cars; i++) {
    const z = -total / 2 + c.length / 2 + i * (c.length + COUPLING);
    const body = c.height * 0.58;
    parts.push(box(c.width, body, c.length, 0.4, z, BODY));
    parts.push(box(c.width + 0.06, 0.34, c.length - 0.1, 0.62, z, line));
    parts.push(box(c.width + 0.05, c.height * 0.26, c.length - 1.1, 0.4 + body, z, GLASS));
    parts.push(box(c.width * 0.84, 0.28, c.length - 0.2, 0.4 + body + c.height * 0.26, z, ROOF));
    for (const off of [-1, 1]) {
      parts.push(box(c.width * 0.7, 0.42, 2, 0, z + off * (c.length / 2 - 1.6), RUNNING));
      if (i === 0 && off === -1 || i === c.cars - 1 && off === 1) {
        // Cab end: a band of line colour across the nose.
        parts.push(box(c.width + 0.08, c.height * 0.26, 0.5, 0.4 + body, z + off * (c.length / 2 - 0.3), line));
      }
    }
  }
  for (let i = 0; i < c.cars - 1; i++) {
    const z = -total / 2 + c.length + COUPLING / 2 + i * (c.length + COUPLING);
    parts.push(box(c.width * 0.8, c.height * 0.5, COUPLING + 0.1, 0.5, z, RUNNING));
  }
  return merge(parts);
}

/** Path entry for one route; shared by the initial build and live sync. */
export function buildRoutePath(route: TransportRoute, byId: Map<string, Station>): RoutePath {
  const curve = routeCurve(route, byId);
  return { curve, total: curve?.length ?? 1 };
}

function vehicleMesh(rig: VehicleRig, v: VehicleState, route: TransportRoute | undefined): THREE.Mesh {
  const mode = route?.mode ?? 'bus';
  const color = route?.color ?? '#ffffff';
  const key = `${mode}:${color}`;
  let geo = rig.geometries.get(key);
  if (!geo) {
    geo = consistGeometry(mode, new THREE.Color(color));
    rig.geometries.set(key, geo);
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.1 }),
  );
  mesh.castShadow = true;
  mesh.userData = { kind: 'vehicle', id: v.id, mode };
  return mesh;
}

export function buildVehicles(
  vehicles: VehicleState[],
  routes: TransportRoute[],
  stations: Station[],
): VehicleRig {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const rig: VehicleRig = { group, meshById: new Map(), segmentsByRoute: new Map(), geometries: new Map(), schedules: new Map() };
  const byId = new Map(stations.map((s) => [s.id, s]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  for (const route of routes) rig.segmentsByRoute.set(route.id, buildRoutePath(route, byId));
  for (const v of vehicles) {
    const mesh = vehicleMesh(rig, v, routeById.get(v.routeId));
    group.add(mesh);
    rig.meshById.set(v.id, mesh);
  }
  return rig;
}

/**
 * Reconcile meshes with the live vehicle list (fleet changes add/remove).
 * Also builds path entries for routes the rig has never seen (e.g. replacement
 * shuttles deployed mid-day), so those vehicles are visible and on their line.
 */
export function syncVehicleMeshes(
  rig: VehicleRig,
  vehicles: VehicleState[],
  routes: TransportRoute[],
  stations: Station[],
): void {
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const byId = new Map(stations.map((s) => [s.id, s]));
  for (const v of vehicles) {
    if (!rig.segmentsByRoute.has(v.routeId)) {
      const route = routeById.get(v.routeId);
      if (route) rig.segmentsByRoute.set(v.routeId, buildRoutePath(route, byId));
    }
  }
  const live = new Set(vehicles.map((v) => v.id));
  for (const [id, mesh] of rig.meshById) {
    if (!live.has(id)) {
      rig.group.remove(mesh);
      (mesh.material as THREE.Material).dispose(); // geometry is shared per mode
      rig.meshById.delete(id);
    }
  }
  for (const v of vehicles) {
    if (rig.meshById.has(v.id)) continue;
    const mesh = vehicleMesh(rig, v, routeById.get(v.routeId));
    rig.group.add(mesh);
    rig.meshById.set(v.id, mesh);
  }
}

const tmpP = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** The service book as far as the renderer needs it: the headway each line is run to. */
export type Headways = Record<string, { peakHeadwayMin: number } | undefined>;

/** Out-and-back time of a line's service: its fleet times its headway, from the simulation. */
function cycleOf(route: TransportRoute | undefined, plan: Headways[string], fleet: number): number {
  return Math.max(2, fleet * (plan?.peakHeadwayMin ?? route?.headwayMin ?? 6));
}

/**
 * Place vehicles on their lines for the clock `clockMin` (clock minutes; see
 * `VisualClock`). Each line's fleet is spread evenly around the line's
 * service cycle, and each vehicle follows the line's schedule: stopped at
 * platforms, accelerating and braking between them. Position is a function of
 * the clock alone, so motion is smooth at any frame rate and any run speed.
 * Heading is the chord across the vehicle's own length, so it turns with the
 * track rather than cutting across it.
 */
export function updateVehicles(
  rig: VehicleRig,
  vehicles: VehicleState[],
  routes: TransportRoute[],
  clockMin: number,
  service: Headways = {},
  suspended: ReadonlySet<string> = new Set(),
): void {
  const byRoute = new Map<string, VehicleState[]>();
  for (const v of vehicles) {
    const list = byRoute.get(v.routeId);
    if (list) list.push(v);
    else byRoute.set(v.routeId, [v]);
  }
  const routeById = new Map(routes.map((r) => [r.id, r]));
  for (const [routeId, fleet] of byRoute) {
    const curve = rig.segmentsByRoute.get(routeId)?.curve;
    if (!curve) continue;
    const cycle = cycleOf(routeById.get(routeId), service[routeId], fleet.length);
    let entry = rig.schedules.get(routeId);
    if (!entry || entry.cycle !== cycle || entry.curve !== curve) {
      entry = { cycle, curve, schedule: buildSchedule(curve.knots, cycle) };
      rig.schedules.set(routeId, entry);
    }
    const { schedule } = entry;
    fleet.sort((a, b) => (a.id < b.id ? -1 : 1));
    fleet.forEach((v, k) => {
      const mesh = rig.meshById.get(v.id);
      if (!mesh) return;
      // A suspended line holds its trains where they are: skip re-placement
      // (the schedule is clock-driven, so service resumes seamlessly). A
      // vehicle never placed before is positioned once, so it never sits at
      // the origin.
      if (suspended.has(routeId) && mesh.userData.init) return;
      const mode = mesh.userData.mode as TransportMode;
      const c = CONSIST[mode];
      const span = c.cars * c.length + (c.cars - 1) * COUPLING;
      const here = schedule.at(clockMin + (k * schedule.cycle) / fleet.length);
      // Half a body length each side keeps the front and rear on the track.
      const half = Math.min(span / 2, curve.length / 2);
      const mid = Math.min(Math.max(here.arc, half), curve.length - half);
      curve.pointAtArc(mid - half, tmpA);
      curve.pointAtArc(mid + half, tmpB);
      curve.pointAtArc(here.arc, tmpP);
      let dx = tmpB.x - tmpA.x;
      let dz = tmpB.z - tmpA.z;
      if (here.dir !== 1) {
        dx = -dx;
        dz = -dz;
      }
      mesh.position.set(tmpP.x, tmpP.y + RIDE[mode], tmpP.z);
      if (Math.hypot(dx, dz) > 1e-6) mesh.rotation.y = Math.atan2(dx, dz);
      mesh.userData.init = true;
    });
  }
}
