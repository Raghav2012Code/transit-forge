// Headless scenario comparison: run base vs modified networks with the same
// seed and report metric deltas from real simulation results.
import type { CityData, SimStats } from '../../types/index.ts';
import type { NetworkData } from '../transport/network.ts';
import { createSimulationFromParts, stepSimulation } from '../index.ts';
import { computeStats } from '../statistics.ts';
import { formatCost } from './scenario.ts';

export const COMPARE_TICKS = 360;

export function runHeadless(seed: number, city: CityData, net: NetworkData, ticks = COMPARE_TICKS): SimStats {
  let sim = createSimulationFromParts(seed, city, net);
  for (let i = 0; i < ticks; i++) sim = stepSimulation(sim, 1);
  return computeStats(sim);
}

export interface CompareRow {
  label: string;
  base: string;
  mod: string;
  delta: string;
  /** Percent change (null for text rows). Negative = decrease. */
  pct: number | null;
  /** Whether up or down is an improvement (null = neutral/info). */
  better: 'up' | 'down' | null;
}

function numRow(
  label: string,
  base: number,
  mod: number,
  unit: string,
  better: 'up' | 'down' | null,
  digits = 1,
): CompareRow {
  const d = mod - base;
  const pct = base !== 0 ? (d / Math.abs(base)) * 100 : mod !== 0 ? 100 : 0;
  const sign = d > 0 ? '+' : '';
  return {
    label,
    base: `${base.toFixed(digits)}${unit}`,
    mod: `${mod.toFixed(digits)}${unit}`,
    delta: `${sign}${d.toFixed(digits)}${unit} (${sign}${pct.toFixed(1)}%)`,
    pct: Math.round(pct * 10) / 10,
    better,
  };
}

export function buildCompareRows(base: SimStats, mod: SimStats, costBase: number, costMod: number): CompareRow[] {
  return [
    numRow('Avg travel', base.avgTravelMin, mod.avgTravelMin, ' min', 'down'),
    numRow('Avg wait', base.avgWaitMin, mod.avgWaitMin, ' min', 'down'),
    numRow('Avg transfers', base.avgTransfers, mod.avgTransfers, '', 'down', 2),
    numRow('Transit share', base.transitShare, mod.transitShare, '%', 'up'),
    numRow('Car share', base.carShare, mod.carShare, '%', 'down'),
    numRow('Avg congestion', base.avgCongestion, mod.avgCongestion, '', 'down', 2),
    numRow('Transit boardings', base.boardingsTotal, mod.boardingsTotal, '', 'up', 0),
    {
      label: 'Crowded station',
      base: `${base.crowdedStation} (${base.crowdedCount})`,
      mod: `${mod.crowdedStation} (${mod.crowdedCount})`,
      delta: '—',
      pct: null,
      better: null,
    },
    {
      label: 'Construction cost',
      base: formatCost(costBase),
      mod: formatCost(costMod),
      delta: costMod > costBase ? `+${formatCost(costMod - costBase)}` : '—',
      pct: null,
      better: null,
    },
  ];
}
