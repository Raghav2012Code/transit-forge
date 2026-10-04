// Road network graph built from city data. Routing cost is injectable so
// free-flow and congested routing share one implementation.
import type { CityData, RoadEdge } from '../../types/index.ts';

export interface RoadGraph {
  edges: RoadEdge[];
  freeMin: Map<string, number>;
  capacityPerHr: Map<string, number>;
  adj: Map<string, { to: string; edgeId: string }[]>;
  edgeById: Map<string, RoadEdge>;
}

const LANE_CAPACITY = 900; // veh/hr/lane

export function freeFlowKph(e: RoadEdge): number {
  if (e.isBridge) return 40;
  return e.isArterial ? 50 : 30;
}

export function buildRoadGraph(city: CityData): RoadGraph {
  const edges = city.roadEdges;
  const freeMin = new Map<string, number>();
  const capacityPerHr = new Map<string, number>();
  const adj = new Map<string, { to: string; edgeId: string }[]>();
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const link = (from: string, to: string, edgeId: string) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)?.push({ to, edgeId });
  };
  for (const e of edges) {
    freeMin.set(e.id, (e.lengthM / 1000 / freeFlowKph(e)) * 60);
    capacityPerHr.set(e.id, e.lanes * LANE_CAPACITY);
    link(e.a, e.b, e.id);
    link(e.b, e.a, e.id);
  }
  return { edges, freeMin, capacityPerHr, adj, edgeById };
}

export function shortNode(id: string): string {
  return id.replace(/^rn-/, '').toUpperCase();
}

export function edgeName(e: RoadEdge): string {
  const kind = e.isBridge ? 'Bridge' : e.isArterial ? 'Arterial' : 'Local';
  return `${kind} ${shortNode(e.a)}–${shortNode(e.b)}`;
}

/** Dijkstra over road nodes. cost(edgeId) selects free-flow vs congested. */
export function findRoadPath(
  graph: RoadGraph,
  from: string,
  to: string,
  cost: (edgeId: string) => number,
): { nodes: string[]; edgeIds: string[]; totalMin: number } | null {
  if (from === to) return { nodes: [from], edgeIds: [], totalMin: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { from: string; edgeId: string }>();
  const visited = new Set<string>();
  const queue: string[] = [from];
  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const cur = queue.shift();
    if (cur === undefined || visited.has(cur)) continue;
    visited.add(cur);
    if (cur === to) break;
    for (const { to: nxt, edgeId } of graph.adj.get(cur) ?? []) {
      const nd = (dist.get(cur) ?? Infinity) + cost(edgeId);
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        prev.set(nxt, { from: cur, edgeId });
        queue.push(nxt);
      }
    }
  }
  if (!visited.has(to)) return null;
  const nodes: string[] = [to];
  const edgeIds: string[] = [];
  let k: string | undefined = to;
  while (k !== undefined && k !== from) {
    const p = prev.get(k);
    if (!p) return null;
    edgeIds.unshift(p.edgeId);
    nodes.unshift(p.from);
    k = p.from;
  }
  return { nodes, edgeIds, totalMin: dist.get(to) ?? Infinity };
}

/** Nearest road node to a point (deterministic zone access). */
export function nearestRoadNode(city: CityData, x: number, z: number): string {
  let best = city.roadNodes[0]?.id ?? '';
  let bestD = Infinity;
  for (const n of city.roadNodes) {
    const d = Math.hypot(n.pos.x - x, n.pos.z - z);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** Structural validation for tests and future editors. */
export function validateRoadGraph(graph: RoadGraph, nodeIds: string[]): string[] {
  const errors: string[] = [];
  const known = new Set(nodeIds);
  for (const e of graph.edges) {
    if (!known.has(e.a)) errors.push(`edge ${e.id} references missing node ${e.a}`);
    if (!known.has(e.b)) errors.push(`edge ${e.id} references missing node ${e.b}`);
    if ((graph.capacityPerHr.get(e.id) ?? 0) <= 0) errors.push(`edge ${e.id} has no capacity`);
    if ((graph.freeMin.get(e.id) ?? 0) <= 0) errors.push(`edge ${e.id} has no free-flow time`);
  }
  return errors;
}
