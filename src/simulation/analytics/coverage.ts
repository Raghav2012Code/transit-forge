// Transit coverage: share of population within walking threshold of stations,
// overall and per mode. Deterministic grid sampling inside zone circles.
import type { Station, TransportMode, Zone } from '../../types/index.ts';

export interface CoverageSet {
  thresholdM: number;
  coveredPop: number;
  totalPop: number;
  pct: number;
  metroPop: number;
  railPop: number;
  busPop: number;
  perZone: { zoneId: string; coveredPop: number; pct: number }[];
}

const SAMPLE_RINGS = 3; // 1 + 6 + 12 + 24 = 43 samples per zone

function zoneSamples(z: Zone): { x: number; z: number; pop: number }[] {
  const pts: { x: number; z: number }[] = [{ x: z.center.x, z: z.center.z }];
  for (let ring = 1; ring <= SAMPLE_RINGS; ring++) {
    const n = ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = (ring / SAMPLE_RINGS) * (z.radius - 6);
      pts.push({ x: z.center.x + Math.cos(a) * r, z: z.center.z + Math.sin(a) * r });
    }
  }
  return pts.map((p) => ({ ...p, pop: z.population / pts.length }));
}

function coveredBy(samples: { x: number; z: number }[], stations: Station[], thresholdM: number): boolean[] {
  return samples.map((p) =>
    stations.some((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) <= thresholdM),
  );
}

export function computeCoverage(
  zones: Zone[],
  stations: Station[],
  thresholdM = 500,
): CoverageSet {
  const byMode = (m: TransportMode) => stations.filter((s) => s.modes.includes(m));
  let totalPop = 0;
  let coveredPop = 0;
  let metroPop = 0;
  let railPop = 0;
  let busPop = 0;
  const perZone: CoverageSet['perZone'] = [];
  for (const z of zones) {
    totalPop += z.population;
    const samples = zoneSamples(z);
    const all = coveredBy(samples, stations, thresholdM);
    const metro = coveredBy(samples, byMode('metro'), thresholdM);
    const rail = coveredBy(samples, byMode('rail'), thresholdM);
    const bus = coveredBy(samples, byMode('bus'), thresholdM);
    let zCovered = 0;
    samples.forEach((s, i) => {
      if (all[i]) {
        coveredPop += s.pop;
        zCovered += s.pop;
      }
      if (metro[i]) metroPop += s.pop;
      if (rail[i]) railPop += s.pop;
      if (bus[i]) busPop += s.pop;
    });
    perZone.push({ zoneId: z.id, coveredPop: Math.round(zCovered), pct: z.population > 0 ? Math.round((zCovered / z.population) * 1000) / 10 : 0 });
  }
  const pct = (n: number) => (totalPop > 0 ? Math.round((n / totalPop) * 1000) / 10 : 0);
  return {
    thresholdM,
    coveredPop: Math.round(coveredPop),
    totalPop,
    pct: pct(coveredPop),
    metroPop: Math.round(metroPop),
    railPop: Math.round(railPop),
    busPop: Math.round(busPop),
    perZone,
  };
}
