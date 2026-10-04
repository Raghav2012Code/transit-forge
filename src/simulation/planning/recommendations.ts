// Rule-based planning recommendations. Every rule states the metric that
// triggered it and a Why explanation. Deterministic; no LLM.
import type { CityProblem } from './problems.ts';

export interface Recommendation {
  intervention: string;
  reason: string;
  metrics: string;
  area: string;
  why: string[];
}

/** Metrics the rules can read. All real, all from the current snapshot. */
export interface RecContext {
  routePeakOcc: Record<string, number>;
  routeHeadway: Record<string, number>;
  routeBoardings: Record<string, number>;
  edgeVC: Record<string, number>;
  zoneAccess: Record<string, number>;
  zoneGrowth: Record<string, number>;
  transitAccessibility: number;
  criticalRoutes: { id: string; label: string; score: number }[];
  criticalBridges: { id: string; label: string; score: number }[];
}

export function recommendFor(problem: CityProblem, ctx: RecContext): Recommendation[] {
  const out: Recommendation[] = [];
  const area = problem.title;
  if (problem.kind === 'crowding' && problem.target?.kind === 'route') {
    const id = problem.target.id;
    const occ = (ctx.routePeakOcc[id] ?? 0) * 100;
    const hw = ctx.routeHeadway[id] ?? 10;
    if (occ > 95) {
      out.push({
        intervention: 'Increase frequency or vehicle capacity',
        reason: `Peak occupancy ${occ.toFixed(0)}% — vehicles leave passengers behind.`,
        metrics: `peak occupancy ${occ.toFixed(0)}%, headway ${hw.toFixed(0)} min`,
        area,
        why: [
          `Peak occupancy ${occ.toFixed(0)}% is above the 95% critical threshold`,
          `At ${hw.toFixed(0)} min headways each vehicle must absorb the full platform queue`,
          `Denied boardings compound into longer average waits`,
        ],
      });
    } else if (occ > 85) {
      out.push({
        intervention: 'Add parallel service or an express overlay',
        reason: `Peak occupancy ${occ.toFixed(0)}% leaves no headroom for growth.`,
        metrics: `peak occupancy ${occ.toFixed(0)}%`,
        area,
        why: [
          `Peak occupancy ${occ.toFixed(0)}% exceeds the 85% comfort threshold`,
          `Any demand increase will push it into denied boardings`,
        ],
      });
    }
  }
  if (problem.kind === 'congestion' && problem.target?.kind === 'road') {
    const id = problem.target.id;
    const vc = ctx.edgeVC[id] ?? 0;
    if (vc > 0.8 && ctx.transitAccessibility > 60) {
      out.push({
        intervention: 'Improve parallel transit service instead of widening',
        reason: `V/C ${vc.toFixed(2)} with good transit access (${ctx.transitAccessibility.toFixed(0)}) nearby — drivers have somewhere to go.`,
        metrics: `V/C ${vc.toFixed(2)}, transit access ${ctx.transitAccessibility.toFixed(0)}`,
        area,
        why: [
          `V/C ${vc.toFixed(2)} exceeds the 0.80 congestion threshold`,
          `Transit accessibility ${ctx.transitAccessibility.toFixed(0)} means mode shift is plausible`,
          `Induced demand makes widening alone a weak fix here`,
        ],
      });
    } else if (vc > 0.8) {
      out.push({
        intervention: 'Add road capacity or a parallel transit link',
        reason: `V/C ${vc.toFixed(2)} with weak transit alternatives.`,
        metrics: `V/C ${vc.toFixed(2)}`,
        area,
        why: [`V/C ${vc.toFixed(2)} exceeds the 0.80 congestion threshold`, `Transit access is too weak to absorb diverted drivers alone`],
      });
    }
  }
  if (problem.kind === 'access') {
    out.push({
      intervention: 'Extend rapid transit or add feeder service',
      reason: problem.why[0] ?? 'Low accessibility with real demand nearby.',
      metrics: problem.metrics.map(([k, v]) => `${k} ${v}`).join(' · '),
      area,
      why: [...problem.why, 'Rapid transit within walking distance converts these trips from cars'],
    });
  }
  if (problem.kind === 'growth') {
    out.push({
      intervention: 'Reserve corridor capacity ahead of growth',
      reason: problem.why[0] ?? 'Growth outpaces access.',
      metrics: problem.metrics.map(([k, v]) => `${k} ${v}`).join(' · '),
      area,
      why: [...problem.why, 'Building after saturation costs more and disrupts more'],
    });
  }
  if (problem.kind === 'criticality') {
    out.push({
      intervention: 'Build redundant infrastructure',
      reason: problem.why[0] ?? 'Single point of failure.',
      metrics: problem.metrics.map(([k, v]) => `${k} ${v}`).join(' · '),
      area,
      why: [...problem.why, 'Redundancy turns a network-wide failure into a local delay'],
    });
  }
  if (problem.kind === 'overservice') {
    out.push({
      intervention: 'Trim off-peak frequency and reallocate fleet',
      reason: problem.why[0] ?? 'Service exceeds demand.',
      metrics: problem.metrics.map(([k, v]) => `${k} ${v}`).join(' · '),
      area,
      why: [...problem.why, 'Those vehicle-hours cut more waiting on crowded routes'],
    });
  }
  return out;
}
