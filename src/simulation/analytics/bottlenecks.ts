// Bottleneck detection from live simulation values, grouped by system.
// No cross-unit merging: stations, routes, and roads rank within their kind.
import type { RoadEdgeState, Station, TransportRoute, TripCounters } from '../../types/index.ts';
import type { RoadGraph } from '../traffic/roadGraph.ts';

export interface Bottleneck {
  kind: 'station' | 'route' | 'road';
  id: string;
  label: string;
  metric: string;
  value: number;
  detail: string;
}

export interface BottleneckInput {
  stations: Station[];
  routes: TransportRoute[];
  counters: TripCounters;
  edgeState: Record<string, RoadEdgeState>;
  roadGraph: RoadGraph;
  busRouteCongestion: Record<string, number>;
}

export function findBottlenecks(input: BottleneckInput): { stations: Bottleneck[]; routes: Bottleneck[]; roads: Bottleneck[] } {
  const { stations, routes, counters, edgeState, roadGraph, busRouteCongestion } = input;

  const stationsOut: Bottleneck[] = stations
    .map((st) => ({
      item: {
        kind: 'station' as const,
        id: st.id,
        label: st.name,
        metric: 'peak utilization',
        value: Math.round((st.peakWaiting / Math.max(1, st.capacityPerHr * 0.25)) * 1000) / 10,
        detail: `${Math.round(st.waiting)} waiting, ${Math.round(st.boardedDay)} boarded`,
      },
      sort: st.peakWaiting / Math.max(1, st.capacityPerHr * 0.25),
    }))
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 5)
    .map((x) => x.item);

  const routesOut: Bottleneck[] = routes
    .map((r) => {
      const peak = (counters.routePeakOcc[r.id] ?? 0) * 100;
      const boarded = counters.routeBoardings[r.id] ?? 0;
      const slow = busRouteCongestion[r.id] ?? 1;
      const delay = r.mode === 'bus' ? `, +${Math.round((slow - 1) * 1000) / 10}% delay` : '';
      return {
        item: {
          kind: 'route' as const,
          id: r.id,
          label: r.name,
          metric: 'peak occupancy',
          value: Math.round(peak * 10) / 10,
          detail: `${Math.round(boarded)} boardings${delay}`,
        },
        sort: peak,
      };
    })
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 5)
    .map((x) => x.item);

  const roadsOut: Bottleneck[] = Object.values(edgeState)
    .map((st) => {
      const e = roadGraph.edgeById.get(st.id);
      const free = roadGraph.freeMin.get(st.id) ?? 0;
      const label = e
        ? `${e.isBridge ? 'Bridge' : e.isArterial ? 'Arterial' : 'Local'} ${e.a.replace(/^rn-/, '').toUpperCase()}–${e.b.replace(/^rn-/, '').toUpperCase()}`
        : st.id;
      return {
        item: {
          kind: 'road' as const,
          id: st.id,
          label,
          metric: 'V/C ratio',
          value: Math.round(st.vc * 100) / 100,
          detail: `+${Math.round((st.currentMin - free) * 100) / 100} min vs free flow`,
        },
        sort: st.vc,
      };
    })
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 5)
    .map((x) => x.item);

  return { stations: stationsOut, routes: routesOut, roads: roadsOut };
}
