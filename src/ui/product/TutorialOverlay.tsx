import { useLayoutEffect, useState } from 'react';
import { TUTORIAL_STEPS, type TutorialState } from './tutorial.ts';

interface Props {
  state: TutorialState;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Coach mark pinned to the real control named by the step's data-tour key. */
export default function TutorialOverlay({ state, onNext, onBack, onSkip, onPause, onResume, onExit }: Props) {
  // The measurement is stamped with the step it belongs to, so a stale one is
  // simply ignored: the step shows a centred card when no measurement matches.
  // (Clearing state from the effect would be a synchronous setState in an effect.)
  const [measured, setMeasured] = useState<{ index: number; rect: Rect } | null>(null);
  const step = state.active ? TUTORIAL_STEPS[state.index] : null;
  const rect = measured && measured.index === state.index ? measured.rect : null;

  useLayoutEffect(() => {
    if (!state.active || !step?.target) return;
    const index = state.index;
    const target = step.target;
    const place = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) {
        setMeasured({ index, rect: { x: 0, y: 0, w: 0, h: 0 } });
        return;
      }
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      setMeasured({ index, rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [state.active, state.index, step?.target]);

  if (!state.active || !step) return null;
  const last = state.index === TUTORIAL_STEPS.length - 1;
  const hasRing = rect !== null && rect.w > 0 && rect.h > 0;
  // Card sits below the highlight, or centered when there is no target.
  const cardStyle =
    hasRing
      ? { top: Math.min(window.innerHeight - 240, rect.y + rect.h + 12), left: Math.max(12, Math.min(window.innerWidth - 340, rect.x)) }
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  return (
    <div className="tf-coach-layer" aria-hidden={false}>
      {hasRing && (
        <div
          className="tf-coach-ring"
          style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }}
        />
      )}
      <div className="tf-coach-card" role="dialog" aria-modal="false" aria-label={step.title} style={cardStyle}>
        <p className="tf-hint">Guided tutorial, step {state.index + 1} of {TUTORIAL_STEPS.length}{state.paused ? ', paused' : ''}</p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tf-draft-actions">
          {state.paused ? (
            <button type="button" className="tf-btn small" onClick={onResume}>Resume</button>
          ) : (
            <button type="button" className="tf-btn small" onClick={onPause}>Pause</button>
          )}
          <button type="button" className="tf-btn small" onClick={onSkip}>Skip step</button>
          <button type="button" className="tf-btn small" onClick={onExit}>Exit tour</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="tf-btn small" disabled={state.index === 0} onClick={onBack}>Back</button>
          {last ? (
            <button type="button" className="tf-btn small primary" onClick={onNext}>Finish</button>
          ) : (
            <button type="button" className="tf-btn small primary" onClick={onNext}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
