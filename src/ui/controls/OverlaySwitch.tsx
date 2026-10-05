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
      { key: 'frequency', label: 'Frequency' },
      { key: 'crowding', label: 'Crowding' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    title: 'Reach and weak points',
    items: [
      { key: 'accessibility', label: 'Accessibility' },
      { key: 'traveltime', label: 'Travel time' },
      { key: 'coverage', label: 'Coverage' },
      { key: 'bottlenecks', label: 'Bottlenecks' },
      { key: 'critical', label: 'Critical links' },
    ],
  },
  {
    title: 'City',
    items: [
      { key: 'congestion', label: 'Congestion' },
      { key: 'popdensity', label: 'Population' },
      { key: 'jobdensity', label: 'Jobs' },
      { key: 'development', label: 'Development' },
      { key: 'growth', label: 'Growth' },
      { key: 'demand', label: 'Trip demand' },
    ],
  },
];

const DEMAND_LAYERS: { key: DemandLayer; label: string }[] = [
  { key: 'origins', label: 'Origins' },
  { key: 'destinations', label: 'Destinations' },
  { key: 'work', label: 'Work' },
  { key: 'education', label: 'Education' },
  { key: 'transit', label: 'Transit' },
  { key: 'car', label: 'Car' },
];

const DESTS: { key: TravelDest; label: string }[] = [
  { key: 'cbd', label: 'CBD' },
  { key: 'airport', label: 'Airport' },
  { key: 'university', label: 'University' },
  { key: 'industrial', label: 'Industry' },
  { key: 'harbor', label: 'Harbor' },
];

/** What each overlay shows, in plain words. Mirrors the ramps in the map legend. */
const OVERLAY_NOTE: Partial<Record<Overlay, string>> = {
  normal: 'Lines in their own colours, with nothing laid over the city.',
  flow: 'Lines warm up as they fill, and arrows show the direction of travel.',
  load: 'Stations coloured by how full the platform is, from empty to over capacity.',
  frequency: 'Stations coloured by how often service arrives, from rare to dense.',
  crowding: 'Vehicles coloured by how full they are, from seated to crushed.',
  status: 'Suspended, reduced and normal service. Useful while disruptions are running.',
  accessibility: 'Districts coloured by how easily residents reach jobs and services by transit.',
  traveltime: 'Districts coloured by transit travel time to the destination chosen below.',
  coverage: 'Districts coloured by the share of residents within walking distance of a station.',
  bottlenecks: 'Stations and routes flagged where capacity is the limit.',
  critical: 'Links the network depends on, from redundant to a single point of failure.',
  congestion: 'Roads coloured by traffic against capacity, from free-flowing to severe.',
  popdensity: 'Districts coloured by resident population per area.',
  jobdensity: 'Districts coloured by jobs per area.',
  development: 'Districts coloured by how much of their land is built up.',
  growth: 'Districts coloured by expected population growth.',
  demand: 'Districts coloured by trip demand for the layer chosen below.',
};

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
    <div className="tf-layers" data-tour="overlays">
      <h3>Overlay</h3>
      {OVERLAY_NOTE[overlay] && <p className="tf-hint" aria-live="polite">{OVERLAY_NOTE[overlay]}</p>}
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
