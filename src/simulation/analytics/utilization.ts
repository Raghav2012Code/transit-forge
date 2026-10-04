import type { SimulationState } from '../index.ts';

export interface UtilizationRows {
  routes: { id: string; name: string; boardings: number; peakOcc: number; delayPct: number }[];
  stations: { id: string; name: string; boarded: number; waiting: number; transfers: number; util: number }[];
  roads: { id: string; label: string; vc: number; delayMin: number }[];
}

/** Ranked utilization tables from live simulation state. */
export function buildUtilization(sim: SimulationState): UtilizationRows {
  const routes = sim.routes.map((r) => ({
    id: r.id,
    name: r.name,
    boardings: Math.round(sim.counters.routeBoardings[r.id] ?? 0),
    peakOcc: Math.round((sim.counters.routePeakOcc[r.id] ?? 0) * 1000) / 10,
    delayPct: r.mode === 'bus' ? Math.round(((sim.busRouteCongestion[r.id] ?? 1) - 1) * 1000) / 10 : 0,
  }));
  const stations = sim.stations
    .map((s) => ({
      id: s.id,
      name: s.name,
      boarded: Math.round(s.boardedDay),
      waiting: Math.round(s.waiting),
      transfers: Math.round(s.transfersDay),
      util: Math.round((s.peakWaiting / Math.max(1, s.capacityPerHr * 0.25)) * 1000) / 10,
    }))
    .sort((a, b) => b.util - a.util);
  const roads = Object.values(sim.edgeState)
    .map((st) => {
      const e = sim.roadGraph.edgeById.get(st.id);
      const free = sim.roadGraph.freeMin.get(st.id) ?? 0;
      return {
        id: st.id,
        label: e
          ? `${e.isBridge ? 'Bridge' : e.isArterial ? 'Art' : 'Loc'} ${e.a.replace(/^rn-/, '').toUpperCase()}–${e.b.replace(/^rn-/, '').toUpperCase()}`
          : st.id,
        vc: Math.round(st.vc * 100) / 100,
        delayMin: Math.round((st.currentMin - free) * 100) / 100,
      };
    })
    .sort((a, b) => b.vc - a.vc);
  return { routes, stations, roads };
}
