import { useState } from 'react';
import type { CompareRow } from '../../simulation/scenario/compare.ts';
import type { PlanningScore } from '../../simulation/analytics/impact.ts';
import type { Objective, ObjectiveResult, PlanConstraint, ConstraintResult } from '../../simulation/planning/objectives.ts';
import { metricUnit } from '../../simulation/planning/objectives.ts';
import type { PlanningBrief, Difficulty } from '../../simulation/planning/briefs.ts';
import type { CityProblem } from '../../simulation/planning/problems.ts';
import { recommendFor, type RecContext } from '../../simulation/planning/recommendations.ts';
import type { PlanReport } from '../../simulation/planning/report.ts';
import type { SavedPlan } from '../../simulation/planning/planStore.ts';

export interface SubmittedEvaluation {
  report: PlanReport;
  rows: CompareRow[];
  resilienceRows: CompareRow[] | null;
  score: PlanningScore;
}

export interface OverviewNumbers {
  population: number;
  jobs: number;
  transitDay: number;
  carDay: number;
  transitShare: number;
  congestion: number;
  travelMin: number;
  access: number;
  resilience: number | null;
}

interface Props {
  briefs: PlanningBrief[];
  briefId: string | null;
  onSelectBrief: (id: string | null) => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  objectives: Objective[];
  liveResults: ObjectiveResult[];
  constraints: PlanConstraint[];
  liveConstraints: ConstraintResult[];
  horizonYears: number;
  onHorizon: (y: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  evaluation: SubmittedEvaluation | null;
  overview: OverviewNumbers | null;
  problems: CityProblem[];
  onLocateProblem: (p: CityProblem) => void;
  recCtx: RecContext;
  plans: SavedPlan[];
  onSavePlan: (name: string) => void;
  onLoadPlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  onExportJson: () => void;
  onExportHtml: () => void;
  onResetPlan: () => void;
  hasOps: boolean;
  tutorialSteps: { label: string; done: boolean }[];
  tutorialDismissed: boolean;
  onDismissTutorial: () => void;
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="tf-bar-track" aria-hidden="true">
      <div className="tf-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RowTable({ rows }: { rows: CompareRow[] }) {
  return (
    <table className="tf-compare-table">
      <thead>
        <tr><th>Metric</th><th>Base</th><th>Plan</th><th>Change</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const good = r.better && r.pct !== null && r.pct !== 0 &&
            ((r.better === 'down' && r.pct < 0) || (r.better === 'up' && r.pct > 0));
          const bad = r.better && r.pct !== null && r.pct !== 0 && !good;
          return (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.base}</td>
              <td>{r.mod}</td>
              <td className={good ? 'tf-good' : bad ? 'tf-bad' : ''}>{r.delta}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function PlanningPanel(p: Props) {
  const [problemId, setProblemId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const brief = p.briefs.find((b) => b.id === p.briefId) ?? null;
  const resultById = new Map(p.liveResults.map((r) => [r.objectiveId, r]));
  const constraintById = new Map(p.liveConstraints.map((r) => [r.constraintId, r]));

  return (
    <div className="tf-plan">
      <h3>Planning</h3>

      {p.overview && (
        <div className="tf-overview">
          <div className="tf-stat-row"><dt>Population</dt><dd>{p.overview.population.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Transit/day</dt><dd>{p.overview.transitDay.toLocaleString()} ({p.overview.transitShare.toFixed(0)}%)</dd></div>
          <div className="tf-stat-row"><dt>Car/day</dt><dd>{p.overview.carDay.toLocaleString()}</dd></div>
          <div className="tf-stat-row"><dt>Congestion</dt><dd>{p.overview.congestion.toFixed(2)}</dd></div>
          <div className="tf-stat-row"><dt>Travel</dt><dd>{p.overview.travelMin.toFixed(1)} min</dd></div>
          <div className="tf-stat-row"><dt>Access / Resilience</dt><dd>{p.overview.access.toFixed(0)} / {p.overview.resilience === null ? '—' : p.overview.resilience.toFixed(0)}</dd></div>
        </div>
      )}

      <h4>City problems</h4>
      {p.problems.length === 0 && <p className="tf-hint">No significant problems detected. The city is healthy.</p>}
      <ol className="tf-ranked">
        {p.problems.slice(0, 6).map((pr) => (
          <li key={pr.id}>
            <button type="button" className="tf-link" onClick={() => setProblemId(problemId === pr.id ? null : pr.id)}>
              {pr.severity >= 70 ? '⚠ ' : ''}{pr.title}
            </button>
            {problemId === pr.id && (
              <div className="tf-drill">
                {pr.metrics.map(([k, v]) => (
                  <div className="tf-stat-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
                <p className="tf-hint">Likely causes: {pr.causes.join('; ')}</p>
                {recommendFor(pr, p.recCtx).map((r, i) => (
                  <div key={i} className="tf-draft">
                    <strong>{r.intervention}</strong>
                    <div className="tf-hint">{r.reason}</div>
                    <div className="tf-hint">{r.metrics}</div>
                    <div className="tf-hint">Why? {r.why.join(' · ')}</div>
                  </div>
                ))}
                {pr.target && (
                  <button type="button" className="tf-btn small" onClick={() => p.onLocateProblem(pr)}>
                    Locate on map
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <h4>Brief</h4>
      <div className="tf-speeds" role="group" aria-label="Difficulty">
        {(['easy', 'medium', 'hard', 'expert'] as const).map((d) => (
          <button key={d} type="button" className={`tf-btn small${p.difficulty === d ? ' active' : ''}`} onClick={() => p.onDifficulty(d)}>
            {d}
          </button>
        ))}
      </div>
      <label className="tf-namelabel">
        Planning scenario
        <select value={p.briefId ?? ''} onChange={(e) => p.onSelectBrief(e.target.value || null)}>
          <option value="">— choose a brief —</option>
          {p.briefs.map((b) => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>
      </label>
      {brief && (
        <div className="tf-draft">
          {brief.paragraphs.map((para, i) => <p className="tf-hint" key={i}>{para}</p>)}
          <div className="tf-stat-row"><dt>Horizon</dt><dd>{brief.horizonYears}y</dd></div>
        </div>
      )}

      {brief && (
        <>
          <h4>Objectives (live)</h4>
          {p.objectives.map((o) => {
            const r = resultById.get(o.id);
            return (
              <div key={o.id} className="tf-objective">
                <div className="tf-stat-row">
                  <dt>{r?.passed ? '✓ ' : ''}{o.title}</dt>
                  <dd>{r && r.value !== null ? `${r.value}${metricUnit(o.metric)}` : '—'}</dd>
                </div>
                <Bar value={r?.progress ?? 0} />
                <p className="tf-hint">Target: {o.op} {o.target}{metricUnit(o.metric)} · {Math.round((r?.progress ?? 0) * 100)}%</p>
              </div>
            );
          })}
          <h4>Constraints (live)</h4>
          {p.constraints.map((c) => {
            const r = constraintById.get(c.id);
            return (
              <div className="tf-stat-row" key={c.id}>
                <dt>{r?.passed === false ? '✗ ' : ''}{c.label}</dt>
                <dd>{r ? Math.round(r.value).toLocaleString() : '—'}</dd>
              </div>
            );
          })}
          <div className="tf-speeds" role="group" aria-label="Plan horizon">
            {[0, 1, 5, 10, 20].map((y) => (
              <button key={y} type="button" className={`tf-btn small${p.horizonYears === y ? ' active' : ''}`} onClick={() => p.onHorizon(y)}>
                {y === 0 ? 'Now' : `${y}y`}
              </button>
            ))}
          </div>
          <div className="tf-draft-actions">
            <button type="button" className="tf-btn small primary" disabled={p.submitting || !p.hasOps} onClick={p.onSubmit}>
              {p.submitting ? 'Evaluating…' : 'Submit plan'}
            </button>
            {!confirmReset ? (
              <button type="button" className="tf-btn small" disabled={!p.hasOps} onClick={() => setConfirmReset(true)}>
                Reset plan
              </button>
            ) : (
              <button type="button" className="tf-btn small" onClick={() => { setConfirmReset(false); p.onResetPlan(); }}>
                Confirm reset
              </button>
            )}
          </div>
          {!p.hasOps && <p className="tf-hint">Build or change service first, then submit.</p>}
        </>
      )}

      {p.evaluation && (
        <>
          <h4>Evaluation: {p.evaluation.report.verdict}</h4>
          <RowTable rows={p.evaluation.rows} />
          {p.evaluation.resilienceRows && (
            <>
              <h5>Resilience</h5>
              <RowTable rows={p.evaluation.resilienceRows} />
            </>
          )}
          <h5>Score: {p.evaluation.score.total}</h5>
          <ul className="tf-score-parts">
            {p.evaluation.score.parts.map((s) => (
              <li key={s.label}>{s.label} {s.value} × {Math.round(s.weight * 100)}%</li>
            ))}
          </ul>
          <h5>Intervention</h5>
          <ul className="tf-ranked">
            {[...p.evaluation.report.intervention.infra, ...p.evaluation.report.intervention.service, ...p.evaluation.report.intervention.roads].map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <div className="tf-draft-actions">
            <button type="button" className="tf-btn small" onClick={p.onExportJson}>Export JSON</button>
            <button type="button" className="tf-btn small" onClick={p.onExportHtml}>Print HTML</button>
          </div>
        </>
      )}

      <h4>Saved plans</h4>
      <div className="tf-draft-actions">
        <input
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="Plan name"
          maxLength={48}
          aria-label="Plan name"
        />
        <button type="button" className="tf-btn small" disabled={!planName.trim()} onClick={() => { p.onSavePlan(planName.trim()); setPlanName(''); }}>
          Save current
        </button>
      </div>
      {p.plans.length === 0 && <p className="tf-hint">No saved plans yet.</p>}
      {p.plans.map((plan) => (
        <div key={plan.id} className="tf-draft">
          <div className="tf-inspector-head">
            <strong>{plan.name}</strong>
            <span className="tf-hint">{plan.attempts.length} attempts</span>
          </div>
          <div className="tf-draft-actions">
            <button type="button" className="tf-btn small" onClick={() => p.onLoadPlan(plan.id)}>Open</button>
            <button type="button" className="tf-btn small" onClick={() => p.onDeletePlan(plan.id)}>Delete</button>
          </div>
          {plan.attempts.length > 0 && (
            <table className="tf-compare-table">
              <thead><tr><th>Attempt</th><th>Score</th><th>Result</th></tr></thead>
              <tbody>
                {plan.attempts.map((a, i) => (
                  <tr key={i}>
                    <td>#{i + 1} · {a.horizonYears === 0 ? 'now' : `${a.horizonYears}y`}</td>
                    <td>{a.score}</td>
                    <td className={a.passed ? 'tf-good' : 'tf-bad'}>{a.passed ? 'Passed' : 'Failed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {!p.tutorialDismissed && (
        <>
          <h4>First run</h4>
          <ol className="tf-ranked">
            {p.tutorialSteps.map((s, i) => (
              <li key={i}>{s.done ? '✓ ' : '· '}{s.label}</li>
            ))}
          </ol>
          <button type="button" className="tf-btn small" onClick={p.onDismissTutorial}>Dismiss tutorial</button>
        </>
      )}
      <h4>Shortcuts</h4>
      <p className="tf-hint">Space play/pause · 1/2/3 speed · B build · A analytics · P planning · Esc exit · R reset</p>
    </div>
  );
}
