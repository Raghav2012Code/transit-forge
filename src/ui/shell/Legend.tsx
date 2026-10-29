import type { Overlay } from '../../rendering/SceneView.tsx';
import { getPalette, hexColor as hex, type Theme } from '../../rendering/palette.ts';
import { legendEntries } from './legendEntries.ts';

export interface LegendExtras {
  problems: boolean;
  catchment: boolean;
  measure: boolean;
  changes: boolean;
  split: boolean;
}

export default function Legend({ overlay, demandLayer, extras, note, theme }: {
  overlay: Overlay;
  demandLayer: string;
  /** Colours come from the scene palette, so the legend matches the map. */
  theme: Theme;
  extras?: Partial<LegendExtras>;
  /** One plain sentence on what the lens shows. */
  note?: string;
}) {
  const { condition: C, mark: M } = getPalette(theme);
  const entry = legendEntries(theme)[overlay];
  // Markers are conditions, not lines, so each group is titled by what it
  // marks rather than appended to the line colours.
  const groups: { title: string; rows: { color: string; label: string }[] }[] = [];
  if (extras?.problems) {
    groups.push({
      title: 'Problem markers',
      rows: [
        { color: hex(C.alarm), label: 'Severe problem' },
        { color: hex(M.amber), label: 'Watch, single point of failure' },
        { color: hex(M.blue), label: 'Access or growth pressure' },
      ],
    });
  }
  const tools: { color: string; label: string }[] = [];
  if (extras?.catchment) tools.push({ color: hex(M.blue), label: 'Walking catchment' });
  if (extras?.measure) tools.push({ color: hex(M.blue), label: 'Measured distance' });
  if (extras?.split) tools.push({ color: 'var(--on-ink)', label: 'Left baseline, right scenario' });
  if (tools.length > 0) groups.push({ title: 'Map tools', rows: tools });
  if (extras?.changes) {
    groups.push({
      title: 'Changes in this scenario',
      rows: [
        { color: hex(C.good), label: 'Added infrastructure' },
        { color: hex(C.alarm), label: 'Removed infrastructure' },
        { color: hex(M.blue), label: 'Service or fare change' },
      ],
    });
  }
  if (!entry && groups.length === 0) return null;
  const title =
    overlay === 'demand' ? `Demand — ${demandLayer}` : (entry?.title ?? 'Map');
  return (
    <div className="tf-legend">
      <h2>{title}</h2>
      {note && <p className="tf-legend-note">{note}</p>}
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
