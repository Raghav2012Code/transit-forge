// Problem + change markers: deterministic view data for the map overlays.
// Problems come from the planning analytics; changes from the op log. Both
// resolve to ground positions here so SceneView only places pooled meshes.
import type { CityProblem } from '../../simulation/planning/problems.ts';
import type { EditOp } from '../../simulation/scenario/scenario.ts';
import { formatClock } from '../../simulation/index.ts';

export type MarkerTone = 'warn' | 'bad' | 'info' | 'good';

export interface MapMarker {
  /** Stable id for pooling (problem id or op-derived). */
  id: string;
  x: number;
  z: number;
  tone: MarkerTone;
  label: string;
  /** Selection payload — 'problem' opens the explainer, others select. */
  selKind: 'station' | 'route' | 'road' | 'zone' | 'problem';
  selId: string;
}

export interface MarkerAnchors {
  stations: Map<string, { x: number; z: number }>;
  zones: Map<string, { x: number; z: number }>;
  routeMid: Map<string, { x: number; z: number }>;
  roadMid: Map<string, { x: number; z: number }>;
}

function toneFor(kind: CityProblem['kind']): MarkerTone {
  switch (kind) {
    case 'crowding':
    case 'congestion':
      return 'bad';
    case 'criticality':
      return 'warn';
    case 'growth':
    case 'access':
      return 'info';
    case 'overservice':
      return 'good';
  }
}

function anchorFor(
  target: CityProblem['target'],
  anchors: MarkerAnchors,
  gap: { x: number; z: number } | null,
): { x: number; z: number } | null {
  if (gap) return gap;
  if (!target) return null;
  if (target.kind === 'station') return anchors.stations.get(target.id) ?? null;
  if (target.kind === 'zone') return anchors.zones.get(target.id) ?? null;
  if (target.kind === 'route') return anchors.routeMid.get(target.id) ?? null;
  return anchors.roadMid.get(target.id) ?? null;
}

/** One marker per problem, newest-severity first, capped for map legibility. */
export function problemMarkers(
  problems: CityProblem[],
  anchors: MarkerAnchors,
  gapCoords: Map<string, { x: number; z: number }>,
  limit = 12,
): MapMarker[] {
  const out: MapMarker[] = [];
  const ordered = [...problems].sort((a, b) => b.severity - a.severity);
  for (const p of ordered) {
    if (out.length >= limit) break;
    const gap = p.kind === 'access' ? (gapCoords.get(p.id) ?? null) : null;
    const at = anchorFor(p.target, anchors, gap);
    if (!at) continue;
    out.push({
      id: `problem-${p.id}`,
      x: at.x,
      z: at.z,
      tone: toneFor(p.kind),
      label: p.title,
      selKind: 'problem',
      selId: p.id,
    });
  }
  return out;
}

export type ChangeKind = 'added-station' | 'removed-station' | 'added-route' | 'removed-route' | 'service' | 'fares';

export interface ChangeMarker extends MapMarker {
  change: ChangeKind;
}

/**
 * What-did-I-change indicators derived from the op log against live network
 * positions. Service/fare edits anchor to their route's midpoint (or the
 * network centroid when the route is gone).
 */
export function changeMarkers(
  ops: EditOp[],
  anchors: MarkerAnchors & { centroid: { x: number; z: number } },
  routeName: (id: string) => string,
): ChangeMarker[] {
  const out: ChangeMarker[] = [];
  ops.forEach((op, i) => {
    const key = (s: string) => `change-${i}-${s}`;
    if (op.type === 'addStation') {
      out.push({ id: key('st'), x: op.station.x, z: op.station.z, tone: 'good', label: `New station ${op.station.name}`, selKind: 'station', selId: op.station.id, change: 'added-station' });
    } else if (op.type === 'removeStation') {
      const at = anchors.stations.get(op.stationId) ?? anchors.centroid;
      out.push({ id: key('st'), x: at.x, z: at.z, tone: 'bad', label: `Removed station ${op.stationId}`, selKind: 'station', selId: op.stationId, change: 'removed-station' });
    } else if (op.type === 'addRoute') {
      const at = op.route.stationIds.map((id) => anchors.stations.get(id)).find(Boolean) ?? anchors.centroid;
      out.push({ id: key('rt'), x: at.x, z: at.z, tone: 'good', label: `New route ${op.route.name}`, selKind: 'route', selId: op.route.id, change: 'added-route' });
    } else if (op.type === 'removeRoute') {
      const at = anchors.routeMid.get(op.routeId) ?? anchors.centroid;
      out.push({ id: key('rt'), x: at.x, z: at.z, tone: 'bad', label: `Removed route ${routeName(op.routeId)}`, selKind: 'route', selId: op.routeId, change: 'removed-route' });
    } else if (op.type === 'setService') {
      const at = anchors.routeMid.get(op.routeId) ?? anchors.centroid;
      out.push({ id: key('sv'), x: at.x, z: at.z, tone: 'info', label: `Service changed: ${routeName(op.routeId)}${op.atMin === undefined ? '' : ` from ${formatClock(op.atMin)}`}`, selKind: 'route', selId: op.routeId, change: 'service' });
    } else if (op.type === 'setFares') {
      out.push({ id: key('fare'), x: anchors.centroid.x, z: anchors.centroid.z, tone: 'info', label: `Fares changed network-wide${op.atMin === undefined ? '' : ` from ${formatClock(op.atMin)}`}`, selKind: 'zone', selId: '', change: 'fares' });
    }
  });
  return out;
}
