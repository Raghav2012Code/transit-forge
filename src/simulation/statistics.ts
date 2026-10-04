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

  // Roads + multimodal from actual trip state.
  const rc = sim.roadCounters;
  const avgRoadMin = rc.completed > 0 ? rc.totalTravelMin / rc.completed : 0;
  let vcSum = 0;
  let vcN = 0;
  for (const id in sim.edgeState) {
    vcSum += sim.edgeState[id].vc;
    vcN++;
  }
  const allTrips = Math.max(1, c.completed + rc.completed);
  const worstEdge = sim.roadGraph.edgeById.get(rc.maxVCEdge);
  const worstName = worstEdge
    ? `${worstEdge.isBridge ? 'Bridge' : worstEdge.isArterial ? 'Arterial' : 'Local'} ${worstEdge.a.replace(/^rn-/, '').toUpperCase()}–${worstEdge.b.replace(/^rn-/, '').toUpperCase()}`
    : '—';

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
    roadTrips: rc.generated,
    roadCompleted: rc.completed,
    activeCars: sim.cars.length,
    avgRoadMin: Math.round(avgRoadMin * 10) / 10,
    avgCongestion: vcN > 0 ? Math.round((vcSum / vcN) * 100) / 100 : 0,
    worstRoad: worstName,
    worstVC: Math.round(rc.maxVC * 100) / 100,
    transitShare: Math.round((c.completed / allTrips) * 1000) / 10,
    carShare: Math.round((rc.completed / allTrips) * 1000) / 10,
    avgTransitMin: avgTravelMin,
  };
}
