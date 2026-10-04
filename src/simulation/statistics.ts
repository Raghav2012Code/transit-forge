import type { SimStats } from '../types/index.ts';
import type { SimulationState } from './index.ts';
import { costRecoveryPct, subsidyFor } from './economics/fares.ts';
import { operatingCost } from './service/costs.ts';
import { routeEffectiveHeadway } from './service/timetable.ts';
import { LOOP_ROUTES } from './passengers/passengers.ts';

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
    ...serviceStats(sim),
  };
}

/** Service-level metrics from vehicle telemetry + operating costs + fares. */
function serviceStats(sim: SimulationState): Pick<
  SimStats,
  'deniedBoardings' | 'avgOcc' | 'vehKm' | 'vehHr' | 'opCost' | 'opCostPerPax' | 'avgHeadway' | 'totalDelayMin'
  | 'rerouted' | 'strandedNow' | 'strandedPeak' | 'cancelledTrips' | 'activeIncidents'
  | 'revenue' | 'revenueMetro' | 'revenueRail' | 'revenueBus' | 'costRecovery' | 'subsidy'
> {
  const c = sim.counters;
  let occSum = 0;
  for (const vv of sim.vehicles) occSum += vv.load / Math.max(1, vv.capacity);
  const avgOcc = sim.vehicles.length > 0 ? occSum / sim.vehicles.length : 0;
  let vehKm = 0;
  let vehHr = 0;
  for (const id in c.routeVehKm) vehKm += c.routeVehKm[id];
  for (const id in c.routeVehHr) vehHr += c.routeVehHr[id];

  let opCost = 0;
  let headwaySum = 0;
  let headwayN = 0;
  for (const r of sim.routes) {
    const km = c.routeVehKm[r.id] ?? 0;
    const hr = c.routeVehHr[r.id] ?? 0;
    const plan = sim.service[r.id];
    const fleet = plan && plan.fleetSize > 0 ? plan.fleetSize : sim.vehicles.filter((vv) => vv.routeId === r.id).length;
    opCost += operatingCost(r.mode, hr, km, fleet);
    if (plan) {
      const cum = sim.routeCumDist.get(r.id) ?? [0];
      const total = Math.max(1, cum[cum.length - 1]);
      const slow = r.mode === 'bus' ? (sim.busRouteCongestion[r.id] ?? 1) : 1;
      const h = routeEffectiveHeadway(plan, total, r.stationIds.length, slow, sim.timeMinutes, LOOP_ROUTES.has(r.id));
      if (Number.isFinite(h)) {
        headwaySum += h;
        headwayN++;
      }
    }
  }
  const completed = Math.max(1, c.completed);
  let strandedNow = 0;
  for (const p of sim.passengers) if (p.state === 'STRANDED') strandedNow++;
  const revenue = Math.round(c.revenueTotal);
  const opCostRounded = Math.round(opCost);
  return {
    deniedBoardings: c.deniedBoardings,
    avgOcc: Math.round(avgOcc * 1000) / 10,
    vehKm: Math.round(vehKm * 10) / 10,
    vehHr: Math.round(vehHr * 10) / 10,
    opCost: opCostRounded,
    opCostPerPax: Math.round((opCost / completed) * 100) / 100,
    revenue,
    revenueMetro: Math.round(c.revenueByMode.metro ?? 0),
    revenueRail: Math.round(c.revenueByMode.rail ?? 0),
    revenueBus: Math.round(c.revenueByMode.bus ?? 0),
    costRecovery: costRecoveryPct(revenue, opCostRounded),
    subsidy: subsidyFor(revenue, opCostRounded),
    avgHeadway: headwayN > 0 ? Math.round((headwaySum / headwayN) * 10) / 10 : 0,
    totalDelayMin: Math.round(c.totalDelayMin),
    rerouted: c.rerouted,
    strandedNow,
    strandedPeak: c.strandedPeak,
    cancelledTrips: c.cancelledTrips,
    activeIncidents: sim.incidents.filter((i) => i.status === 'active').length,
  };
}
