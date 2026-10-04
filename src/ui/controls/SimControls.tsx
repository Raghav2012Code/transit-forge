import { formatClock } from '../../simulation/index.ts';
import { IconPause, IconPlay, IconReset, IconStep } from '../shell/icons.tsx';

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
  onToggle: () => void;
  onSpeed: (s: Speed) => void;
  onReset: () => void;
  onStep: () => void;
}

export default function SimControls({ playing, speed, tick, timeMinutes, onToggle, onSpeed, onReset, onStep }: Props) {
  return (
    <div className="tf-controls">
      <button
        type="button"
        className="tf-btn primary icon"
        onClick={onToggle}
        aria-label={playing ? 'Pause simulation' : 'Play simulation'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" className="tf-btn icon" onClick={onStep} title="Advance 1 minute" aria-label="Advance 1 minute">
        <IconStep />
      </button>
      <button type="button" className="tf-btn icon" onClick={onReset} title="Reset the day (R)" aria-label="Reset the day">
        <IconReset />
      </button>
      <div className="tf-speeds tf-seg" role="radiogroup" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={speed === s.value}
            className="tf-seg-item"
            onClick={() => onSpeed(s.value)}
            title={`${s.label} speed (${s.value === 1 ? '1' : s.value === 5 ? '2' : '3'})`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className={`tf-clock${playing ? '' : ' paused'}`}>
        <strong>{formatClock(timeMinutes)}</strong>
        <span>t{tick}</span>
      </div>
    </div>
  );
}