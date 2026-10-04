import type { Overlay } from '../../rendering/SceneView.tsx';

export type TravelDest = 'cbd' | 'airport' | 'university' | 'industrial' | 'harbor';

const BASE_ITEMS: { key: Overlay; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'flow', label: 'Flow' },
  { key: 'load', label: 'Load' },
  { key: 'congestion', label: 'Congestion' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'crowding', label: 'Crowding' },
];

const ANALYTICS_ITEMS: { key: Overlay; label: string }[] = [
  { key: 'accessibility', label: 'Access' },
  { key: 'traveltime', label: 'Travel' },
  { key: 'coverage', label: 'Cover' },
  { key: 'bottlenecks', label: 'Limits' },
];

const DESTS: { key: TravelDest; label: string }[] = [
  { key: 'cbd', label: 'CBD' },
  { key: 'airport', label: 'Airport' },
  { key: 'university', label: 'University' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'harbor', label: 'Harbor' },
];

interface Props {
  overlay: Overlay;
  onChange: (o: Overlay) => void;
  travelDest: TravelDest;
  onTravelDest: (d: TravelDest) => void;
  coverageThreshold: number;
  onCoverageThreshold: (m: number) => void;
}

export default function OverlaySwitch({ overlay, onChange, travelDest, onTravelDest, coverageThreshold, onCoverageThreshold }: Props) {
  return (
    <div className="tf-layers">
      <h3>Overlay</h3>
      <div className="tf-speeds" role="group" aria-label="Visualization overlay">
        {BASE_ITEMS.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`tf-btn small${overlay === it.key ? ' active' : ''}`}
            onClick={() => onChange(it.key)}
          >
            {it.label}
          </button>
        ))}
      </div>
      <div className="tf-speeds" role="group" aria-label="Analytics overlay">
        {ANALYTICS_ITEMS.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`tf-btn small${overlay === it.key ? ' active' : ''}`}
            onClick={() => onChange(it.key)}
          >
            {it.label}
          </button>
        ))}
      </div>
      {overlay === 'traveltime' && (
        <div className="tf-speeds" role="group" aria-label="Heatmap destination">
          {DESTS.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`tf-btn small${travelDest === d.key ? ' active' : ''}`}
              onClick={() => onTravelDest(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {overlay === 'coverage' && (
        <div className="tf-speeds" role="group" aria-label="Coverage threshold">
          {[300, 500, 800].map((m) => (
            <button
              key={m}
              type="button"
              className={`tf-btn small${coverageThreshold === m ? ' active' : ''}`}
              onClick={() => onCoverageThreshold(m)}
            >
              {m}m
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
