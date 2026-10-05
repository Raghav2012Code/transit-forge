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
    gradient: 'linear-gradient(90deg, #dfe7f5, #1e3a8a)',
  },
  popdensity: {
    kind: 'ramp', title: 'Population density', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #dfe7f5, #1e3a8a)',
  },
  jobdensity: {
    kind: 'ramp', title: 'Job density', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #dfe7f5, #1e3a8a)',
  },
  development: {
    kind: 'ramp', title: 'Developed share', lo: '0%', hi: '100%',
    gradient: 'linear-gradient(90deg, #9aa3b2, #34d399 25%, #facc15 50%, #fb923c 75%, #ef4444)',
  },
  growth: {
    kind: 'ramp', title: 'Population growth', lo: 'low', hi: 'max',
    gradient: 'linear-gradient(90deg, #dcefe3, #14532d)',
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
    gradient: 'linear-gradient(90deg, #dcefe3, #14532d)',
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
      { color: 'var(--line-green)', label: 'Normal' },
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
  // Markers are conditions, not lines, so each group is titled by what it
  // marks rather than appended to the line colours.
  const groups: { title: string; rows: { color: string; label: string }[] }[] = [];
  if (extras?.problems) {
    groups.push({
      title: 'Problem markers',
      rows: [
        { color: '#ef4444', label: 'Severe problem' },
        { color: '#d48806', label: 'Watch, single point of failure' },
        { color: '#1b6fc4', label: 'Access or growth pressure' },
      ],
    });
  }
  const tools: { color: string; label: string }[] = [];
  if (extras?.catchment) tools.push({ color: '#1b6fc4', label: 'Walking catchment' });
  if (extras?.measure) tools.push({ color: '#1b6fc4', label: 'Measured distance' });
  if (extras?.split) tools.push({ color: 'var(--on-ink)', label: 'Left baseline, right scenario' });
  if (tools.length > 0) groups.push({ title: 'Map tools', rows: tools });
  if (extras?.changes) {
    groups.push({
      title: 'Changes in this scenario',
      rows: [
        { color: '#34d399', label: 'Added infrastructure' },
        { color: '#ef4444', label: 'Removed infrastructure' },
        { color: '#1b6fc4', label: 'Service or fare change' },
      ],
    });
  }
  if (!entry && groups.length === 0) return null;
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
      {groups.map((g) => (
        <div className="tf-legend-group" key={g.title}>
          <h5>{g.title}</h5>
          <div className="tf-legend-rows">
            {g.rows.map((r) => (
              <div className="tf-legend-row" key={r.label}>
                <span className="tf-swatch" style={{ background: r.color }} />
                <span>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}