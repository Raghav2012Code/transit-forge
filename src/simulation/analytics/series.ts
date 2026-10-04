// Headless time-series runs for charts: cumulative counters sampled on a
// fixed tick grid, so per-window rates derive from consecutive deltas.
import type { CityData, SimStats } from '../../types/index.ts';
import type { NetworkData } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation, type SimulationState } from '../index.ts';
import { computeStats } from '../statistics.ts';

export interface SeriesPoint {
  t: number;
  generated: number;
  completed: number;
  roadGen: number;
  roadDone: number;
  active: number;
  waiting: number;
  onboard: number;
  cars: number;
  avgTravel: number;
  avgWait: number;
  totalTravel: number;
  totalWait: number;
}

export interface HeadlessSeries {
  stats: SimStats;
  series: SeriesPoint[];
  topStations: { id: string; name: string; boarded: number; waiting: number; transfers: number }[];
}

export function runHeadlessSeries(
  seed: number,
  city: CityData,
  net: NetworkData,
  ticks = 360,
  sampleEvery = 15,
): HeadlessSeries {
  let sim = createSimulationFromParts(seed, city, net);
  const series: SeriesPoint[] = [];
  series.push(samplePoint(sim));
  for (let i = 0; i < ticks; i++) {
    sim = stepSimulation(sim, 1);
    if ((i + 1) % sampleEvery === 0) series.push(samplePoint(sim));
  }
  const topStations = sim.stations
    .map((s) => ({ id: s.id, name: s.name, boarded: Math.round(s.boardedDay), waiting: Math.round(s.waiting), transfers: Math.round(s.transfersDay) }))
    .sort((a, b) => b.boarded - a.boarded)
    .slice(0, 6);
  return { stats: computeStats(sim), series, topStations };
}

/** Snapshot cumulative counters + live loads into one history point. */
export function samplePoint(sim: SimulationState): SeriesPoint {
  const c = sim.counters;
  let waiting = 0;
  let onboard = 0;
  for (const p of sim.passengers) {
    if (p.state === 'WAITING' || p.state === 'TRANSFERRING') waiting++;
    else if (p.state === 'ON_VEHICLE') onboard++;
  }
  return {
    t: sim.timeMinutes,
    generated: c.generated,
    completed: c.completed,
    roadGen: sim.roadCounters.generated,
    roadDone: sim.roadCounters.completed,
    active: sim.passengers.length,
    waiting,
    onboard,
    cars: sim.cars.length,
    avgTravel: c.completed > 0 ? c.totalTravelMin / c.completed : 0,
    avgWait: c.completed > 0 ? c.totalWaitMin / c.completed : 0,
    totalTravel: c.totalTravelMin,
    totalWait: c.totalWaitMin,
  };
}
