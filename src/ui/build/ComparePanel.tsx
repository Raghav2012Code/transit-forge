import type { CompareRow } from '../../simulation/scenario/compare.ts';
import type { PlanningScore, PopulationImpact } from '../../simulation/analytics/impact.ts';
import type { SimStats } from '../../types/index.ts';

export interface CompareResult {
  rows: CompareRow[];
  base: SimStats;
  mod: SimStats;
  baseScore: PlanningScore;
  modScore: PlanningScore;
  impact: PopulationImpact;
  horizonYears: number;
}

interface Props {
  result: CompareResult | null;
  running: boolean;
  progress: string;
  onRun: (horizonYears: number) => void;
  viewing: 'base' | 'scenario';
  onView: (v: 'base' | 'scenario') => void;
  hasEdits: boolean;
  horizonYears: number;
  onHorizon: (y: number) => void;
}

export default function ComparePanel({ result, running, progress, onRun, viewing, onView, hasEdits, horizonYears, onHorizon }: Props) {
  return (
    <div className="tf-compare">
      <h3>Scenario compare</h3>
      <div className="tf-speeds" role="group" aria-label="View base or scenario">
        <button
          type="button"
          className={`tf-btn small${viewing === 'base' ? ' active' : ''}`}
          onClick={() => onView('base')}
        >
          Base
        </button>
        <button
          type="button"
          className={`tf-btn small${viewing === 'scenario' ? ' active' : ''}`}
          onClick={() => onView('scenario')}
        >
          Scenario
        </button>
      </div>
      <div className="tf-speeds" role="group" aria-label="Comparison horizon">
        {[0, 1, 5, 10, 20].map((y) => (
          <button
            key={y}
            type="button"
            className={`tf-btn small${horizonYears === y ? ' active' : ''}`}
            onClick={() => onHorizon(y)}
          >
            {y === 0 ? 'Now' : `${y}y`}
          </button>
        ))}
      </div>
      <button type="button" className="tf-btn small primary" disabled={!hasEdits || running} onClick={() => onRun(horizonYears)}>
        {running ? `Running… ${progress}` : horizonYears === 0 ? 'Run comparison' : `Run ${horizonYears}y comparison`}
      </button>
      {result && (
        <>
          <table className="tf-compare-table">
            <thead>
              <tr><th>Metric</th><th>Base</th><th>New</th><th>Change</th></tr>
            </thead>
            <tbody>
              {result.rows.map((r) => {
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
          <h5>Score breakdown (new)</h5>
          <ul className="tf-score-parts">
            {result.modScore.parts.map((p) => (
              <li key={p.label}>{p.label} {p.value} × {Math.round(p.weight * 100)}%</li>
            ))}
          </ul>
          <p className="tf-hint">
            {result.impact.improvedPop.toLocaleString()} improved · {result.impact.worsenedPop.toLocaleString()} worsened ·{' '}
            {result.impact.newlyCoveredPop.toLocaleString()} newly covered
          </p>
        </>
      )}
      {!result && !running && (
        <p className="tf-hint">Runs both networks headless (360 ticks, same seed) and diffs real results. Horizons grow both sides first.</p>
      )}
    </div>
  );
}
