import { formatClock } from '../../simulation/index.ts';
import { IconPause, IconPlay, IconReset, IconStep, IconStop } from '../shell/icons.tsx';

export type Speed = 1 | 5 | 20;

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 5, label: '5×' },
  { value: 20, label: '20×' },
];

interface Props {
  playing: boolean;
  speed: Speed;
  tick: number;
  timeMinutes: number;
  /** A replay is rebuilding the day; the controls reduce to stop. */
  replaying?: boolean;
  /** Running to a minute: the loop temporarily boosts to 20×, so the radios say so. */
  runTarget?: number | null;
  onToggle: () => void;
  onStop?: () => void;
  onSpeed: (s: Speed) => void;
  onReset: () => void;
  onStep: () => void;
}

export default function SimControls({
  playing,
  speed,
  tick,
  timeMinutes,
  replaying = false,
  runTarget = null,
  onToggle,
  onStop,
  onSpeed,
  onReset,
  onStep,
}: Props) {
  // A run-to-a-time always runs at 20×; say so instead of showing a speed the
  // loop is not using.
  const shownSpeed = runTarget !== null ? 20 : speed;
  return (
    <div className="tf-controls">
      <button
        type="button"
        className="tf-btn primary icon"
        onClick={replaying ? onStop : onToggle}
        aria-label={replaying ? 'Stop replaying' : playing ? 'Pause simulation' : 'Play simulation'}
        title={replaying ? 'Stop replaying (Esc)' : playing ? 'Pause (Space)' : 'Play (Space)'}
        data-tour="sim-play"
      >
        {replaying ? <IconStop /> : playing ? <IconPause /> : <IconPlay />}
      </button>
      <button
        type="button"
        className="tf-btn icon"
        onClick={onStep}
        title="Advance 1 minute"
        aria-label="Advance 1 minute"
        disabled={replaying}
      >
        <IconStep />
      </button>
      <button
        type="button"
        className="tf-btn icon"
        onClick={onReset}
        title="Reset the day (R)"
        aria-label="Reset the day"
        disabled={replaying}
      >
        <IconReset />
      </button>
      <div className="tf-speeds tf-seg" role="radiogroup" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={shownSpeed === s.value}
            className="tf-seg-item"
            disabled={replaying}
            onClick={() => onSpeed(s.value)}
            title={
              runTarget !== null
                ? `Running to the target at ${s.label}; choosing a speed stops the run`
                : `${s.label} speed (${s.value === 1 ? '1' : s.value === 5 ? '2' : '3'})`
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className={`tf-clock${playing || replaying ? '' : ' paused'}`}>
        <strong>{formatClock(timeMinutes)}</strong>
        <span>t{tick}</span>
      </div>
    </div>
  );
}
