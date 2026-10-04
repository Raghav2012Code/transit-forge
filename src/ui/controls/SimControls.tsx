import { formatClock } from '../../simulation/index.ts';

export type Speed = 1 | 5 | 20;

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
      <button type="button" className="tf-btn primary" onClick={onToggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="tf-btn" onClick={onStep} title="Advance 1 minute">
        +1m
      </button>
      <button type="button" className="tf-btn" onClick={onReset}>
        Reset
      </button>
      <div className="tf-speeds" role="group" aria-label="Simulation speed">
        {([1, 5, 20] as Speed[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`tf-btn small${speed === s ? ' active' : ''}`}
            onClick={() => onSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>
      <div className="tf-clock">
        <strong>{formatClock(timeMinutes)}</strong>
        <span>tick {tick}</span>
      </div>
    </div>
  );
}
