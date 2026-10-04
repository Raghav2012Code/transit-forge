import type { Overlay } from '../../rendering/SceneView.tsx';

type Entry =
  | { kind: 'ramp'; title: string; gradient: string; lo: string; hi: string; note?: string }
  | { kind: 'keys'; title: string; rows: { color: string; label: string }[] };

/** Legend keys mirror the exact ramps used by SceneView — no invented scales. */
const LEGENDS: Partial<Record<Overlay, Entry>> = {
  congestion: {
    kind: 'ramp', title: 'Road congestion', lo: 'free', hi: 'severe',
    gradient: 'linear-gradient(90deg, #34d399, #facc15 30%, #fb923c 55%, #ef4444 78%, #991b1b)',
  },
  accessibility: {
    kind: 'ramp', title: 'Accessibility', lo: 'excellent', hi: 'very poor',
    gradient: 'linear-gradient(90deg, #34d399, #a3e635 25%, #facc15 50%, #fb923c 75%, #ef4444)',
  },
  traveltime: {
    kind: 'ramp', title: 'Travel time', lo: 'fast', hi: 'slow',
    gradient: 'linear-gradient(90deg, #34d399, #facc15, #ef4444)', note: 'grey = unreachable',
  },
  coverage: {
    kind: 'ramp', title: 'Covered population', lo: '0%', hi: '100%',
    gradient: 'linear-gradient(90deg, #1e3a8a, #ffffff)',
  },
  popdensity: {
    kind: 'ramp', title: 'Population density', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #1e3a8a, #ffffff)',
  },
  jobdensity: {
    kind: 'ramp', title: 'Job density', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #1e3a8a, #ffffff)',
  },
  development: {
    kind: 'ramp', title: 'Developed share', lo: '0%', hi: '100%',
    gradient: 'linear-gradient(90deg, #475569, #34d399 25%, #facc15 50%, #fb923c 75%, #ef4444)',
  },
  growth: {
    kind: 'ramp', title: 'Population growth', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #14532d, #ffffff)',
  },
  demand: {
    kind: 'ramp', title: 'Trip demand', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #34d399, #facc15, #ef4444)',
  },
  critical: {
    kind: 'ramp', title: 'Criticality', lo: 'redundant', hi: 'single point',
    gradient: 'linear-gradient(90deg, #1e3a8a, #ef4444)',
  },
  load: {
    kind: 'ramp', title: 'Platform load', lo: 'empty', hi: 'over capacity',
    gradient: 'linear-gradient(90deg, #1e3a8a, #34d399 45%, #ef4444)',
  },
  frequency: {
    kind: 'ramp', title: 'Service frequency', lo: 'rare', hi: 'dense',
    gradient: 'linear-gradient(90deg, #14532d, #ffffff)',
  },
  crowding: {
    kind: 'ramp', title: 'Vehicle crowding', lo: 'seated', hi: 'crushed',
    gradient: 'linear-gradient(90deg, #1e3a8a, #fb923c 60%, #ef4444)',
  },
  flow: {
    kind: 'keys', title: 'Line colours', rows: [
      { color: 'var(--mode-metro)', label: 'Metro' },
      { color: 'var(--mode-rail)', label: 'Rail' },
      { color: 'var(--mode-bus)', label: 'Bus' },
    ],
  },
  normal: {
    kind: 'keys', title: 'Line colours', rows: [
      { color: 'var(--mode-metro)', label: 'Metro' },
      { color: 'var(--mode-rail)', label: 'Rail' },
      { color: 'var(--mode-bus)', label: 'Bus' },
    ],
  },
  bottlenecks: {
    kind: 'keys', title: 'Flagged', rows: [
      { color: '#ef4444', label: 'Capacity bottleneck' },
      { color: 'var(--mode-metro)', label: 'Other stations' },
    ],
  },
  status: {
    kind: 'keys', title: 'Network status', rows: [
      { color: '#ef4444', label: 'Suspended / closed' },
      { color: '#fb923c', label: 'Reduced service' },
      { color: 'var(--signal)', label: 'Normal' },
    ],
  },
};

export interface LegendExtras {
  problems: boolean;
  catchment: boolean;
  measure: boolean;
  changes: boolean;
  split: boolean;
}

export default function Legend({ overlay, demandLayer, extras }: {
  overlay: Overlay;
  demandLayer: string;
  extras?: Partial<LegendExtras>;
}) {
  const entry = LEGENDS[overlay];
  const extraRows: { color: string; label: string }[] = [];
  if (extras?.problems) {
    extraRows.push(
      { color: '#ef4444', label: 'Severe problem' },
      { color: '#facc15', label: 'Watch / single point of failure' },
      { color: '#6ea8fe', label: 'Access / growth pressure' },
    );
  }
  if (extras?.catchment) extraRows.push({ color: '#6ea8fe', label: 'Walking catchment' });
  if (extras?.measure) extraRows.push({ color: '#6ea8fe', label: 'Measured distance' });
  if (extras?.changes) {
    extraRows.push(
      { color: '#34d399', label: 'Added infrastructure' },
      { color: '#ef4444', label: 'Removed infrastructure' },
      { color: '#6ea8fe', label: 'Service / fare change' },
    );
  }
  if (extras?.split) extraRows.push({ color: 'var(--signal)', label: 'Left: baseline · right: scenario' });
  if (!entry && extraRows.length === 0) return null;
  const title =
    overlay === 'demand' ? `Demand — ${demandLayer}` : (entry?.title ?? 'Map');
  return (
    <div className="tf-legend">
      <h4>{title}</h4>
      {entry && entry.kind === 'ramp' ? (
        <>
          <div className="tf-ramp" style={{ backgroundImage: entry.gradient }} />
          <div className="tf-ramp-labels">
            <span>{entry.lo}</span>
            <span>{entry.hi}</span>
          </div>
          {entry.note && <div className="tf-ramp-labels"><span>{entry.note}</span></div>}
        </>
      ) : entry ? (
        <div className="tf-legend-rows">
          {entry.rows.map((r) => (
            <div className="tf-legend-row" key={r.label}>
              <span className="tf-swatch" style={{ background: r.color }} />
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {extraRows.length > 0 && (
        <div className="tf-legend-rows">
          {extraRows.map((r) => (
            <div className="tf-legend-row" key={r.label}>
              <span className="tf-swatch" style={{ background: r.color }} />
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}