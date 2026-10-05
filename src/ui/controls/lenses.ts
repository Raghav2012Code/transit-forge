import type { Overlay } from '../../rendering/SceneView.tsx';

export type TravelDest = 'cbd' | 'airport' | 'university' | 'industrial' | 'harbor';
export type DemandLayer = 'origins' | 'destinations' | 'work' | 'education' | 'transit' | 'car';

export interface LensItem {
  key: Overlay;
  label: string;
}

/** Every lens, grouped by the question it answers. */
export const LENS_GROUPS: { title: string; items: LensItem[] }[] = [
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

/** The lenses worth one click; the rest live under "More". */
export const PRIMARY_LENSES: readonly Overlay[] = ['normal', 'flow', 'load', 'crowding', 'congestion'];

export function lensLabel(overlay: Overlay): string {
  for (const g of LENS_GROUPS) {
    const hit = g.items.find((i) => i.key === overlay);
    if (hit) return hit.label;
  }
  return 'Normal';
}

/** What each lens shows, in plain words. Mirrors the ramps in the map legend. */
export const LENS_NOTE: Partial<Record<Overlay, string>> = {
  normal: 'Lines in their own colours, with nothing laid over the city.',
  flow: 'Lines darken as they fill, and arrows show the direction of travel.',
  load: 'Stations coloured by how full the platform is, from empty to over capacity.',
  frequency: 'Lines coloured by how often service runs, from rare to dense.',
  crowding: 'Vehicles coloured by how full they are, from seated to crushed.',
  status: 'Suspended, reduced and normal service. Useful while disruptions are running.',
  accessibility: 'Districts coloured by how easily residents reach jobs and services by transit.',
  traveltime: 'Districts coloured by transit travel time to the destination chosen here.',
  coverage: 'Districts coloured by the share of residents within walking distance of a station.',
  bottlenecks: 'Stations and routes flagged where capacity is the limit.',
  critical: 'Links the network depends on, from redundant to a single point of failure.',
  congestion: 'Roads coloured by traffic against capacity, from free-flowing to severe.',
  popdensity: 'Districts coloured by resident population per area.',
  jobdensity: 'Districts coloured by jobs per area.',
  development: 'Districts coloured by how much of their land is built up.',
  growth: 'Districts coloured by expected population growth.',
  demand: 'Districts coloured by trip demand for the layer chosen here.',
};

export const DEMAND_LAYERS: { key: DemandLayer; label: string }[] = [
  { key: 'origins', label: 'Origins' },
  { key: 'destinations', label: 'Destinations' },
  { key: 'work', label: 'Work' },
  { key: 'education', label: 'Education' },
  { key: 'transit', label: 'Transit' },
  { key: 'car', label: 'Car' },
];

export const TRAVEL_DESTS: { key: TravelDest; label: string }[] = [
  { key: 'cbd', label: 'CBD' },
  { key: 'airport', label: 'Airport' },
  { key: 'university', label: 'University' },
  { key: 'industrial', label: 'Industry' },
  { key: 'harbor', label: 'Harbor' },
];

export const WALK_STEPS = [300, 500, 800] as const;
