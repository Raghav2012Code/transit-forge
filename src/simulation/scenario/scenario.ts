// Scenario model: base city (seed) + ordered edit operations.
// The base is never mutated; applying ops yields the modified network.
// Undo/redo replays the op log (no state snapshots needed).
import type { TransportMode } from '../../types/index.ts';

export type RoadKind = 'local' | 'arterial' | 'highway';

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
  | { type: 'removeRoad'; edgeId: string };

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
