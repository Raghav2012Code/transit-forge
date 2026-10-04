import type { SimStats } from '../types/index.ts';
import type { SimulationState } from './index.ts';

export function computeStats(sim: SimulationState): SimStats {
  const population = sim.city.zones.reduce((s, z) => s + z.population, 0);
  const jobs = sim.city.zones.reduce((s, z) => s + z.jobs, 0);
  const waitingTotal = sim.stations.reduce((s, st) => s + st.waiting, 0);
  const boardedDay = sim.stations.reduce((s, st) => s + st.boardedDay, 0);
  const avgWaitMin = boardedDay > 0 ? Math.min(12, (waitingTotal / Math.max(1, boardedDay)) * 60) : 0;
  return {
    population,
    jobs,
    stationCount: sim.stations.length,
    routeCount: sim.routes.length,
    vehicleCount: sim.vehicles.length,
    waitingTotal: Math.round(waitingTotal),
    boardedDay: Math.round(boardedDay),
    avgWaitMin: Math.round(avgWaitMin * 10) / 10,
  };
}
