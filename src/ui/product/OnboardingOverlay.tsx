import { ONBOARDING_STEPS, type OnboardingState } from './onboarding.ts';

interface Props {
  state: OnboardingState;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

/** Six conceptual cards over the live app. Skippable from the first second. */
export default function OnboardingOverlay({ state, onNext, onBack, onSkip, onFinish }: Props) {
  if (!state.active) return null;
  const step = ONBOARDING_STEPS[state.index];
  const last = state.index === ONBOARDING_STEPS.length - 1;
  return (
    <div className="tf-onboard-scrim">
      <div className="tf-onboard-card" role="dialog" aria-modal="true" aria-label={step.title}>
        <div className="tf-onboard-progress" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, i) => (
            <i key={s.id} className={i < state.index ? 'done' : i === state.index ? 'now' : undefined} />
          ))}
        </div>
        <p className="tf-hint">First run · {state.index + 1} of {ONBOARDING_STEPS.length}</p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tf-draft-actions">
          <button type="button" className="tf-btn small" onClick={onSkip}>Skip tour</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="tf-btn small" disabled={state.index === 0} onClick={onBack}>Back</button>
          {last ? (
            <button type="button" className="tf-btn small primary" onClick={onFinish}>Finish</button>
          ) : (
            <button type="button" className="tf-btn small primary" onClick={onNext}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
