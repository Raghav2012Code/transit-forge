// City problems: ranked, metric-backed issues with drill-down context.
// Deterministic rule-based suggestions only — no LLM, no black boxes.
import type { Bottleneck } from '../analytics/bottlenecks.ts';
import type { GapCandidate } from '../analytics/gaps.ts';

export type ProblemKind = 'crowding' | 'congestion' | 'access' | 'growth' | 'criticality' | 'overservice';

export interface CityProblem {
  id: string;
  kind: ProblemKind;
  title: string;
  /** 0..100 severity for ranking. */
  severity: number;
  metrics: [string, string][];
  causes: string[];
  interventions: string[];
  why: string[];
  target: { kind: 'station' | 'route' | 'road' | 'zone'; id: string } | null;
}

export interface ProblemFacts {
  bottlenecks: { stations: Bottleneck[]; routes: Bottleneck[]; roads: Bottleneck[] };
  gaps: GapCandidate[];
  zones: { id: string; name: string; population: number; popGrowthRate: number; accessScore: number }[];
  routes: { id: string; name: string; mode: string }[];
  routeBoardings: Record<string, number>;
  routePeakOcc: Record<string, number>;
  criticalRoutes: { id: string; label: string; score: number }[];
  criticalBridges: { id: string; label: string; score: number }[];
}

/** Detect and rank the top city problems (at most 8). */
export function detectProblems(f: ProblemFacts): CityProblem[] {
  const out: CityProblem[] = [];

  for (const b of f.bottlenecks.routes.slice(0, 3)) {
    if (b.value < 70) continue;
    const r = f.routes.find((x) => x.name === b.label || x.id === b.id);
    out.push({
      id: `crowd-${b.id}`,
      kind: 'crowding',
      title: `${b.label} overcrowding`,
      severity: Math.min(100, b.value),
      metrics: [
        ['Peak occupancy', `${b.value.toFixed(0)}%`],
        ['Detail', b.detail],
      ],
      causes: [
        `Demand growth on the corridor`,
        r ? `Frequency unchanged at current headways` : 'Frequency unchanged',
      ],
      interventions: [
        'Increase frequency',
        'Increase vehicle capacity',
        'Add parallel service',
      ],
      why: [
        `Peak occupancy ${b.value.toFixed(0)}% exceeds the 85% comfort threshold`,
        b.detail,
      ],
      target: { kind: 'route', id: b.id },
    });
  }

  for (const b of f.bottlenecks.roads.slice(0, 2)) {
    if (b.value < 0.8) continue;
    out.push({
      id: `cong-${b.id}`,
      kind: 'congestion',
      title: `${b.label} congestion`,
      severity: Math.min(100, b.value * 100),
      metrics: [['V/C ratio', b.value.toFixed(2)], ['Detail', b.detail]],
      causes: ['Car demand exceeds road capacity', 'Peak-hour concentration'],
      interventions: ['Improve parallel transit service', 'Add road capacity', 'Stagger demand with off-peak service'],
      why: [`V/C ${b.value.toFixed(2)} is above the 0.80 congestion threshold`, b.detail],
      target: { kind: 'road', id: b.id },
    });
  }

  // One entry per district (best-scoring gap wins) so a neighbourhood never
  // appears twice in the ranked list.
  const bestByZone = new Map<string, GapCandidate>();
  for (const g of f.gaps) {
    const prev = bestByZone.get(g.zoneName);
    if (!prev || g.score > prev.score) bestByZone.set(g.zoneName, g);
  }
  for (const g of [...bestByZone.values()].sort((a, b) => b.score - a.score).slice(0, 2)) {
    out.push({
      id: `gap-${g.x}-${g.z}`,
      kind: 'access',
      title: `Transit gap near ${g.zoneName}`,
      severity: Math.min(100, g.score),
      metrics: [
        ['Gap score', g.score.toFixed(0)],
        ['Population nearby', `~${g.population.toLocaleString()}`],
        ['Nearest station', `${g.nearestStationM}m`],
        ['CBD travel', g.cbdMin === null ? 'unreachable' : `${Math.round(g.cbdMin)} min`],
      ],
      causes: g.reasons,
      interventions: ['Extend a metro/rail line', 'Add a station', 'Add feeder bus service'],
      why: [...g.reasons, `Nearest station ${g.nearestStationM}m away`],
      target: null,
    });
  }

  for (const z of f.zones) {
    if (z.popGrowthRate > 0.03 && z.accessScore < 55) {
      out.push({
        id: `growth-${z.id}`,
        kind: 'growth',
        title: `${z.name} outgrowing transit`,
        severity: Math.min(100, z.popGrowthRate * 2000),
        metrics: [
          ['Growth', `+${(z.popGrowthRate * 100).toFixed(1)}%/yr`],
          ['Accessibility', `${z.accessScore.toFixed(0)}/100`],
          ['Population', z.population.toLocaleString()],
        ],
        causes: ['Rapid population growth', 'Weak rapid-transit access'],
        interventions: ['Add rapid transit', 'Increase feeder frequency', 'Reserve corridor capacity'],
        why: [`Growth +${(z.popGrowthRate * 100).toFixed(1)}%/yr outpaces access score ${z.accessScore.toFixed(0)}`],
        target: { kind: 'zone', id: z.id },
      });
    }
  }

  for (const c of f.criticalRoutes.slice(0, 1).concat(f.criticalBridges.slice(0, 1))) {
    if (c.score < 60) continue;
    out.push({
      id: `crit-${c.id}`,
      kind: 'criticality',
      title: `${c.label} is a single point of failure`,
      severity: Math.min(100, c.score),
      metrics: [['Criticality', `${c.score.toFixed(0)}/100`]],
      causes: ['Few alternative routes exist', 'High share of trips depend on it'],
      interventions: ['Build redundant infrastructure', 'Add parallel service'],
      why: [`Criticality ${c.score.toFixed(0)}: an unusually large share of trips depend on it`],
      target: null,
    });
  }

  // Over-service: high frequency, low occupancy routes.
  for (const id of Object.keys(f.routeBoardings)) {
    const occ = (f.routePeakOcc[id] ?? 0) * 100;
    const board = f.routeBoardings[id] ?? 0;
    if (occ < 25 && board > 0 && board < 300) {
      const r = f.routes.find((x) => x.id === id);
      out.push({
        id: `over-${id}`,
        kind: 'overservice',
        title: `${r?.name ?? id} possibly over-served`,
        severity: 30,
        metrics: [['Peak occupancy', `${occ.toFixed(0)}%`], ['Boardings', board.toLocaleString()]],
        causes: ['High frequency relative to demand'],
        interventions: ['Reduce off-peak frequency', 'Reallocate fleet to crowded routes'],
        why: [`Peak occupancy ${occ.toFixed(0)}% with only ${board.toLocaleString()} boardings`],
        target: { kind: 'route', id },
      });
      break; // one is enough to avoid noise
    }
  }

  return out.sort((a, b) => b.severity - a.severity).slice(0, 8);
}
