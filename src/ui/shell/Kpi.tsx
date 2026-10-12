import Meter, { type MeterTone } from './Meter.tsx';

export type TileTone = 'plain' | 'good' | 'warn' | 'bad';

interface Props {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  meter?: number;
  threshold?: number;
  tone?: TileTone;
}

export default function Kpi({ label, value, unit, sub, meter, threshold, tone = 'plain' }: Props) {
  return (
    <div className={`tf-tile${tone === 'plain' ? '' : ` ${tone}`}`}>
      <span className="tf-tile-label">{label}</span>
      <span className="tf-kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {meter !== undefined && (
        <Meter value={meter} tone={(tone === 'plain' ? 'signal' : tone) as MeterTone} label={label} threshold={threshold} />
      )}
      {sub && <span className="tf-tile-sub">{sub}</span>}
    </div>
  );
}