// Scenario model: base city (seed) + ordered edit operations.
// The base is never mutated; applying ops yields the modified network.
// Undo/redo replays the op log (no state snapshots needed).
import type { TransportMode } from '../../types/index.ts';
import type { ServicePlan } from '../service/servicePlan.ts';
import type { IncidentConfig } from '../incidents/incidents.ts';
import { clampHeadway } from '../service/servicePlan.ts';

export type RoadKind = 'local' | 'arterial' | 'highway';

/** Partial service update; routeId identifies the route. */
export interface ServicePatch {
  peakHeadwayMin?: number;
  offPeakHeadwayMin?: number;
  operatingStartMin?: number;
  operatingEndMin?: number;
  fleetSize?: number;
  vehicleCapacity?: number;
  speedKph?: number;
  dwellBaseSec?: number;
  dwellPerBoardSec?: number;
  dwellPerAlightSec?: number;
  turnaroundMin?: number;
  syncEnabled?: boolean;
  reliability?: {
    delayProb?: number;
    meanDelayMin?: number;
    cancelProb?: number;
  };
}

/** Merge a patch over a base plan (reliability merges nested). */
export function mergeServicePatch(base: ServicePlan, patch: ServicePatch): ServicePlan {
  const { reliability, ...rest } = patch;
  return {
    ...base,
    ...rest,
    routeId: base.routeId,
    reliability: { ...base.reliability, ...(reliability ?? {}) },
  };
}

/** Clamp a service patch to sane bounds for the mode. */
export function sanitizeServicePatch(
  patch: ServicePatch,
  mode: 'metro' | 'rail' | 'bus',
): ServicePatch {
  const out: ServicePatch = { ...patch };
  if (out.peakHeadwayMin !== undefined) out.peakHeadwayMin = clampHeadway(mode, out.peakHeadwayMin);
  if (out.offPeakHeadwayMin !== undefined) out.offPeakHeadwayMin = clampHeadway(mode, out.offPeakHeadwayMin);
  if (out.fleetSize !== undefined) out.fleetSize = Math.max(0, Math.min(24, Math.floor(out.fleetSize)));
  if (out.vehicleCapacity !== undefined) out.vehicleCapacity = Math.max(10, Math.min(2000, Math.floor(out.vehicleCapacity)));
  if (out.speedKph !== undefined) out.speedKph = Math.max(5, Math.min(120, out.speedKph));
  if (out.turnaroundMin !== undefined) out.turnaroundMin = Math.max(0, Math.min(30, out.turnaroundMin));
  if (out.operatingStartMin !== undefined) out.operatingStartMin = Math.max(0, Math.min(1439, Math.floor(out.operatingStartMin)));
  if (out.operatingEndMin !== undefined) out.operatingEndMin = Math.max(0, Math.min(1440, Math.floor(out.operatingEndMin)));
  if (out.reliability) {
    const r = { ...out.reliability };
    if (r.delayProb !== undefined) r.delayProb = Math.max(0, Math.min(1, r.delayProb));
    if (r.meanDelayMin !== undefined) r.meanDelayMin = Math.max(0, Math.min(30, r.meanDelayMin));
    if (r.cancelProb !== undefined) r.cancelProb = Math.max(0, Math.min(0.5, r.cancelProb));
    out.reliability = r;
  }
  return out;
}

export type EditOp =
  | { type: 'addStation'; station: { id: string; name: string; x: number; z: number; capacityPerHr: number } }
  | { type: 'removeStation'; stationId: string }
  | {
      type: 'addRoute';
      route: {
        id: string;
        name: string;
        mode: Extract<TransportMode, 'metro' | 'bus'>;
        color: string;
        stationIds: string[];
        headwayMin: number;
        speedKph: number;
        vehicleCapacity: number;
      };
    }
  | { type: 'removeRoute'; routeId: string }
  | { type: 'extendRoute'; routeId: string; stationIds: string[] }
  | {
      type: 'addRoad';
      nodes: { id: string; x: number; z: number }[];
      edges: { id: string; a: string; b: string; kind: RoadKind }[];
    }
  | { type: 'removeRoad'; edgeId: string }
  | { type: 'setService'; routeId: string; patch: ServicePatch }
  | { type: 'scheduleIncident'; incident: IncidentConfig };

export interface Scenario {
  version: 1;
  id: string;
  name: string;
  seed: number;
  ops: EditOp[];
  updatedAt: number;
}

export function createScenario(name: string, seed: number): Scenario {
  const n = Math.floor(Math.abs(seed * 2654435761 + Date.now() % 100000) % 100000);
  return { version: 1, id: `sc-${Date.now().toString(36)}-${n}`, name, seed, ops: [], updatedAt: Date.now() };
}

/** Push an op: clears the redo stack. Pure. */
export function pushOp(ops: EditOp[], _redo: EditOp[], op: EditOp): { ops: EditOp[]; redo: EditOp[] } {
  return { ops: [...ops, op], redo: [] };
}

export function undoOp(ops: EditOp[], redo: EditOp[]): { ops: EditOp[]; redo: EditOp[] } {
  if (ops.length === 0) return { ops, redo };
  return { ops: ops.slice(0, -1), redo: [...redo, ops[ops.length - 1]] };
}

export function redoOp(ops: EditOp[], redo: EditOp[]): { ops: EditOp[]; redo: EditOp[] } {
  if (redo.length === 0) return { ops, redo };
  return { ops: [...ops, redo[redo.length - 1]], redo: redo.slice(0, -1) };
}

// Deterministic ids derived from the op sequence (same ops => same ids).
export function nextStationId(ops: EditOp[]): string {
  const n = ops.filter((o) => o.type === 'addStation').length;
  return `st-u${n + 1}`;
}

export function nextRouteId(ops: EditOp[], mode: 'metro' | 'bus'): string {
  const base = mode === 'metro' ? 2 : 3;
  const n = ops.filter((o) => o.type === 'addRoute' && o.route.mode === mode).length;
  const prefix = mode === 'metro' ? 'M' : 'B';
  return `rt-u${prefix.toLowerCase()}${base + n + 1}`;
}

export function nextRoadIds(ops: EditOp[]): { node: string; edge: string } {
  const n = ops.filter((o) => o.type === 'addRoad').length;
  return { node: `rn-u${n + 1}`, edge: `re-u${n + 1}` };
}

export const ROUTE_PALETTE = ['#22d3ee', '#a3e635', '#f472b6', '#60a5fa', '#facc15', '#4ade80'];

export function paletteColor(existingRoutes: number): string {
  return ROUTE_PALETTE[existingRoutes % ROUTE_PALETTE.length];
}

// Construction costs in fictional ₹ (documented unit rates, not calibrated).
export const COST_RATES = {
  metroStation: 4_500_000_000,
  metroTrackPerM: 900_000,
  busRouteFlat: 120_000_000,
  busStop: 5_000_000,
  roadPerM: { local: 150_000, arterial: 400_000, highway: 900_000 } as Record<RoadKind, number>,
};

export function formatCost(inr: number): string {
  if (inr >= 1_00_00_00_000) return `₹${(inr / 1_00_00_00_000).toFixed(1)}B`;
  if (inr >= 1_00_00_000) return `₹${(inr / 1_00_00_000).toFixed(1)}Cr`;
  return `₹${Math.round(inr / 1_00_000)}L`;
}

/** Placement rules shared by UI preview and apply (single source of truth). */
export function validateStationPlacement(x: number, z: number): string | null {
  if (Math.abs(x) > 600 || Math.abs(z) > 420) return 'Outside city bounds';
  if (x < -300) return 'Cannot build on water';
  if (Math.abs(x - 120) < 30) return 'Too close to the river';
  return null;
}

export function validateRoadNode(x: number, z: number): string | null {
  if (Math.abs(x) > 600 || Math.abs(z) > 420) return 'Outside city bounds';
  if (x < -300) return 'Cannot build on water';
  return null;
}
