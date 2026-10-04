// Procedural planning briefs generated from live simulation state.
// Deterministic: same snapshot facts always yield the same briefs.
import type { IncidentConfig } from '../incidents/incidents.ts';
import type { Objective, PlanConstraint } from './objectives.ts';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface FocusTarget {
  kind: 'station' | 'route' | 'road' | 'zone';
  id: string;
}

export interface PlanningBrief {
  id: string;
  title: string;
  difficulty: Difficulty;
  paragraphs: string[];
  objectives: Objective[];
  constraints: PlanConstraint[];
  horizonYears: number;
  incident?: IncidentConfig;
  focus: FocusTarget[];
}

/** Facts distilled from a live snapshot. All values are real. */
export interface BriefFacts {
  transitShare: number;
  avgCongestion: number;
  avgTravelMin: number;
  maxOccupancy: number;
  accessScore: number;
  coveragePct: number;
  opCost: number;
  population: number;
  worstRoute: { id: string; name: string; occ: number } | null;
  worstEdge: { id: string; label: string; vc: number } | null;
  worstBridge: { id: string; label: string; vc: number } | null;
  lowAccessZones: { id: string; name: string; score: number; population: number }[];
  growthZones: { id: string; name: string; popGrowthRate: number; population: number }[];
  airportZone: { id: string; name: string; jobs: number } | null;
  centralStationId: string | null;
  busiestRouteId: string | null;
}

const BUDGET: Record<Difficulty, number> = {
  easy: 150_00_00_000,
  medium: 100_00_00_000,
  hard: 70_00_00_000,
  expert: 45_00_00_000,
};

const HORIZON: Record<Difficulty, number> = { easy: 5, medium: 5, hard: 10, expert: 20 };

function budgetConstraint(d: Difficulty): PlanConstraint {
  return { id: `budget-${d}`, label: `Construction budget < ${BUDGET[d] / 1_00_00_000}Cr`, kind: 'budget', limit: BUDGET[d] };
}

function opConstraint(d: Difficulty, baseOpCost: number): PlanConstraint {
  const limit = Math.round(baseOpCost * (d === 'expert' ? 1.1 : d === 'hard' ? 1.25 : 1.5));
  return { id: `opcost-${d}`, label: `Operating cost < ${limit.toLocaleString()} OCU/day`, kind: 'op-cost', limit };
}

/** Generate all applicable briefs for the given facts and difficulty. */
export function generateBriefs(facts: BriefFacts, difficulty: Difficulty, opCost: number): PlanningBrief[] {
  const out: PlanningBrief[] = [];
  const horizon = HORIZON[difficulty];
  const push = (b: Omit<PlanningBrief, 'difficulty' | 'horizonYears'>) => {
    out.push({ ...b, difficulty, horizonYears: horizon });
  };

  // 1. Transit overcrowding — busiest corridor near capacity.
  if (facts.worstRoute && facts.worstRoute.occ >= (difficulty === 'easy' ? 60 : 70)) {
    const r = facts.worstRoute;
    push({
      id: 'overcrowding',
      title: `${r.name} Overcrowding`,
      paragraphs: [
        `${r.name} is running at ${r.occ.toFixed(0)}% peak occupancy. Denied boardings cascade into longer waits across its stations.`,
        `Goal: bring peak crowding under control within ${horizon} years without breaking the construction budget.`,
      ],
      objectives: [
        { id: 'ov-crowd', title: `Peak crowding on ${r.name} < 85%`, description: 'Relieve the busiest corridor.', category: 'capacity', metric: 'crowd-route', targetId: r.id, op: '<', target: 85, horizonYears: horizon },
        { id: 'ov-wait', title: 'Average wait < 6 min', description: 'Crowding relief should cut waits.', category: 'capacity', metric: 'avg-wait', op: '<', target: 6, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), opConstraint(difficulty, opCost)],
      focus: [{ kind: 'route', id: r.id }],
    });
  }

  // 2. CBD congestion — worst road segment saturated.
  if (facts.worstEdge && facts.worstEdge.vc >= 85) {
    const e = facts.worstEdge;
    push({
      id: 'cbd-congestion',
      title: 'CBD Congestion',
      paragraphs: [
        `${e.label} is saturated at ${e.vc.toFixed(0)}% volume-to-capacity. Car travel times are degrading across the central area.`,
        `Goal: pull drivers onto transit or spread load within ${horizon} years.`,
      ],
      objectives: [
        { id: 'cc-cong', title: 'Peak road congestion < 75%', description: 'Decongest the worst corridor.', category: 'congestion', metric: 'congestion', op: '<', target: 75, horizonYears: horizon },
        { id: 'cc-transit', title: 'Transit share > 55%', description: 'Shift trips onto transit.', category: 'mode-share', metric: 'transit-share', op: '>', target: 55, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), opConstraint(difficulty, opCost)],
      focus: [{ kind: 'road', id: e.id }],
    });
  }

  // 3. Airport expansion — airport zone employment pressure.
  if (facts.airportZone && facts.airportZone.jobs > 8000) {
    const a = facts.airportZone;
    push({
      id: 'airport-expansion',
      title: 'Airport Expansion',
      paragraphs: [
        `${a.name} now supports ${a.jobs.toLocaleString()} jobs and demand keeps climbing. Airport trips are long and car-heavy.`,
        `Goal: give the airport a fast transit connection within ${horizon} years.`,
      ],
      objectives: [
        { id: 'ap-access', title: `${a.name} accessibility > 65`, description: 'Fast airport access.', category: 'accessibility', metric: 'access-zone', targetId: a.id, op: '>', target: 65, horizonYears: horizon },
        { id: 'ap-car', title: 'Car share < 45%', description: 'Cut airport car dependency.', category: 'mode-share', metric: 'car-share', op: '<', target: 45, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), { id: 'stations-cap', label: 'At most 3 new stations', kind: 'stations', limit: 3 }],
      focus: [{ kind: 'zone', id: a.id }],
    });
  }

  // 4. Suburbanization — outer districts outgrowing the core.
  const outerGrowth = facts.growthZones.filter((z) => z.popGrowthRate > 0.02);
  if (outerGrowth.length > 0) {
    const z = outerGrowth[0];
    push({
      id: 'suburbanization',
      title: 'Suburban Growth',
      paragraphs: [
        `${z.name} is growing at ${(z.popGrowthRate * 100).toFixed(1)}%/yr, faster than the core. Its transit links will saturate first.`,
        `Goal: keep outer growth supported over ${horizon} years.`,
      ],
      objectives: [
        { id: 'su-access', title: `${z.name} accessibility > 60`, description: 'Connect the growing edge.', category: 'accessibility', metric: 'access-zone', targetId: z.id, op: '>', target: 60, horizonYears: horizon },
        { id: 'su-pop', title: `Support ${Math.round(z.population * 1.15).toLocaleString()} residents`, description: 'House the projected population.', category: 'growth', metric: 'population', op: '>', target: Math.round(z.population * 1.1), horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), opConstraint(difficulty, opCost)],
      focus: [{ kind: 'zone', id: z.id }],
    });
  }

  // 5. Bridge bottleneck — river crossing with no redundancy.
  if (facts.worstBridge && facts.worstBridge.vc >= 60) {
    const b = facts.worstBridge;
    push({
      id: 'bridge-bottleneck',
      title: 'Bridge Bottleneck',
      paragraphs: [
        `${b.label} carries the river crossing at ${b.vc.toFixed(0)}% V/C. A single failure would split the city.`,
        `Goal: add redundancy or relieve the crossing within ${horizon} years.`,
      ],
      objectives: [
        { id: 'bb-vc', title: `${b.label} V/C < 70%`, description: 'Relieve the crossing.', category: 'congestion', metric: 'road-vc', targetId: b.id, op: '<', target: 70, horizonYears: horizon },
        { id: 'bb-res', title: 'Resilience score > 70', description: 'Prove the fix under failure.', category: 'resilience', metric: 'resilience-score', op: '>', target: 70, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty)],
      focus: [{ kind: 'road', id: b.id }],
    });
  }

  // 6. Network resilience — hardest interchange must survive failure.
  if (facts.centralStationId && (difficulty === 'hard' || difficulty === 'expert')) {
    push({
      id: 'network-resilience',
      title: 'Network Resilience',
      paragraphs: [
        'The network depends on a single interchange. A failure there cascades across every line.',
        `Goal: keep >80% of normal transit capacity during a major interchange failure.`,
      ],
      objectives: [
        { id: 'nr-res', title: 'Resilience score > 80 during failure', description: 'Survive the worst single failure.', category: 'resilience', metric: 'resilience-score', op: '>', target: 80, horizonYears: horizon },
        { id: 'nr-crowd', title: 'Peak crowding < 90% during failure', description: 'No corridor collapses.', category: 'capacity', metric: 'peak-crowding', op: '<', target: 90, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty)],
      focus: [{ kind: 'station', id: facts.centralStationId }],
      incident: {
        id: '', kind: 'station-closure', label: 'Central interchange closure',
        targetStationId: facts.centralStationId,
        startMin: 500, durationMin: 60, recoveryMin: 10, severity01: 0.9,
      },
    });
  }

  // 7. Uneven accessibility — worst district far behind.
  const worst = facts.lowAccessZones[0];
  if (worst && worst.score < 65) {
    push({
      id: 'uneven-access',
      title: 'Uneven Accessibility',
      paragraphs: [
        `${worst.name} scores ${worst.score.toFixed(0)} on accessibility while the city averages ${facts.accessScore.toFixed(0)}. ${worst.population.toLocaleString()} residents are left behind.`,
        `Goal: close the gap within ${horizon} years.`,
      ],
      objectives: [
        { id: 'ua-access', title: `${worst.name} accessibility > 60`, description: 'Lift the worst district.', category: 'accessibility', metric: 'access-zone', targetId: worst.id, op: '>', target: 60, horizonYears: horizon },
        { id: 'ua-city', title: 'City accessibility > 70', description: 'Raise the whole network.', category: 'accessibility', metric: 'accessibility', op: '>', target: 70, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), { id: 'stations-cap', label: 'At most 3 new stations', kind: 'stations', limit: 3 }],
      focus: [{ kind: 'zone', id: worst.id }],
    });
  }

  // Fallback: rapid growth brief is always applicable.
  if (out.length === 0) {
    push({
      id: 'rapid-growth',
      title: 'Rapid Growth',
      paragraphs: [
        `Population is growing faster than transport capacity can absorb. Without investment, crowding and congestion will compound over ${horizon} years.`,
        'Goal: stay ahead of growth.',
      ],
      objectives: [
        { id: 'rg-crowd', title: 'Peak crowding < 90%', description: 'Hold the line on crowding.', category: 'capacity', metric: 'peak-crowding', op: '<', target: 90, horizonYears: horizon },
        { id: 'rg-cong', title: 'Peak road congestion < 80%', description: 'Hold the line on congestion.', category: 'congestion', metric: 'congestion', op: '<', target: 80, horizonYears: horizon },
      ],
      constraints: [budgetConstraint(difficulty), opConstraint(difficulty, opCost)],
      focus: [],
    });
  }

  return out;
}
