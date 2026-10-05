import type { ConstraintResult, Objective, ObjectiveResult, PlanConstraint } from '../../simulation/planning/objectives.ts';
import { metricUnit } from '../../simulation/planning/objectives.ts';
import Meter from '../shell/Meter.tsx';
import Popover from '../shell/Popover.tsx';

interface Props {
  briefTitle: string;
  objectives: Objective[];
  results: ObjectiveResult[];
  constraints: PlanConstraint[];
  constraintResults: ConstraintResult[];
  onOpenPlan: () => void;
}

/**
 * Your goals, wherever you are. The count is on the map in every mode, so a
 * change in Build or a disruption in Disrupt can be judged against the brief
 * without a trip to Plan; the list opens right here.
 */
export default function ObjectivesChip({ briefTitle, objectives, results, constraints, constraintResults, onOpenPlan }: Props) {
  const met = results.filter((r) => r.passed).length;
  const broken = constraintResults.filter((r) => !r.passed).length;
  const allMet = objectives.length > 0 && met === objectives.length && broken === 0;
  const tone = broken > 0 ? 'bad' : allMet ? 'good' : '';

  return (
    <Popover
      label={`Objectives for ${briefTitle}`}
      align="end"
      trigger={(props, open) => (
        <button type="button" className={`tf-objectives${tone ? ` ${tone}` : ''}${open ? ' open' : ''}`} {...props}>
          <strong>{met} of {objectives.length}</strong>
          <span>objectives met</span>
          {broken > 0 && <span className="tf-objectives-flag">{broken === 1 ? 'A limit is broken' : `${broken} limits broken`}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="tf-objectives-list">
          <h3>{briefTitle}</h3>
          <ul>
            {objectives.map((o) => {
              const r = results.find((x) => x.objectiveId === o.id);
              const unit = metricUnit(o.metric);
              return (
                <li key={o.id}>
                  <div className="tf-objectives-row">
                    <span>{o.title}</span>
                    <span className={`tf-objectives-state${r?.passed ? ' met' : ''}`}>{r?.passed ? 'Met' : 'Not yet'}</span>
                  </div>
                  <Meter value={r?.progress ?? 0} tone={r?.passed ? 'good' : 'signal'} label={`${o.title} progress`} />
                  <span className="tf-hint">
                    Now {r && r.value !== null ? `${r.value}${unit}` : 'unknown'}, target {o.op} {o.target}{unit}
                  </span>
                </li>
              );
            })}
          </ul>
          {constraints.length > 0 && (
            <>
              <h4>Limits</h4>
              <ul>
                {constraints.map((c) => {
                  const r = constraintResults.find((x) => x.constraintId === c.id);
                  return (
                    <li key={c.id}>
                      <div className="tf-objectives-row">
                        <span>{c.label}</span>
                        <span className={`tf-objectives-state${r?.passed === false ? ' broken' : ' met'}`}>
                          {r?.passed === false ? 'Broken' : 'Within'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <button
            type="button"
            className="tf-btn small"
            onClick={() => {
              close();
              onOpenPlan();
            }}
          >
            Open Plan
          </button>
        </div>
      )}
    </Popover>
  );
}
