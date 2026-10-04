// Scenario impact: who benefits, who loses, and an explainable planning score.
// All inputs are computed analytics (never hand-waved), so reruns reproduce.
import type { SimStats, Zone } from '../../types/index.ts';
import type { AccessibilitySet } from './accessibility.ts';
import type { CoverageSet } from './coverage.ts';

export interface ZoneImpact {
  zoneId: string;
  zoneName: string;
  population: number;
  baseCommute: number | null;
  modCommute: number | null;
  delta: number | null;
}

export interface PopulationImpact {
  improvedPop: number;
  worsenedPop: number;
  unchangedPop: number;
  newlyCoveredPop: number;
  lostCoveragePop: number;
  perZone: ZoneImpact[];
}

/** Commute proxy = average door-to-door time to major destinations. */
export function populationImpact(
  base: AccessibilitySet,
  mod: AccessibilitySet,
  zones: Zone[],
  baseCov: CoverageSet,
  modCov: CoverageSet,
  thresholdMin = 0.5,
): PopulationImpact {
  const baseById = new Map(base.zones.map((z) => [z.zoneId, z]));
  const modById = new Map(mod.zones.map((z) => [z.zoneId, z]));
  const baseCovById = new Map(baseCov.perZone.map((z) => [z.zoneId, z]));
  const modCovById = new Map(modCov.perZone.map((z) => [z.zoneId, z]));

  let improvedPop = 0;
  let worsenedPop = 0;
  let unchangedPop = 0;
  let newlyCoveredPop = 0;
  let lostCoveragePop = 0;
  const perZone: ZoneImpact[] = [];

  for (const zn of zones) {
    const b = baseById.get(zn.id)?.avgToMajors ?? null;
    const m = modById.get(zn.id)?.avgToMajors ?? null;
    let delta: number | null = null;
    if (b !== null && m !== null) delta = Math.round((m - b) * 10) / 10;
    if (delta === null) {
      if (b === null && m !== null) improvedPop += zn.population;
      else if (b !== null && m === null) worsenedPop += zn.population;
      else unchangedPop += zn.population;
    } else if (delta < -thresholdMin) improvedPop += zn.population;
    else if (delta > thresholdMin) worsenedPop += zn.population;
    else unchangedPop += zn.population;

    const bc = baseCovById.get(zn.id)?.coveredPop ?? 0;
    const mc = modCovById.get(zn.id)?.coveredPop ?? 0;
    if (mc > bc) newlyCoveredPop += mc - bc;
    else lostCoveragePop += bc - mc;

    perZone.push({ zoneId: zn.id, zoneName: zn.name, population: zn.population, baseCommute: b, modCommute: m, delta });
  }

  return { improvedPop, worsenedPop, unchangedPop, newlyCoveredPop, lostCoveragePop, perZone };
}

export interface PlanningScore {
  total: number;
  parts: { label: string; value: number; weight: number }[];
}

/** Weighted composite with every component shown (no single black-box number). */
export function planningScore(stats: SimStats, access: AccessibilitySet, coverage: CoverageSet): PlanningScore {
  const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x * 10) / 10));
  const parts = [
    { label: 'Travel time', value: clamp100(100 * (1 - Math.min(stats.avgTravelMin, 45) / 45)), weight: 0.3 },
    { label: 'Accessibility', value: clamp100(access.cityScore), weight: 0.25 },
    { label: 'Transit share', value: clamp100(stats.transitShare), weight: 0.15 },
    { label: 'Congestion', value: clamp100(100 * (1 - Math.min(stats.avgCongestion, 1.5) / 1.5)), weight: 0.15 },
    { label: 'Coverage', value: clamp100(coverage.pct), weight: 0.15 },
  ];
  const total = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) * 10) / 10;
  return { total, parts };
}
