// Shared SVG chart primitives (no charting dependency).
import { SERIES } from './seriesColors.ts';

interface LineProps {
  values: number[];
  color?: string;
  height?: number;
  /** Dashed stroke, for the second series on one subject. */
  dashed?: boolean;
  /** Names the series so a pair of charts never relies on colour alone. */
  label?: string;
  /** Screen-reader name when there is no visible caption. */
  ariaLabel?: string;
}

const W = 260;

export function Line({ values, color = SERIES.primary, height = 64, dashed = false, label, ariaLabel }: LineProps) {
  const max = Math.max(0.001, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${height - 4 - (v / max) * (height - 10)}`).join(' ');
  return (
    <figure className="tf-series">
      {label && (
        <figcaption>
          <span
            className="tf-series-key"
            style={{ borderTopColor: color, borderTopStyle: dashed ? 'dashed' : 'solid' }}
            aria-hidden="true"
          />
          {label}
        </figcaption>
      )}
      <svg
        className="tf-chart"
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label ?? ariaLabel ?? 'Trend line'}
      >
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeDasharray={dashed ? '4 3' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}

export function Bars({ values, color }: { values: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(0.001, ...values.map((v) => v.value));
  return (
    <div className="tf-bars">
      {values.map((v) => (
        <div key={v.label} className="tf-bar-row">
          <span title={v.label}>{v.label}</span>
          <div className="tf-bar-track">
            <div className="tf-bar-fill" style={{ width: `${(v.value / max) * 100}%`, background: color }} />
          </div>
          <span>{v.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Two series on one subject, drawn on one shared scale so the gap between them is the real gap.
 * The first is solid ink and the second is dashed and lighter: told apart by weight and dash, not hue.
 */
export function PairLine({
  a,
  b,
  aLabel,
  bLabel,
  height = 64,
}: {
  a: number[];
  b: number[];
  aLabel: string;
  bLabel: string;
  height?: number;
}) {
  const max = Math.max(0.001, ...a, ...b);
  const pts = (values: number[]) =>
    values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${height - 4 - (v / max) * (height - 10)}`).join(' ');
  return (
    <figure className="tf-series">
      <figcaption>
        <span className="tf-series-key" style={{ borderTopColor: SERIES.primary, borderTopStyle: 'solid' }} aria-hidden="true" />
        {aLabel}
        <span className="tf-series-key" style={{ borderTopColor: SERIES.secondary, borderTopStyle: 'dashed', marginLeft: 12 }} aria-hidden="true" />
        {bLabel}
      </figcaption>
      <svg
        className="tf-chart"
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${aLabel} against ${bLabel}`}
      >
        <polyline points={pts(a)} fill="none" stroke={SERIES.primary} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(b)} fill="none" stroke={SERIES.secondary} strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}
