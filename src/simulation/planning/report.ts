// Structured planning reports built from evaluation results.
// Export as JSON, plain text, or printable HTML (no dependencies).
import { formatCost } from '../scenario/scenario.ts';
import type { CompareRow } from '../scenario/compare.ts';
import type { InterventionSummary } from '../planning/intervention.ts';
import type { ConstraintResult, Objective, ObjectiveResult, PlanConstraint } from '../planning/objectives.ts';
import type { PlanningScore } from '../analytics/impact.ts';

export interface PlanReport {
  title: string;
  briefTitle: string;
  horizonYears: number;
  verdict: 'PASSED' | 'FAILED';
  problem: string[];
  intervention: InterventionSummary;
  objectives: { title: string; value: string; target: string; passed: boolean; progress: number }[];
  constraints: { label: string; value: string; limit: string; passed: boolean }[];
  performance: CompareRow[];
  tradeoffs: { improved: string[]; worsened: string[] };
  cost: { construction: string; operating: string; revenue: string; subsidy: string };
  resilience: CompareRow[] | null;
  score: PlanningScore;
}

export function buildReport(input: {
  title: string;
  briefTitle: string;
  briefParagraphs: string[];
  horizonYears: number;
  objectives: Objective[];
  objectiveResults: ObjectiveResult[];
  constraints: PlanConstraint[];
  constraintResults: ConstraintResult[];
  comparisonRows: CompareRow[];
  resilienceRows: CompareRow[] | null;
  intervention: InterventionSummary;
  constructionCost: number;
  opCost: number;
  revenue: number;
  subsidy: number;
  score: PlanningScore;
}): PlanReport {
  const byId = new Map(input.objectiveResults.map((r) => [r.objectiveId, r]));
  const byConstraint = new Map(input.constraintResults.map((r) => [r.constraintId, r]));
  const objectives = input.objectives.map((o) => {
    const r = byId.get(o.id);
    return {
      title: o.title,
      value: r && r.value !== null ? `${r.value}` : 'n/a',
      target: `${o.op} ${o.target}`,
      passed: r?.passed ?? false,
      progress: r?.progress ?? 0,
    };
  });
  const constraints = input.constraints.map((c) => {
    const r = byConstraint.get(c.id);
    return {
      label: c.label,
      value: r ? `${Math.round(r.value).toLocaleString()}` : 'n/a',
      limit: `≤ ${Math.round(c.limit).toLocaleString()}`,
      passed: r?.passed ?? false,
    };
  });
  const improved: string[] = [];
  const worsened: string[] = [];
  for (const row of input.comparisonRows) {
    if (row.better === null || row.pct === null || row.pct === 0) continue;
    const good = (row.better === 'down' && row.pct < 0) || (row.better === 'up' && row.pct > 0);
    (good ? improved : worsened).push(`${row.label} ${row.delta}`);
  }
  const passed = objectives.every((o) => o.passed) && constraints.every((c) => c.passed);
  return {
    title: input.title,
    briefTitle: input.briefTitle,
    horizonYears: input.horizonYears,
    verdict: passed ? 'PASSED' : 'FAILED',
    problem: [...input.briefParagraphs],
    intervention: input.intervention,
    objectives,
    constraints,
    performance: input.comparisonRows,
    tradeoffs: { improved, worsened },
    cost: {
      construction: formatCost(input.constructionCost),
      operating: `${Math.round(input.opCost).toLocaleString()} OCU/day`,
      revenue: `${Math.round(input.revenue).toLocaleString()} OCU/day`,
      subsidy: `${Math.round(input.subsidy).toLocaleString()} OCU/day`,
    },
    resilience: input.resilienceRows,
    score: input.score,
  };
}

export function reportToJson(report: PlanReport): string {
  return JSON.stringify(report, null, 2);
}

export function reportToText(report: PlanReport): string {
  const lines: string[] = [];
  lines.push(`TRANSITFORGE PLANNING REPORT — ${report.title}`);
  lines.push(`Brief: ${report.briefTitle} · Horizon: ${report.horizonYears}y · Verdict: ${report.verdict}`);
  lines.push('');
  lines.push('PROBLEM');
  for (const p of report.problem) lines.push(`- ${p}`);
  lines.push('');
  lines.push('INTERVENTION');
  for (const l of report.intervention.infra) lines.push(`- ${l}`);
  for (const l of report.intervention.service) lines.push(`- ${l}`);
  for (const l of report.intervention.roads) lines.push(`- ${l}`);
  lines.push('');
  lines.push('OBJECTIVES');
  for (const o of report.objectives) {
    lines.push(`- [${o.passed ? 'x' : ' '}] ${o.title}: ${o.value} (target ${o.target}, progress ${Math.round(o.progress * 100)}%)`);
  }
  lines.push('');
  lines.push('CONSTRAINTS');
  for (const c of report.constraints) lines.push(`- [${c.passed ? 'x' : ' '}] ${c.label}: ${c.value} (limit ${c.limit})`);
  lines.push('');
  lines.push('PERFORMANCE');
  for (const r of report.performance) lines.push(`- ${r.label}: ${r.base} → ${r.mod} (${r.delta})`);
  lines.push('');
  lines.push('TRADEOFFS');
  lines.push(`Improved: ${report.tradeoffs.improved.join('; ') || '—'}`);
  lines.push(`Worsened: ${report.tradeoffs.worsened.join('; ') || '—'}`);
  lines.push('');
  lines.push(`COST: ${report.cost.construction} construction · ${report.cost.operating} operating`);
  lines.push(`FINANCE: ${report.cost.revenue} revenue · ${report.cost.subsidy} subsidy`);
  if (report.resilience) {
    lines.push('');
    lines.push('RESILIENCE');
    for (const r of report.resilience) lines.push(`- ${r.label}: ${r.base} → ${r.mod} (${r.delta})`);
  }
  lines.push('');
  lines.push(`SCORE: ${report.score.total} (${report.score.parts.map((p) => `${p.label} ${p.value}`).join(', ')})`);
  return lines.join('\n');
}

export function reportToHtml(report: PlanReport): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const li = (items: string[]) => items.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title>` +
    `<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}.pass{color:#15803d}.fail{color:#b91c1c}</style></head><body>` +
    `<h1>${esc(report.title)}</h1>` +
    `<p>Brief: ${esc(report.briefTitle)} · Horizon: ${report.horizonYears}y · Verdict: <strong class="${report.verdict === 'PASSED' ? 'pass' : 'fail'}">${report.verdict}</strong></p>` +
    `<h2>Problem</h2><ul>${li(report.problem)}</ul>` +
    `<h2>Intervention</h2><ul>${li([...report.intervention.infra, ...report.intervention.service, ...report.intervention.roads])}</ul>` +
    `<h2>Objectives</h2><ul>${report.objectives.map((o) => `<li class="${o.passed ? 'pass' : 'fail'}">${esc(o.title)}: ${esc(o.value)} (target ${esc(o.target)}, ${Math.round(o.progress * 100)}%)</li>`).join('')}</ul>` +
    `<h2>Constraints</h2><ul>${report.constraints.map((c) => `<li class="${c.passed ? 'pass' : 'fail'}">${esc(c.label)}: ${esc(c.value)} (limit ${esc(c.limit)})</li>`).join('')}</ul>` +
    `<h2>Performance</h2><table><tr><th>Metric</th><th>Base</th><th>Plan</th><th>Change</th></tr>${report.performance.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.base)}</td><td>${esc(r.mod)}</td><td>${esc(r.delta)}</td></tr>`).join('')}</table>` +
    `<h2>Cost</h2><p>${esc(report.cost.construction)} construction · ${esc(report.cost.operating)} operating</p>` +
    `<h2>Finance</h2><p>${esc(report.cost.revenue)} revenue · ${esc(report.cost.subsidy)} subsidy</p>` +
    `<h2>Score: ${report.score.total}</h2><ul>${report.score.parts.map((p) => `<li>${esc(p.label)} ${p.value} × ${Math.round(p.weight * 100)}%</li>`).join('')}</ul>` +
    `</body></html>`;
}
