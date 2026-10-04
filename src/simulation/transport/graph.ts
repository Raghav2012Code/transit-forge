// Graph routing over the transport network. Swappable behind findShortestPath;
// v1 is Dijkstra on travel time with a transfer penalty.
import type { Connection } from '../../types/index.ts';

export const TRANSFER_PENALTY_MIN = 4;

export interface PathResult {
  stationIds: string[];
  routeIds: (string | null)[];
  totalMin: number;
}

/** Network parts excluded from routing (disruptions). */
export interface PathExclusions {
  /** Stations that cannot be entered (the start station is always allowed). */
  stations?: Set<string>;
  /** Directed hops `${routeId}|${fromStationId}>${toStationId}`. */
  segments?: Set<string>;
  /** Routes that cannot be used. */
  routes?: Set<string>;
}

export function findShortestPath(
  connections: Connection[],
  from: string,
  to: string,
  excl?: PathExclusions,
): PathResult | null {
  if (from === to) return { stationIds: [from], routeIds: [], totalMin: 0 };

  // State = station + route used to arrive (transfer penalty needs previous route).
  interface State {
    station: string;
    routeId: string | null;
  }
  const key = (s: State) => `${s.station}|${s.routeId ?? '-'}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, { fromKey: string; viaRoute: string | null }>();
  const adj = new Map<string, Connection[]>();
  for (const c of connections) {
    if (!adj.has(c.from)) adj.set(c.from, []);
    adj.get(c.from)?.push(c);
  }

  const start: State = { station: from, routeId: null };
  dist.set(key(start), 0);
  // Simple O(V^2) Dijkstra; graph is tiny (~14 nodes). Replace with heap if scaled.
  const visited = new Set<string>();
  const queue: State[] = [start];
  const blockedStations = excl?.stations;
  const blockedSegments = excl?.segments;
  const blockedRoutes = excl?.routes;

  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(key(a)) ?? Infinity) - (dist.get(key(b)) ?? Infinity));
    const cur = queue.shift();
    if (!cur) break;
    const curKey = key(cur);
    if (visited.has(curKey)) continue;
    visited.add(curKey);
    const curDist = dist.get(curKey) ?? Infinity;

    if (cur.station === to) {
      // Reconstruct.
      const stationIds: string[] = [to];
      const routeIds: (string | null)[] = [];
      let k: string | undefined = curKey;
      while (k && k !== key(start)) {
        const p = prev.get(k);
        if (!p) break;
        routeIds.unshift(p.viaRoute);
        const fromStation = p.fromKey.split('|')[0];
        stationIds.unshift(fromStation);
        k = p.fromKey;
      }
      return { stationIds, routeIds, totalMin: curDist };
    }

    for (const c of adj.get(cur.station) ?? []) {
      if (c.routeId && blockedRoutes?.has(c.routeId)) continue;
      if (c.routeId && blockedSegments?.has(`${c.routeId}|${c.from}>${c.to}`)) continue;
      if (blockedStations?.has(c.to)) continue;
      const penalty =
        cur.routeId !== null && c.routeId !== cur.routeId ? TRANSFER_PENALTY_MIN : 0;
      const next: State = { station: c.to, routeId: c.routeId };
      const nk = key(next);
      const nd = curDist + c.timeMin + penalty;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { fromKey: curKey, viaRoute: c.routeId });
        queue.push(next);
      }
    }
  }
  return null;
}
