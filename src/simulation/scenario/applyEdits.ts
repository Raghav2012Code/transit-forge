// Pure application of scenario ops onto base city + network.
// Never throws on user ops: invalid references are skipped with warnings so
// the simulation cannot enter an invalid state.
import type {
  CityData,
  Connection,
  Station,
  TransportRoute,
  Vec3,
} from '../../types/index.ts';
import { connectionsForRoute, type NetworkData } from '../transport/network.ts';
import { defaultPlanFor } from '../service/servicePlan.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import { COST_RATES, mergeServicePatch, sanitizeServicePatch, type EditOp, type RoadKind } from './scenario.ts';
import { DEFAULT_FARES, sanitizeFares, type FarePolicy } from '../economics/fares.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';

export interface ModifiedNetwork {
  stations: Station[];
  routes: TransportRoute[];
  connections: Connection[];
  routeLengths: Map<string, number>;
  routeCumDist: Map<string, number[]>;
  city: CityData;
  cost: number;
  warnings: string[];
  /** Operating configuration per surviving route (defaults + setService ops). */
  service: Record<string, ServicePlan>;
  /** Fare policy (DEFAULT_FARES unless a setFares op says otherwise). */
  fares: FarePolicy;
  /** Scheduled incidents from scheduleIncident ops (validated). */
  incidents: IncidentConfig[];
}

/** Validate an incident config against a network; returns problem strings. */
export function validateIncidentConfig(
  inc: IncidentConfig,
  stationIds: Set<string>,
  routeIds: Set<string>,
  edgeIds: Set<string>,
): string[] {
  const problems: string[] = [];
  if (inc.durationMin < 5 || inc.durationMin > 600) problems.push('duration must be 5–600 min');
  if (inc.startMin < 0 || inc.startMin >= 1440) problems.push('start must be within the day');
  switch (inc.kind) {
    case 'station-closure':
      if (!inc.targetStationId || !stationIds.has(inc.targetStationId)) problems.push('unknown station');
      break;
    case 'segment-closure':
    case 'route-suspension':
    case 'reduced-service':
    case 'major-delay':
      if (!inc.targetRouteId || !routeIds.has(inc.targetRouteId)) problems.push('unknown route');
      break;
    case 'road-closure':
    case 'road-capacity':
    case 'bridge-closure':
      if (!inc.edgeIds || inc.edgeIds.length === 0) problems.push('no road edges');
      else if (inc.edgeIds.some((e) => !edgeIds.has(e))) problems.push('unknown road edge');
      break;
  }
  if (inc.replacement) {
    if (!stationIds.has(inc.replacement.fromStationId) || !stationIds.has(inc.replacement.toStationId)) {
      problems.push('replacement endpoints unknown');
    }
    if (inc.replacement.buses < 1 || inc.replacement.buses > 12) problems.push('replacement buses must be 1–12');
  }
  return problems;
}

const ROAD_LANES: Record<RoadKind, number> = { local: 2, arterial: 4, highway: 6 };

function blankStation(id: string, name: string, x: number, z: number, capacityPerHr: number): Station {
  return {
    id, name, pos: { x, y: 0, z }, modes: [], routeIds: [],
    capacityPerHr, waiting: 0, boardedDay: 0, alightedDay: 0, peakWaiting: 0, transfersDay: 0,
  };
}

function refreshStationLinks(stations: Station[], routes: TransportRoute[]): void {
  const byId = new Map(stations.map((s) => [s.id, s]));
  for (const s of stations) {
    s.routeIds = [];
    s.modes = [];
  }
  for (const r of routes) {
    for (const sid of r.stationIds) {
      const st = byId.get(sid);
      if (!st) continue;
      if (!st.routeIds.includes(r.id)) st.routeIds.push(r.id);
      if (!st.modes.includes(r.mode)) st.modes.push(r.mode);
    }
  }
}

export function applyEdits(city: CityData, base: NetworkData, ops: EditOp[]): ModifiedNetwork {
  const warnings: string[] = [];
  let cost = 0;
  const stations: Station[] = base.stations.map((s) => ({ ...s, routeIds: [...s.routeIds], modes: [...s.modes] }));
  const routes: TransportRoute[] = base.routes.map((r) => ({ ...r, stationIds: [...r.stationIds] }));
  const pos = new Map<string, Vec3>();
  for (const s of stations) pos.set(s.id, s.pos);

  const stationIds = () => new Set(stations.map((s) => s.id));

  for (const op of ops) {
    switch (op.type) {
      case 'addStation': {
        if (stationIds().has(op.station.id)) {
          warnings.push(`Station ${op.station.id} already exists, skipped`);
          break;
        }
        const st = blankStation(op.station.id, op.station.name, op.station.x, op.station.z, op.station.capacityPerHr);
        stations.push(st);
        pos.set(st.id, st.pos);
        cost += COST_RATES.metroStation;
        break;
      }
      case 'removeStation': {
        if (!stationIds().has(op.stationId)) {
          warnings.push(`Station ${op.stationId} not found, skipped`);
          break;
        }
        const idx = stations.findIndex((s) => s.id === op.stationId);
        stations.splice(idx, 1);
        pos.delete(op.stationId);
        break;
      }
      case 'addRoute': {
        const r = op.route;
        const missing = r.stationIds.filter((id) => !stationIds().has(id));
        const deduped = r.stationIds.filter((id, i, arr) => arr.indexOf(id) === i);
        if (missing.length > 0) {
          warnings.push(`Route ${r.id} references missing stations, skipped`);
          break;
        }
        if (deduped.length < 2) {
          warnings.push(`Route ${r.id} needs at least 2 stations, skipped`);
          break;
        }
        if (routes.some((x) => x.id === r.id)) {
          warnings.push(`Route ${r.id} already exists, skipped`);
          break;
        }
        routes.push({ ...r, stationIds: deduped });
        if (r.mode === 'metro') {
          let len = 0;
          for (let i = 0; i < deduped.length - 1; i++) {
            const a = pos.get(deduped[i]);
            const b = pos.get(deduped[i + 1]);
            if (a && b) len += Math.hypot(a.x - b.x, a.z - b.z);
          }
          cost += len * COST_RATES.metroTrackPerM;
        } else {
          cost += COST_RATES.busRouteFlat + deduped.length * COST_RATES.busStop;
        }
        break;
      }
      case 'removeRoute': {
        const idx = routes.findIndex((r) => r.id === op.routeId);
        if (idx < 0) {
          warnings.push(`Route ${op.routeId} not found, skipped`);
          break;
        }
        routes.splice(idx, 1);
        break;
      }
      case 'extendRoute': {
        const r = routes.find((x) => x.id === op.routeId);
        if (!r) {
          warnings.push(`Route ${op.routeId} not found, skipped`);
          break;
        }
        const missing = op.stationIds.filter((id) => !stationIds().has(id));
        if (missing.length > 0) {
          warnings.push(`Extension references missing stations, skipped`);
          break;
        }
        const fresh = op.stationIds.filter((id) => !r.stationIds.includes(id));
        if (fresh.length === 0) {
          warnings.push(`Extension adds no new stations, skipped`);
          break;
        }
        const before = r.stationIds.length;
        r.stationIds.push(...fresh);
        if (r.mode === 'metro') {
          const seq = [r.stationIds[before - 1], ...fresh];
          let len = 0;
          for (let i = 0; i < seq.length - 1; i++) {
            const a = pos.get(seq[i]);
            const b = pos.get(seq[i + 1]);
            if (a && b) len += Math.hypot(a.x - b.x, a.z - b.z);
          }
          cost += len * COST_RATES.metroTrackPerM;
        } else {
          cost += fresh.length * COST_RATES.busStop;
        }
        break;
      }
      case 'addRoad': {
        break; // handled below with city copies
      }
      case 'removeRoad': {
        break; // handled below with city copies
      }
      case 'setService': {
        // Collected after the loop (needs final route list); validated here.
        break;
      }
    }
  }

  // Stations removed mid-sequence can leave routes with <2 stations: drop them.
  for (let i = routes.length - 1; i >= 0; i--) {
    routes[i].stationIds = routes[i].stationIds.filter((id) => stationIds().has(id));
    if (routes[i].stationIds.length < 2) {
      warnings.push(`Route ${routes[i].id} left with <2 stations, removed`);
      routes.splice(i, 1);
    }
  }
  refreshStationLinks(stations, routes);

  // Roads: operate on city copies.
  const roadNodes = city.roadNodes.map((n) => ({ ...n, pos: { ...n.pos } }));
  const roadEdges = city.roadEdges.map((e) => ({ ...e }));
  const nodeIds = new Set(roadNodes.map((n) => n.id));
  for (const op of ops) {
    if (op.type === 'addRoad') {
      for (const n of op.nodes) {
        if (!nodeIds.has(n.id)) {
          roadNodes.push({ id: n.id, pos: { x: n.x, y: 0, z: n.z } });
          nodeIds.add(n.id);
        }
      }
      const byId = new Map(roadNodes.map((n) => [n.id, n.pos]));
      for (const e of op.edges) {
        if (roadEdges.some((x) => x.id === e.id)) {
          warnings.push(`Road ${e.id} already exists, skipped`);
          continue;
        }
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) {
          warnings.push(`Road ${e.id} references missing nodes, skipped`);
          continue;
        }
        const lengthM = Math.hypot(a.x - b.x, a.z - b.z);
        if (lengthM < 10) {
          warnings.push(`Road ${e.id} too short, skipped`);
          continue;
        }
        const midX = (a.x + b.x) / 2;
        roadEdges.push({
          id: e.id,
          a: e.a,
          b: e.b,
          lengthM,
          lanes: ROAD_LANES[e.kind],
          isBridge: Math.abs(midX - 120) < 40,
          isArterial: e.kind !== 'local',
        });
        cost += lengthM * COST_RATES.roadPerM[e.kind];
      }
    } else if (op.type === 'removeRoad') {
      const idx = roadEdges.findIndex((e) => e.id === op.edgeId);
      if (idx < 0) {
        warnings.push(`Road ${op.edgeId} not found, skipped`);
        continue;
      }
      roadEdges.splice(idx, 1);
    }
  }
  // Prune orphaned nodes so routing access never strands on dead nodes.
  const usedNodes = new Set<string>();
  for (const e of roadEdges) {
    usedNodes.add(e.a);
    usedNodes.add(e.b);
  }
  const prunedNodes = roadNodes.filter((n) => usedNodes.has(n.id));

  const connections: Connection[] = [];
  const routeLengths = new Map<string, number>();
  const routeCumDist = new Map<string, number[]>();
  for (const r of routes) {
    const built = connectionsForRoute(
      { id: r.id, mode: r.mode, stationIds: r.stationIds, speedKph: r.speedKph, headwayMin: r.headwayMin, vehicleCapacity: r.vehicleCapacity },
      pos,
    );
    connections.push(...built.connections);
    routeLengths.set(r.id, built.length);
    routeCumDist.set(r.id, built.cum);
  }

  // Service overlay: defaults for every surviving route, then setService ops
  // in order (later ops win). Unknown routes warn instead of throwing.
  const service: Record<string, ServicePlan> = {};
  for (const r of routes) service[r.id] = defaultPlanFor(r);
  for (const op of ops) {
    if (op.type !== 'setService') continue;
    const r = routes.find((x) => x.id === op.routeId);
    if (!r) {
      warnings.push(`Service edit for unknown route ${op.routeId}, skipped`);
      continue;
    }
    if (r.mode === 'road') {
      warnings.push(`Service edit for non-transit route ${op.routeId}, skipped`);
      continue;
    }
    const mode = r.mode === 'metro' || r.mode === 'rail' ? r.mode : 'bus';
    service[r.id] = mergeServicePatch(service[r.id], sanitizeServicePatch(op.patch, mode));
  }

  // Fare policy: last setFares op wins (sanitized, never throws).
  let fares: FarePolicy = { ...DEFAULT_FARES };
  for (const op of ops) {
    if (op.type === 'setFares') fares = sanitizeFares(op.fares);
  }

  // Scheduled incidents: validated against the final network, never throw.
  const incidents: IncidentConfig[] = [];
  const routeIdSet = new Set(routes.map((r) => r.id));
  const edgeIdSet = new Set(roadEdges.map((e) => e.id));
  for (const op of ops) {
    if (op.type !== 'scheduleIncident') continue;
    const problems = validateIncidentConfig(op.incident, stationIds(), routeIdSet, edgeIdSet);
    if (problems.length > 0) {
      warnings.push(`Incident "${op.incident.label}" skipped: ${problems.join('; ')}`);
      continue;
    }
    incidents.push({ ...op.incident });
  }

  return {
    stations,
    routes,
    connections,
    routeLengths,
    routeCumDist,
    city: { ...city, roadNodes: prunedNodes, roadEdges },
    cost: Math.round(cost),
    warnings,
    service,
    fares,
    incidents,
  };
}
