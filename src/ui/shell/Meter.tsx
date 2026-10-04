// Segmented tick meter — the app's signature read-out. Reads like a transit
// line diagram: discrete blocks, never a smooth gradient bar.
export type MeterTone = 'signal' | 'good' | 'warn' | 'bad';

interface Props {
  /** 0..1 */
  value: number;
  ticks?: number;
  tone?: MeterTone;
  /** Draw an outlined marker tick at this 0..1 position (a target/threshold). */
  threshold?: number;
  label: string;
}

export default function Meter({ value, ticks = 12, tone = 'signal', threshold, label }: Props) {
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * ticks);
  const thresh = threshold === undefined ? -1 : Math.max(0, Math.min(ticks - 1, Math.round(threshold * ticks) - 1));
  return (
    <div className={`tf-meter${tone === 'signal' ? '' : ` ${tone}`}`} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      {Array.from({ length: ticks }, (_, i) => (
        <i key={i} className={i < filled ? 'on' : i === thresh ? 'thresh' : undefined} />
      ))}
    </div>
  );
}