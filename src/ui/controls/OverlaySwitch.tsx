import type { Overlay } from '../../rendering/SceneView.tsx';

export type TravelDest = 'cbd' | 'airport' | 'university' | 'industrial' | 'harbor';
export type DemandLayer = 'origins' | 'destinations' | 'work' | 'education' | 'transit' | 'car';

interface Item {
  key: Overlay;
  label: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Network',
    items: [
      { key: 'normal', label: 'Normal' },
      { key: 'flow', label: 'Flow' },
      { key: 'load', label: 'Load' },
      { key: 'frequency', label: 'Freq' },
      { key: 'crowding', label: 'Crowd' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    title: 'Access analytics',
    items: [
      { key: 'accessibility', label: 'Access' },
      { key: 'traveltime', label: 'Travel' },
      { key: 'coverage', label: 'Cover' },
      { key: 'bottlenecks', label: 'Limits' },
      { key: 'critical', label: 'Critical' },
    ],
  },
  {
    title: 'City',
    items: [
      { key: 'congestion', label: 'Congestion' },
      { key: 'popdensity', label: 'Pop' },
      { key: 'jobdensity', label: 'Jobs' },
      { key: 'development', label: 'Devel' },
      { key: 'growth', label: 'Growth' },
      { key: 'demand', label: 'Demand' },
    ],
  },
];

const DEMAND_LAYERS: { key: DemandLayer; label: string }[] = [
  { key: 'origins', label: 'Origins' },
  { key: 'destinations', label: 'Dest' },
  { key: 'work', label: 'Work' },
  { key: 'education', label: 'Edu' },
  { key: 'transit', label: 'Transit' },
  { key: 'car', label: 'Car' },
];

const DESTS: { key: TravelDest; label: string }[] = [
  { key: 'cbd', label: 'CBD' },
  { key: 'airport', label: 'Airport' },
  { key: 'university', label: 'Univ' },
  { key: 'industrial', label: 'Industry' },
  { key: 'harbor', label: 'Harbor' },
];

interface Props {
  overlay: Overlay;
  onChange: (o: Overlay) => void;
  travelDest: TravelDest;
  onTravelDest: (d: TravelDest) => void;
  coverageThreshold: number;
  onCoverageThreshold: (m: number) => void;
  demandLayer: DemandLayer;
  onDemandLayer: (l: DemandLayer) => void;
}

function Seg<T extends string>({
  label,
  items,
  active,
  onPick,
}: {
  label: string;
  items: { key: T; label: string }[];
  active: T;
  onPick: (k: T) => void;
}) {
  return (
    <div className="tf-overlay-group">
      <span className="tf-overlay-group-label">{label}</span>
      <div className="tf-seg wrap" role="radiogroup" aria-label={label}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={active === it.key}
            className="tf-seg-item"
            onClick={() => onPick(it.key)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OverlaySwitch({ overlay, onChange, travelDest, onTravelDest, coverageThreshold, onCoverageThreshold, demandLayer, onDemandLayer }: Props) {
  return (
    <div className="tf-layers">
      <h3>Overlay</h3>
      {GROUPS.map((g) => (
        <Seg key={g.title} label={g.title} items={g.items} active={overlay} onPick={onChange} />
      ))}
      {overlay === 'traveltime' && (
        <Seg label="Destination" items={DESTS} active={travelDest} onPick={onTravelDest} />
      )}
      {overlay === 'demand' && (
        <Seg label="Demand layer" items={DEMAND_LAYERS} active={demandLayer} onPick={onDemandLayer} />
      )}
      {overlay === 'coverage' && (
        <Seg
          label="Walking distance"
          items={([300, 500, 800].map((m) => ({ key: String(m), label: `${m} m` })) as { key: string; label: string }[])}
          active={String(coverageThreshold)}
          onPick={(k) => onCoverageThreshold(Number(k))}
        />
      )}
    </div>
  );
}