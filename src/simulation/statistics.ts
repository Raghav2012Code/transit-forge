import type { SimStats } from '../types/index.ts';
import type { SimulationState } from './index.ts';

export function computeStats(sim: SimulationState): SimStats {
  const population = sim.city.zones.reduce((s, z) => s + z.population, 0);
  const jobs = sim.city.zones.reduce((s, z) => s + z.jobs, 0);
  const c = sim.counters;

  let waitingNow = 0;
  let onboardNow = 0;
  for (const p of sim.passengers) {
    if (p.state === 'WAITING' || p.state === 'TRANSFERRING') waitingNow++;
    else if (p.state === 'ON_VEHICLE') onboardNow++;
  }

  const avgTravelMin = c.completed > 0 ? c.totalTravelMin / c.completed : 0;
  const avgWaitMin = c.completed > 0 ? c.totalWaitMin / c.completed : 0;
  const avgTransfers = c.completed > 0 ? c.totalTransfers / c.completed : 0;
  const boardTotal = Math.max(1, c.boardingsTotal);

  let topStation = '—';
  let topStationCount = 0;
  let crowdedStation = '—';
  let crowdedCount = 0;
  for (const st of sim.stations) {
    if (st.boardedDay > topStationCount) {
      topStationCount = st.boardedDay;
      topStation = st.name;
    }
    if (st.waiting > crowdedCount) {
      crowdedCount = st.waiting;
      crowdedStation = st.name;
    }
  }

  let topRoute = '—';
  let topRouteCount = 0;
  for (const r of sim.routes) {
    const n = c.routeBoardings[r.id] ?? 0;
    if (n > topRouteCount) {
      topRouteCount = n;
      topRoute = r.name;
    }
  }

  return {
    population,
    jobs,
    stationCount: sim.stations.length,
    routeCount: sim.routes.length,
    vehicleCount: sim.vehicles.length,
    generated: c.generated,
    completed: c.completed,
    activeNow: sim.passengers.length,
    waitingNow,
    onboardNow,
    avgTravelMin: Math.round(avgTravelMin * 10) / 10,
    avgWaitMin: Math.round(avgWaitMin * 10) / 10,
    avgTransfers: Math.round(avgTransfers * 100) / 100,
    boardingsTotal: c.boardingsTotal,
    metroShare: Math.round((c.metroBoardings / boardTotal) * 1000) / 10,
    railShare: Math.round((c.railBoardings / boardTotal) * 1000) / 10,
    busShare: Math.round((c.busBoardings / boardTotal) * 1000) / 10,
    topStation,
    topStationCount: Math.round(topStationCount),
    crowdedStation,
    crowdedCount: Math.round(crowdedCount),
    topRoute,
    topRouteCount: Math.round(topRouteCount),
    maxOccupancy: Math.round(c.maxOccupancy01 * 1000) / 10,
  };
}
