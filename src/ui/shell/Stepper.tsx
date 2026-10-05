import { IconMinus, IconPlus } from './icons.tsx';

/** A labelled value with a decrease and an increase button; the buttons stop at the limits. */
export default function Stepper({
  label,
  value,
  display,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="tf-stat-row">
      <dt>{label}</dt>
      <dd className="tf-stepper">
        <button
          type="button"
          className="tf-btn icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <IconMinus />
        </button>
        <output aria-label={label}>{display}</output>
        <button
          type="button"
          className="tf-btn icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <IconPlus />
        </button>
      </dd>
    </div>
  );
}
